package ru.signaly.net;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** СИГНАЛЫ: связь телефона с центром. Держит соединение, переподключается сама,
 *  копит неотправленное (А5: «сообщения доходят потом»). Порядок: hello, затем очередь. */
public class SgLink {
  public interface Listener {
    void onText(String text);
    void onStatus(boolean connected, String info);
  }

  final Listener listener;
  volatile String url;
  volatile String hello;          // JSON hello (обновляет приложение: аккаунт, since)
  volatile boolean running;
  volatile SgWs.Conn conn;
  final List<String> outbox = new ArrayList<>();
  Thread thread;
  public volatile long lastSeq;
  public volatile String epoch;

  public SgLink(Listener l) { this.listener = l; }

  public synchronized void start(String url, String hello) {
    this.url = url;
    this.hello = hello;
    if (running) { SgWs.Conn c = conn; if (c != null) c.close(); return; }   // новый адрес — переподключиться
    running = true;
    thread = new Thread(this::loop, "sg-link");
    thread.setDaemon(true);
    thread.start();
  }

  public void setHello(String hello) {
    this.hello = hello;
    SgWs.Conn c = conn;
    if (c != null && c.isOpen()) c.send(withSince(hello));
  }

  public synchronized void stop() {
    running = false;
    SgWs.Conn c = conn;
    if (c != null) c.close();
  }

  public boolean connected() { SgWs.Conn c = conn; return c != null && c.isOpen(); }

  /** Отправить сейчас или, если связи нет, — как только появится. */
  public void send(String text) {
    SgWs.Conn c = conn;
    synchronized (outbox) {
      if (c != null && c.isOpen() && outbox.isEmpty()) { c.send(text); return; }
      outbox.add(text);
      while (outbox.size() > 2000) outbox.remove(0);
    }
    if (c != null && c.isOpen()) flush(c);
  }

  public int queued() { synchronized (outbox) { return outbox.size(); } }

  void flush(SgWs.Conn c) {
    while (c.isOpen()) {
      String t;
      synchronized (outbox) {
        if (outbox.isEmpty()) return;
        t = outbox.remove(0);
      }
      c.send(t);
    }
  }

  String withSince(String h) {
    try {
      Map<String, Object> o = SgJson.obj(h);
      if (epoch != null) o.put("epoch", epoch);
      o.put("since", lastSeq);
      return SgJson.str(o);
    } catch (RuntimeException e) { return h; }
  }

  void loop() {
    long wait = 1000;
    while (running) {
      String u = url;
      try {
        SgWs.connect(u, 5000, new SgWs.Handler() {
          public void onOpen(SgWs.Conn c) {
            conn = c;
            c.send(withSince(hello));
            listener.onStatus(true, u);
            flush(c);
          }
          public void onText(SgWs.Conn c, String text) {
            track(text);
            listener.onText(text);
          }
          public void onClose(SgWs.Conn c) { }
        });
        wait = 1000;
      } catch (Exception e) {
        listener.onStatus(false, String.valueOf(e.getMessage()));
      }
      conn = null;
      if (!running) break;
      listener.onStatus(false, "переподключение");
      try { Thread.sleep(wait); } catch (InterruptedException e) { break; }
      wait = Math.min(wait * 2, 8000);
    }
    listener.onStatus(false, "выключено");
  }

  /** Запоминает номер последнего сообщения: после разрыва центр пришлёт только пропущенное. */
  void track(String text) {
    if (!text.contains("\"seq\"")) return;
    try {
      Map<String, Object> o = SgJson.obj(text);
      String t = SgJson.s(o, "t");
      if ("welcome".equals(t)) {
        String ep = SgJson.s(o, "epoch");
        if (ep != null && !ep.equals(epoch)) { epoch = ep; lastSeq = 0; }
        long cs = SgJson.l(o, "seq", 0);
        if (cs < lastSeq) lastSeq = cs;   // центр не успел записать последние сообщения перед выключением
      } else if ("reset".equals(t)) {
        epoch = SgJson.s(o, "epoch");
        lastSeq = 0;
      } else if ("msg".equals(t)) {
        long sq = SgJson.l(o, "seq", 0);
        if (sq > lastSeq) lastSeq = sq;
      }
    } catch (RuntimeException ignored) { /* не JSON */ }
  }
}
