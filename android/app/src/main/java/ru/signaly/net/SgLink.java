package ru.signaly.net;

import java.io.IOException;
import java.net.ConnectException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.NoRouteToHostException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Collections;
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
  public volatile boolean running;
  volatile SgWs.Conn conn;
  final List<String> outbox = new ArrayList<>();
  Thread thread;
  public volatile long lastSeq;
  public volatile String epoch;
  /** Почему нет связи (для экрана): код и текст последней неудачи, номер попытки. */
  public volatile String err = "";
  public volatile String errText = "";
  public volatile int tries;
  public volatile SgWs.SocketPrep prep;
  /** Запасной адрес центра (П-38: центр — телефон с точкой доступа, значит, он же шлюз сети Wi-Fi).
   *  Спрашивается после двух неудач подряд; null — запасного нет. */
  public interface Alt { String altUrl(String url); }
  public volatile Alt alt;
  /** П-62: поиск центра без QR. Адрес AUTO — «адреса нет, найди сам»: телефон пробует адреса
   *  кандидатов (первым — шлюз Wi-Fi, то есть точка доступа мастера, затем вся подсеть) и подключается
   *  к первому, где открыт порт центра. Найденный адрес становится основным (onStatus(true, адрес) —
   *  приложение его запоминает). С адресом поиск включается и после 6 неудач подряд (центр сменил адрес). */
  public static final String AUTO = "auto";
  public interface Finder { List<String> candidates(); }
  public volatile Finder finder;
  /** Сколько ждать ответа одного адреса при поиске, мс. */
  public volatile int probeMs = 800;
  /** Адрес, по которому связь есть сейчас (основной или запасной). */
  public volatile String cur;
  final Object waker = new Object();
  volatile boolean kicked;
  /** П17 (Т8-1 А): копия состояния центра на этом телефоне (запасной центр); null — не вести. */
  public volatile SgReplica replica;
  /** Вести ли копию сейчас (телефон сам центр — не нужно). null — всегда. */
  public interface Want { boolean want(); }
  public volatile Want repWant;
  /** Поколение центра (растёт, когда центр поднят из копии): старый центр, вернувшийся в сеть, по нему уступает. */
  public volatile long gen;
  /** Адреса центров, которые уступили (stale), — при поиске не брать какое-то время. */
  final java.util.Map<String, Long> staleUrls = new java.util.concurrent.ConcurrentHashMap<>();
  volatile boolean findNow;
  /** Сколько неудач подряд до поиска центра по сети (центр поднят на другом телефоне). */
  public volatile int findAfter = 6;

  public SgLink(Listener l) { this.listener = l; }

  public synchronized void start(String url, String hello) {
    if (!url.equals(this.url)) { tries = 0; err = ""; errText = ""; }
    this.url = url;
    this.hello = hello;
    adopt(hello);
    if (running) { SgWs.Conn c = conn; if (c != null) c.close(); return; }   // новый адрес — переподключиться
    running = true;
    thread = new Thread(this::loop, "sg-link");
    thread.setDaemon(true);
    thread.start();
  }

  public void setHello(String hello) {
    this.hello = hello;
    adopt(hello);
    SgWs.Conn c = conn;
    if (c != null && c.isOpen()) c.send(withSince(hello));
  }

  public synchronized void stop() {
    running = false;
    SgWs.Conn c = conn;
    if (c != null) c.close();
  }

  public String url() { return url; }

  public boolean connected() { SgWs.Conn c = conn; return c != null && c.isOpen(); }

  /** Сеть Wi-Fi появилась или пропала: не ждать паузы, переподключиться сразу.
   *  drop — закрыть и живое на вид соединение (оно могло остаться на старой сети). */
  public void kick(boolean drop) {
    SgWs.Conn c = conn;
    if (drop && c != null) c.close();
    synchronized (waker) { kicked = true; waker.notifyAll(); }
  }

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

  /** Приложение знает, до какого сообщения оно уже всё видело (epoch + since в hello; хранится на телефоне
   *  и переживает перезапуск службы и «сброс прогресса»). Новая связь (служба перезапущена) раньше
   *  начинала с since=0 — центр присылал всю старую переписку и уведомления заново (замечание build-26/36). */
  void adopt(String h) {
    try {
      Map<String, Object> o = SgJson.obj(h);
      String ep = SgJson.s(o, "epoch");
      long since = SgJson.l(o, "since", 0);
      if (ep == null) return;
      if (epoch == null) { epoch = ep; lastSeq = since; }
      else if (ep.equals(epoch) && since > lastSeq) lastSeq = since;
    } catch (RuntimeException ignored) { /* не JSON */ }
  }

  String withSince(String h) {
    try {
      Map<String, Object> o = SgJson.obj(h);
      if (epoch != null) o.put("epoch", epoch);
      o.put("since", lastSeq);
      SgReplica r = replica;
      long g = Math.max(gen, r == null ? 0 : r.gen());
      if (g > 0) o.put("gen", g);
      Want w = repWant;
      if (r != null && (w == null || w.want())) o.put("rep", r.hello());
      return SgJson.str(o);
    } catch (RuntimeException e) { return h; }
  }

  void loop() {
    long wait = 1000;
    int fails = 0;
    while (running) {
      String u = url;
      Alt al = alt;
      Finder fi = finder;
      boolean auto = AUTO.equals(u);
      int fa = Math.max(1, findAfter);
      if (fi != null && (auto || findNow || (fails >= fa && fails % fa == 0))) {
        boolean forced = findNow;
        findNow = false;
        err = "search"; errText = "ищу центр в сети Wi-Fi…";
        String f = null;
        try { f = find(fresh(fi.candidates())); } catch (RuntimeException ignored) { /* нет сети */ }
        if (f != null) { u = f; synchronized (this) { if (AUTO.equals(url) || !auto) url = f; } }
        else if (forced && !auto) { fails = Math.max(fails, 1); }
        else if (auto) {
          fails++;
          err = "notfound"; errText = "центр не найден в этой сети Wi-Fi";
          listener.onStatus(false, errText);
          synchronized (waker) {
            if (!kicked) { try { waker.wait(3000); } catch (InterruptedException e) { break; } }
            kicked = false;
          }
          continue;
        }
      } else if (fails >= 2 && fails % 3 == 2 && al != null && !auto) {
        String a2 = null;
        try { a2 = al.altUrl(u); } catch (RuntimeException ignored) { /* нет сети */ }
        if (a2 != null && !a2.equals(u)) u = a2;
      }
      final String uu = u;
      final boolean[] opened = { false };
      tries++;
      try {
        SgWs.connect(u, 5000, new SgWs.Handler() {
          public void onOpen(SgWs.Conn c) {
            conn = c;
            opened[0] = true;
            tries = 0;
            err = "";
            errText = "";
            cur = uu;
            c.send(withSince(hello));
            listener.onStatus(true, uu);
            flush(c);
          }
          public void onText(SgWs.Conn c, String text) {
            Map<String, Object> o = null;
            try { o = SgJson.obj(text); } catch (RuntimeException ignored) { /* не JSON */ }
            if (o != null) {
              track(o);
              SgReplica r = replica;
              if (r != null) r.feed(o);
              if ("stale".equals(SgJson.s(o, "t"))) {
                // П17: этот центр уступил новому — искать другой
                staleUrls.put(uu, System.currentTimeMillis());
                long g = SgJson.l(o, "gen", 0);
                if (g > gen) gen = g;
                findNow = true;
                c.close();
              }
            }
            listener.onText(text);
          }
          public void onClose(SgWs.Conn c) { }
        }, prep);
        wait = 1000;
        fails = 0;
        err = "lost";
        errText = "связь прервалась — переподключение";
      } catch (Exception e) {
        if (opened[0]) { err = "lost"; errText = "связь прервалась — переподключение"; fails = 0; }
        else { err = reason(e); errText = reasonText(err, e); fails++; }
      }
      conn = null;
      cur = null;
      if (!running) break;
      listener.onStatus(false, errText);
      synchronized (waker) {
        if (!kicked) { try { waker.wait(wait); } catch (InterruptedException e) { break; } }
        if (kicked) wait = 500;
        kicked = false;
      }
      wait = Math.min(wait * 2, 4000);
    }
    listener.onStatus(false, "выключено");
  }

  /** Найти центр среди адресов: открыт ли порт (параллельно, по probeMs на адрес). Первый откликнувшийся
   *  в порядке списка — его и берём (шлюз раньше подсети). null — не нашёлся. */
  public String find(List<String> list) {
    if (list == null || list.isEmpty()) return null;
    final List<String> l = new ArrayList<>();
    for (String a : list) if (a != null && !l.contains(a)) l.add(a);
    final boolean[] ok = new boolean[l.size()];
    final boolean[] known = new boolean[l.size()];
    final int[] next = { 0 };
    final int[] done = { 0 };
    final int ms = probeMs;
    final SgWs.SocketPrep pr = prep;
    Thread[] th = new Thread[Math.min(48, l.size())];
    for (int k = 0; k < th.length; k++) {
      th[k] = new Thread(() -> {
        for (;;) {
          int i;
          synchronized (next) { if (next[0] >= l.size() || !running) return; i = next[0]++; }
          boolean y = probe(l.get(i), ms, pr);
          synchronized (next) { ok[i] = y; known[i] = true; done[0]++; next.notifyAll(); }
        }
      }, "sg-find");
      th[k].setDaemon(true);
      th[k].start();
    }
    long end = System.currentTimeMillis() + ms * (l.size() / th.length + 2L) + 2000;
    synchronized (next) {
      for (;;) {
        // первый по порядку, про который уже всё известно: все раньше него — нет
        for (int i = 0; i < l.size(); i++) {
          if (ok[i]) return l.get(i);
          if (!known[i]) break;
        }
        if (done[0] >= l.size() || System.currentTimeMillis() > end || !running) break;
        try { next.wait(100); } catch (InterruptedException e) { break; }
      }
      for (int i = 0; i < l.size(); i++) if (ok[i]) return l.get(i);
    }
    return null;
  }

  static boolean probe(String url, int ms, SgWs.SocketPrep pr) {
    String host = hostOf(url);
    if (host == null) return false;
    int port = SgCenter.PORT;
    String u = url.replaceFirst("^wss?://", "");
    int sl = u.indexOf('/');
    if (sl >= 0) u = u.substring(0, sl);
    int col = u.lastIndexOf(':');
    if (col > 0) try { port = Integer.parseInt(u.substring(col + 1)); } catch (NumberFormatException ignored) { /* по умолчанию */ }
    try (java.net.Socket s = new java.net.Socket()) {
      if (pr != null) pr.prep(s, host);
      s.connect(new java.net.InetSocketAddress(host, port), ms);
      return true;
    } catch (Exception e) { return false; }
  }

  /** Адреса подсети /24 вокруг адресов IPv4 этого устройства (без своего), шлюзы точек доступа по умолчанию. */
  public static List<String> subnetUrls(int port) {
    List<String> out = new ArrayList<>();
    try {
      for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
        if (!ni.isUp() || ni.isLoopback()) continue;
        String nm = String.valueOf(ni.getName());
        if (nm.startsWith("tun") || nm.startsWith("ppp") || nm.startsWith("rmnet") || nm.startsWith("ccmni")) continue;
        for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
          if (!(ia.getAddress() instanceof Inet4Address)) continue;
          byte[] b = ia.getAddress().getAddress();
          int me = b[3] & 255;
          String pre = (b[0] & 255) + "." + (b[1] & 255) + "." + (b[2] & 255) + ".";
          out.add("ws://" + pre + "1:" + port);
          for (int i = 2; i < 255; i++) if (i != me) out.add("ws://" + pre + i + ":" + port);
        }
      }
    } catch (IOException | RuntimeException ignored) { /* нет сети */ }
    for (String h : new String[] { "192.168.43.1", "172.20.10.1", "192.168.49.1" }) out.add("ws://" + h + ":" + port);
    return out;
  }

  /** Код причины неудачи: timeout (нет ответа), refused (центр не запущен), unreach (нет пути),
   *  badaddr (неверный адрес), notcenter (там не центр), other. */
  public static String reason(Throwable e) {
    String m = String.valueOf(e.getMessage());
    if (e instanceof SgWs.HandshakeException) return "notcenter";
    if (e instanceof SocketTimeoutException || m.contains("ETIMEDOUT") || m.contains("timed out")) return "timeout";
    if (e instanceof NoRouteToHostException || m.contains("EHOSTUNREACH") || m.contains("ENETUNREACH") || m.contains("unreachable")) return "unreach";
    if (e instanceof ConnectException || m.contains("ECONNREFUSED") || m.contains("refused")) return "refused";
    if (e instanceof UnknownHostException || e instanceof NumberFormatException || e instanceof IllegalArgumentException) return "badaddr";
    if (m.contains("EPERM") || m.contains("EACCES") || m.contains("not permitted")) return "denied";
    return "other";
  }

  public static String reasonText(String code, Throwable e) {
    switch (code) {
      case "timeout": return "центр не отвечает";
      case "refused": return "телефон-центр отказал: центр не запущен";
      case "unreach": return "нет пути к центру (другая сеть или нет Wi-Fi)";
      case "badaddr": return "неверный адрес центра";
      case "notcenter": return "по этому адресу не центр СИГНАЛОВ";
      case "denied": return "Android не дал доступ к сети";
      default: return "ошибка: " + (e == null ? "" : e.getClass().getSimpleName() + " " + e.getMessage());
    }
  }

  /** Та же подсеть: есть ли у телефона адрес IPv4 в одной сети с host. null — не понять (нет сети, имя вместо адреса). */
  public static Boolean sameSubnet(String host) {
    try {
      if (host == null || !host.matches("\\d+\\.\\d+\\.\\d+\\.\\d+")) return null;
      InetAddress t = InetAddress.getByName(host);
      if (t.isLoopbackAddress()) return true;
      boolean any = false;
      for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
        if (!ni.isUp() || ni.isLoopback()) continue;
        for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
          if (!(ia.getAddress() instanceof Inet4Address)) continue;
          any = true;
          if (sameNet(ia.getAddress(), t, ia.getNetworkPrefixLength())) return true;
        }
      }
      return any ? false : null;
    } catch (IOException | RuntimeException e) { return null; }
  }

  public static boolean sameNet(InetAddress a, InetAddress b, int prefix) {
    byte[] x = a.getAddress(), y = b.getAddress();
    if (x.length != y.length || prefix <= 0) return false;
    for (int k = 0; k < x.length * 8 && k < prefix; k++) {
      int m = 0x80 >> (k & 7);
      if ((x[k >> 3] & m) != (y[k >> 3] & m)) return false;
    }
    return true;
  }

  /** Хост из адреса ws://host:port/… */
  public static String hostOf(String url) {
    if (url == null) return null;
    String u = url.trim().replaceFirst("^(ws|http)s?://", "");
    int sl = u.indexOf('/');
    if (sl >= 0) u = u.substring(0, sl);
    int col = u.lastIndexOf(':');
    return col > 0 ? u.substring(0, col) : u;
  }

  /** Без центров, которые недавно уступили (stale), — 2 минуты. */
  List<String> fresh(List<String> list) {
    if (list == null || staleUrls.isEmpty()) return list;
    long t = System.currentTimeMillis();
    List<String> out = new ArrayList<>();
    for (String a : list) { Long at = staleUrls.get(a); if (at == null || t - at > 120000) out.add(a); }
    return out;
  }

  /** Запоминает номер последнего сообщения: после разрыва центр пришлёт только пропущенное. */
  void track(String text) {
    try { track(SgJson.obj(text)); } catch (RuntimeException ignored) { /* не JSON */ }
  }

  void track(Map<String, Object> o) {
    try {
      String t = SgJson.s(o, "t");
      if ("welcome".equals(t)) {
        long g = SgJson.l(o, "gen", 0);
        if (g > gen) gen = g;
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
