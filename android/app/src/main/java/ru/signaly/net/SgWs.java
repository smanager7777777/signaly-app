package ru.signaly.net;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** СИГНАЛЫ: WebSocket (RFC 6455) без внешних библиотек — сервер центра и клиент телефона.
 *  Только текстовые кадры, ping/pong, close. Хватает для локальной сети игры. */
public final class SgWs {
  private SgWs() {}

  static final String GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
  static final int MAX_FRAME = 8 * 1024 * 1024;   // фото в чате
  static final SecureRandom RND = new SecureRandom();

  /** Подготовка сокета до подключения (Android: привязать к сети Wi-Fi в обход VPN и мобильных данных). */
  public interface SocketPrep { void prep(Socket s, String host); }

  public interface Handler {
    void onOpen(Conn c);
    void onText(Conn c, String text);
    void onClose(Conn c);
  }

  /* ---------- одно соединение (общее для сервера и клиента) ---------- */
  public static class Conn {
    final Socket sock;
    final InputStream in;
    final OutputStream out;
    final boolean mask;          // клиент маскирует кадры, сервер — нет
    volatile boolean open = true;
    volatile long lastIn = System.currentTimeMillis();
    public final String remote;
    public Object tag;           // кто это (заполняет центр)

    Conn(Socket s, InputStream in, boolean mask) throws IOException {
      this.sock = s;
      this.in = in;
      this.out = s.getOutputStream();
      this.mask = mask;
      this.remote = String.valueOf(s.getRemoteSocketAddress());
    }

    public boolean isOpen() { return open; }

    public void send(String text) {
      if (!open) return;
      try { frame(1, text.getBytes(StandardCharsets.UTF_8)); } catch (IOException e) { close(); }
    }

    void frame(int op, byte[] data) throws IOException {
      ByteArrayOutputStream b = new ByteArrayOutputStream(data.length + 14);
      b.write(0x80 | op);
      int m = mask ? 0x80 : 0;
      if (data.length < 126) b.write(m | data.length);
      else if (data.length < 65536) { b.write(m | 126); b.write(data.length >> 8); b.write(data.length & 255); }
      else {
        b.write(m | 127);
        for (int k = 7; k >= 0; k--) b.write((int) (((long) data.length >> (8 * k)) & 255));
      }
      if (mask) {
        byte[] key = new byte[4];
        RND.nextBytes(key);
        b.write(key);
        byte[] d = data.clone();
        for (int k = 0; k < d.length; k++) d[k] ^= key[k & 3];
        b.write(d);
      } else b.write(data);
      synchronized (this) { out.write(b.toByteArray()); out.flush(); }
    }

    public void ping() {
      try { frame(9, new byte[0]); } catch (IOException e) { close(); }
    }

    public void close() {
      if (!open) return;
      open = false;
      try { frame(8, new byte[0]); } catch (IOException ignored) { /* уже закрыто */ }
      try { sock.close(); } catch (IOException ignored) { /* уже закрыто */ }
    }

    /** Читает кадры, пока соединение живо. Текст → handler. */
    void loop(Handler h) {
      ByteArrayOutputStream msg = new ByteArrayOutputStream();
      int msgOp = 0;
      try {
        while (open) {
          int b0;
          try { b0 = in.read(); } catch (SocketTimeoutException t) {
            if (System.currentTimeMillis() - lastIn > 25000) break;   // молчит 25 с (ответа на ping нет) — считаем, что пропал
            ping();
            continue;
          }
          if (b0 < 0) break;
          int b1 = readByte();
          boolean fin = (b0 & 0x80) != 0;
          int op = b0 & 15;
          long len = b1 & 127;
          if (len == 126) len = (readByte() << 8) | readByte();
          else if (len == 127) { len = 0; for (int k = 0; k < 8; k++) len = (len << 8) | readByte(); }
          if (len > MAX_FRAME) break;
          byte[] key = null;
          if ((b1 & 0x80) != 0) { key = new byte[4]; readFully(key); }
          byte[] data = new byte[(int) len];
          readFully(data);
          if (key != null) for (int k = 0; k < data.length; k++) data[k] ^= key[k & 3];
          lastIn = System.currentTimeMillis();
          if (op == 8) break;
          if (op == 9) { frame(10, data); continue; }
          if (op == 10) continue;
          if (op == 1 || op == 2) { msg.reset(); msgOp = op; }
          if (op == 0 || op == 1 || op == 2) {
            msg.write(data);
            if (msg.size() > MAX_FRAME) break;
            if (fin) {
              if (msgOp == 1) h.onText(this, new String(msg.toByteArray(), StandardCharsets.UTF_8));
              msg.reset();
            }
          }
        }
      } catch (IOException ignored) {
        /* соединение оборвалось */
      } catch (RuntimeException e) {
        e.printStackTrace();
      } finally {
        close();
        h.onClose(this);
      }
    }

    int readByte() throws IOException {
      while (true) {
        try {
          int b = in.read();
          if (b < 0) throw new IOException("конец потока");
          return b;
        } catch (SocketTimeoutException t) { /* внутри кадра ждём дальше */ }
      }
    }

    void readFully(byte[] d) throws IOException {
      int off = 0;
      while (off < d.length) {
        int n;
        try { n = in.read(d, off, d.length - off); } catch (SocketTimeoutException t) { continue; }
        if (n < 0) throw new IOException("конец потока");
        off += n;
      }
    }
  }

  /* ---------- сервер ---------- */
  public static class Server {
    final Handler h;
    ServerSocket ss;
    volatile boolean running;
    final List<Conn> conns = new ArrayList<>();
    public String statusPage = "SIGNALY CENTER";

    public Server(Handler h) { this.h = h; }

    public void start(int port) throws IOException {
      ss = new ServerSocket();
      ss.setReuseAddress(true);
      ss.bind(new InetSocketAddress(port));
      running = true;
      Thread t = new Thread(this::acceptLoop, "sg-accept");
      t.setDaemon(true);
      t.start();
    }

    public int port() { return ss == null ? 0 : ss.getLocalPort(); }

    public void stop() {
      running = false;
      try { if (ss != null) ss.close(); } catch (IOException ignored) { /* уже */ }
      List<Conn> copy;
      synchronized (conns) { copy = new ArrayList<>(conns); }
      for (Conn c : copy) c.close();
    }

    void acceptLoop() {
      while (running) {
        try {
          final Socket s = ss.accept();
          Thread t = new Thread(() -> serve(s), "sg-conn");
          t.setDaemon(true);
          t.start();
        } catch (IOException e) {
          if (!running) return;
        }
      }
    }

    void serve(Socket s) {
      try {
        s.setTcpNoDelay(true);
        s.setSoTimeout(8000);
        BufferedInputStream in = new BufferedInputStream(s.getInputStream());
        List<String> head = readHead(in);
        if (head.isEmpty()) { s.close(); return; }
        String key = null;
        boolean upgrade = false;
        for (String line : head) {
          String low = line.toLowerCase(Locale.ROOT);
          if (low.startsWith("sec-websocket-key:")) key = line.substring(18).trim();
          if (low.startsWith("upgrade:") && low.contains("websocket")) upgrade = true;
        }
        OutputStream out = s.getOutputStream();
        if (!upgrade || key == null) {
          // обычный браузер: короткая страница «центр работает»
          byte[] body = statusPage.getBytes(StandardCharsets.UTF_8);
          out.write(("HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\n" +
            "Content-Length: " + body.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
          out.write(body);
          out.flush();
          s.close();
          return;
        }
        String accept = base64(sha1((key + GUID).getBytes(StandardCharsets.UTF_8)));
        out.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
          "Sec-WebSocket-Accept: " + accept + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        out.flush();
        Conn c = new Conn(s, in, false);
        synchronized (conns) { conns.add(c); }
        h.onOpen(c);
        c.loop(new Handler() {
          public void onOpen(Conn x) {}
          public void onText(Conn x, String t) { h.onText(x, t); }
          public void onClose(Conn x) {
            synchronized (conns) { conns.remove(x); }
            h.onClose(x);
          }
        });
      } catch (IOException e) {
        try { s.close(); } catch (IOException ignored) { /* уже */ }
      }
    }
  }

  /* ---------- клиент ---------- */
  /** Подключается и читает в текущем потоке до разрыва. Возвращает, когда соединение закрыто. */
  public static void connect(String url, int timeoutMs, Handler h) throws IOException { connect(url, timeoutMs, h, null); }

  public static void connect(String url, int timeoutMs, Handler h, SocketPrep prep) throws IOException {
    String u = url.trim();
    if (u.startsWith("ws://")) u = u.substring(5);
    else if (u.startsWith("http://")) u = u.substring(7);
    String path = "/";
    int sl = u.indexOf('/');
    if (sl >= 0) { path = u.substring(sl); u = u.substring(0, sl); }
    String host = u;
    int port = 80;
    int col = u.lastIndexOf(':');
    if (col > 0) { host = u.substring(0, col); port = Integer.parseInt(u.substring(col + 1)); }
    Socket s = new Socket();
    if (prep != null) prep.prep(s, host);
    try { s.connect(new InetSocketAddress(host, port), timeoutMs); }
    catch (IOException e) { try { s.close(); } catch (IOException ignored) { /* уже */ } throw e; }
    s.setTcpNoDelay(true);
    s.setSoTimeout(8000);
    byte[] kb = new byte[16];
    RND.nextBytes(kb);
    String key = base64(kb);
    OutputStream out = s.getOutputStream();
    out.write(("GET " + path + " HTTP/1.1\r\nHost: " + host + ":" + port + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
      "Sec-WebSocket-Key: " + key + "\r\nSec-WebSocket-Version: 13\r\n\r\n").getBytes(StandardCharsets.UTF_8));
    out.flush();
    BufferedInputStream in = new BufferedInputStream(s.getInputStream());
    List<String> head = readHead(in);
    if (head.isEmpty() || !head.get(0).contains(" 101")) { s.close(); throw new HandshakeException(); }
    Conn c = new Conn(s, in, true);
    h.onOpen(c);
    c.loop(h);
  }

  /** На адресе отвечает что-то, но не центр СИГНАЛОВ. */
  public static class HandshakeException extends IOException {
    public HandshakeException() { super("центр не принял соединение"); }
  }

  /* ---------- служебное ---------- */
  static List<String> readHead(InputStream in) throws IOException {
    List<String> lines = new ArrayList<>();
    StringBuilder b = new StringBuilder();
    int total = 0;
    while (true) {
      int c = in.read();
      if (c < 0) return lines;
      if (++total > 16384) throw new IOException("слишком длинный заголовок");
      if (c == '\n') {
        String line = b.toString().trim();
        b.setLength(0);
        if (line.isEmpty()) return lines;
        lines.add(line);
      } else if (c != '\r') b.append((char) c);
    }
  }

  static byte[] sha1(byte[] d) {
    try { return MessageDigest.getInstance("SHA-1").digest(d); } catch (Exception e) { throw new RuntimeException(e); }
  }

  static final char[] B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".toCharArray();

  static String base64(byte[] d) {
    StringBuilder b = new StringBuilder();
    for (int k = 0; k < d.length; k += 3) {
      int n = (d[k] & 255) << 16 | (k + 1 < d.length ? (d[k + 1] & 255) << 8 : 0) | (k + 2 < d.length ? d[k + 2] & 255 : 0);
      b.append(B64[n >> 18 & 63]).append(B64[n >> 12 & 63]);
      b.append(k + 1 < d.length ? B64[n >> 6 & 63] : '=');
      b.append(k + 2 < d.length ? B64[n & 63] : '=');
    }
    return b.toString();
  }
}
