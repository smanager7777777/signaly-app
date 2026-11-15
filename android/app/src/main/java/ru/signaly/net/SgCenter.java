package ru.signaly.net;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static ru.signaly.net.SgJson.a;
import static ru.signaly.net.SgJson.b;
import static ru.signaly.net.SgJson.l;
import static ru.signaly.net.SgJson.m;
import static ru.signaly.net.SgJson.map;
import static ru.signaly.net.SgJson.s;

/** СИГНАЛЫ: центр сети. Ничего не знает о пакете игры: пересылает сообщения, хранит общее состояние,
 *  считает «сколько раз взяли» (ограниченные коды, две подписи), выполняет правила и таймеры.
 *  Протокол — docs/06_NETWORK.md. Работает и на Android (служба), и в обычной Java (проверки). */
public class SgCenter implements SgWs.Handler {
  public static final int PORT = 8790;
  static final int LOG_MAX = 4000;

  public interface Listener { void onPeers(int online); }

  final Object lock = new Object();
  final File file;
  SgWs.Server server;
  volatile boolean running;
  Thread ticker;
  public Listener listener;

  String epoch;
  long seq;
  Map<String, Object> state = new LinkedHashMap<>();
  List<Object> log = new ArrayList<>();
  Map<String, Object> claims = new LinkedHashMap<>();
  Map<String, Object> rules = map("ver", 0L, "list", new ArrayList<>());
  Map<String, Object> timers = new LinkedHashMap<>();
  final Map<String, LinkedHashMap<String, Long>> signs = new HashMap<>();
  final LinkedHashMap<String, Long> ids = new LinkedHashMap<>();
  final Map<String, Map<String, Object>> peers = new LinkedHashMap<>();
  final List<SgWs.Conn> conns = new ArrayList<>();
  boolean dirty;
  long savedAt;
  long timerN;

  public SgCenter(File file) {
    this.file = file;
    load();
    if (epoch == null) epoch = newEpoch();
  }

  static String newEpoch() { return Long.toString(System.currentTimeMillis(), 36) + Integer.toString(SgWs.RND.nextInt(1296), 36); }

  public void start(int port) throws IOException {
    server = new SgWs.Server(this);
    server.statusPage = "SIGNALY CENTER OK\n";
    server.start(port);
    running = true;
    ticker = new Thread(this::tickLoop, "sg-center-tick");
    ticker.setDaemon(true);
    ticker.start();
  }

  public int port() { return server == null ? 0 : server.port(); }

  public void stop() {
    running = false;
    if (server != null) server.stop();
    synchronized (lock) { save(); }
  }

  public int online() { synchronized (lock) { return conns.size(); } }

  /* ---------- соединения ---------- */
  @Override public void onOpen(SgWs.Conn c) {
    synchronized (lock) { conns.add(c); }
  }

  @Override public void onClose(SgWs.Conn c) {
    synchronized (lock) {
      conns.remove(c);
      Map<String, Object> p = m(c.tag);
      if (p != null) {
        boolean other = false;
        for (SgWs.Conn x : conns) { Map<String, Object> q = m(x.tag); if (q != null && s(q, "dev").equals(s(p, "dev"))) other = true; }
        Map<String, Object> info = peers.get(s(p, "dev"));
        if (info != null && !other) { info.put("online", false); info.put("last", now()); }
        sendPeers();
      }
    }
    if (listener != null) listener.onPeers(online());
  }

  @Override public void onText(SgWs.Conn c, String text) {
    Map<String, Object> o;
    try { o = SgJson.obj(text); } catch (RuntimeException e) { return; }
    synchronized (lock) {
      try { handle(c, o); } catch (RuntimeException e) { e.printStackTrace(); }
    }
  }

  static long now() { return System.currentTimeMillis(); }

  void handle(SgWs.Conn c, Map<String, Object> o) {
    String t = s(o, "t");
    if (t == null) return;
    Map<String, Object> me = m(c.tag);
    switch (t) {
      case "hello": hello(c, o); break;
      case "ping": c.send(SgJson.str(map("t", "pong", "id", o.get("id"), "now", now()))); break;
      default:
        if (me == null) return;   // сначала hello
        switch (t) {
          case "msg": msg(c, me, o); break;
          case "set": set(me, s(o, "key"), o.get("value")); break;
          case "claim": claim(c, me, o); break;
          case "rules": if ("master".equals(s(me, "role"))) rulesSet(o); break;
          case "timer": timer(o); break;
          case "admin": if ("master".equals(s(me, "role"))) admin(o); break;
          default: break;
        }
    }
  }

  void hello(SgWs.Conn c, Map<String, Object> o) {
    String dev = s(o, "dev");
    if (dev == null || dev.isEmpty()) dev = "?" + c.remote;
    Map<String, Object> p = map("dev", dev, "acc", o.get("acc"), "role", s(o, "role") == null ? "phone" : s(o, "role"),
      "name", o.get("name"), "ver", o.get("ver"));
    c.tag = p;
    Map<String, Object> info = new LinkedHashMap<>(p);
    info.put("online", true);
    info.put("last", now());
    info.put("ip", c.remote);
    peers.put(dev, info);
    boolean same = epoch.equals(s(o, "epoch"));
    long since = same ? l(o, "since", 0) : 0;
    Map<String, Object> w = map("t", "welcome", "epoch", epoch, "seq", seq, "now", now(), "state", state,
      "rulesVer", rules.get("ver"));
    if ("master".equals(s(p, "role"))) w.put("peers", peerList());
    c.send(SgJson.str(w));
    // пропущенные сообщения (не больше 400 последних)
    List<Object> miss = new ArrayList<>();
    for (Object x : log) {
      Map<String, Object> mm = m(x);
      if (l(mm, "seq", 0) > since && routes(p, a(mm.get("to")))) miss.add(mm);
    }
    int from = Math.max(0, miss.size() - 400);
    for (int k = from; k < miss.size(); k++) c.send(SgJson.str(miss.get(k)));
    sendPeers();
    if (listener != null) listener.onPeers(conns.size());
  }

  List<Object> peerList() {
    return new ArrayList<>(peers.values());
  }

  void sendPeers() {
    String txt = SgJson.str(map("t", "peers", "peers", peerList()));
    for (SgWs.Conn x : conns) if ("master".equals(s(m(x.tag), "role"))) x.send(txt);
  }

  /** Кому доставлять: мастер видит всё; остальным — по адресам to. */
  static boolean routes(Map<String, Object> p, List<Object> to) {
    if (p == null) return false;
    String role = s(p, "role"), acc = s(p, "acc"), dev = s(p, "dev");
    if ("master".equals(role)) return true;
    for (Object x : to) {
      String t = String.valueOf(x);
      if (t.equals("all")) return true;
      if (acc != null && t.equals("acc:" + acc)) return true;
      if (t.equals("role:" + role)) return true;
      if (t.equals("dev:" + dev)) return true;
    }
    return false;
  }

  /* ---------- сообщения ---------- */
  void msg(SgWs.Conn c, Map<String, Object> from, Map<String, Object> o) {
    String id = s(o, "id");
    if (id != null && ids.containsKey(id)) {
      if (c != null) c.send(SgJson.str(map("t", "ack", "id", id, "seq", ids.get(id), "dup", true)));
      return;
    }
    Map<String, Object> mm = new LinkedHashMap<>();
    mm.put("t", "msg");
    mm.put("seq", ++seq);
    mm.put("at", now());
    mm.put("id", id);
    mm.put("from", from == null ? map("role", "center") : map("dev", from.get("dev"), "acc", from.get("acc"), "role", from.get("role"), "name", from.get("name")));
    List<Object> to = a(o.get("to"));
    if (to.isEmpty()) to.add("all");
    mm.put("to", to);
    mm.put("kind", o.get("kind"));
    mm.put("body", o.get("body"));
    if (id != null) { ids.put(id, seq); while (ids.size() > 8000) { Iterator<String> it = ids.keySet().iterator(); it.next(); it.remove(); } }
    log.add(mm);
    while (log.size() > LOG_MAX) log.remove(0);
    dirty = true;
    String txt = SgJson.str(mm);
    for (SgWs.Conn x : conns) if (routes(m(x.tag), to)) x.send(txt);
    if (c != null && id != null) c.send(SgJson.str(map("t", "ack", "id", id, "seq", seq)));
    if ("event".equals(s(mm, "kind"))) {
      Map<String, Object> body = m(mm.get("body"));
      fireRules("event", s(body, "name"), null);
    }
  }

  void set(Map<String, Object> from, String key, Object value) {
    if (key == null) return;
    if (value == null) state.remove(key);
    else state.put(key, value);
    dirty = true;
    String txt = SgJson.str(map("t", "state", "key", key, "value", value, "by", from == null ? "center" : from.get("dev")));
    for (SgWs.Conn x : conns) x.send(txt);
    fireRules("state", key, value);
  }

  /* ---------- «сколько раз взяли» ---------- */
  void claim(SgWs.Conn c, Map<String, Object> me, Map<String, Object> o) {
    String key = s(o, "key");
    String acc = s(o, "acc") != null ? s(o, "acc") : s(me, "acc");
    if (key == null || acc == null) return;
    Map<String, Object> r = map("t", "claimed", "id", o.get("id"), "key", key);
    long need = l(o, "sign", 0);
    if (need > 1) {
      // две (и больше) подписи: разные персонажи за window секунд
      long win = Math.max(5, l(o, "window", 60)) * 1000;
      LinkedHashMap<String, Long> sg = signs.get(key);
      if (sg == null) { sg = new LinkedHashMap<>(); signs.put(key, sg); }
      long t = now();
      Iterator<Map.Entry<String, Long>> it = sg.entrySet().iterator();
      while (it.hasNext()) if (t - it.next().getValue() > win) it.remove();
      sg.put(acc, t);
      r.put("have", (long) sg.size());
      r.put("need", need);
      if (sg.size() >= need) {
        List<Object> who = new ArrayList<>(sg.keySet());
        signs.remove(key);
        r.put("ok", true);
        r.put("signers", who);
        List<Object> to = new ArrayList<>();
        for (Object w : who) if (!acc.equals(w)) to.add("acc:" + w);
        if (!to.isEmpty()) msg(null, null, map("to", to, "kind", "signed", "body", map("key", key, "signers", who)));
      } else {
        r.put("ok", false);
        r.put("reason", "wait");
      }
      c.send(SgJson.str(r));
      return;
    }
    Map<String, Object> rec = m(claims.get(key));
    if (rec == null) { rec = map("n", 0L, "by", new LinkedHashMap<String, Object>()); claims.put(key, rec); }
    Map<String, Object> by = m(rec.get("by"));
    long n = l(rec, "n", 0), mine = l(by, acc, 0), limit = l(o, "limit", 0);
    boolean per = b(o, "per");
    if (per && mine > 0) { r.put("ok", false); r.put("reason", "mine"); r.put("n", n); r.put("mine", mine); }
    else if (limit > 0 && n >= limit) { r.put("ok", false); r.put("reason", "empty"); r.put("n", n); r.put("mine", mine); }
    else {
      n++;
      mine++;
      rec.put("n", n);
      by.put(acc, mine);
      dirty = true;
      r.put("ok", true);
      r.put("n", n);
      r.put("mine", mine);
      r.put("left", limit > 0 ? limit - n : -1L);
      set(null, "claim:" + key, map("n", n, "limit", limit));
    }
    c.send(SgJson.str(r));
  }

  /* ---------- правила и таймеры ---------- */
  void rulesSet(Map<String, Object> o) {
    rules = map("ver", o.get("ver"), "list", a(o.get("list")));
    // повторяющиеся правила — таймеры «rule:…»
    timers.keySet().removeIf(k -> k.startsWith("rule:"));
    for (Object x : a(rules.get("list"))) {
      Map<String, Object> r = m(x);
      if (r != null && "every".equals(s(r, "on")) && l(r, "every", 0) >= 5000) {
        timers.put("rule:" + s(r, "id"), map("id", "rule:" + s(r, "id"), "at", now() + l(r, "every", 0), "every", r.get("every"),
          "emit", r.get("emit"), "chapters", r.get("chapters"), "auto", true));
      }
    }
    dirty = true;
  }

  boolean autoOff() { return Boolean.FALSE.equals(state.get("auto")); }

  long chapterNow() { return l(m(state.get("chapter")), "n", 1); }

  boolean inChapters(Object chapters) {
    List<Object> ch = a(chapters);
    if (ch.isEmpty()) return true;
    long n = chapterNow();
    for (Object x : ch) if (x instanceof Number && ((Number) x).longValue() == n) return true;
    return false;
  }

  void fireRules(String on, String key, Object value) {
    if (autoOff()) return;
    for (Object x : a(rules.get("list"))) {
      Map<String, Object> r = m(x);
      if (r == null || !on.equals(s(r, "on"))) continue;
      if (!inChapters(r.get("chapters"))) continue;
      if ("event".equals(on)) {
        if (key == null || !key.equals(s(r, "event"))) continue;
      } else {
        if (!key.equals(s(r, "key"))) continue;
        if (r.containsKey("n") && l(m(value), "n", -1) != l(r, "n", -2)) continue;
      }
      emit(a(r.get("emit")));
    }
  }

  void timer(Map<String, Object> o) {
    String id = s(o, "id");
    if (id == null) return;
    if (b(o, "cancel")) { timers.remove(id); dirty = true; return; }
    long at = o.containsKey("at") ? l(o, "at", 0) : now() + l(o, "delay", 0);
    timers.put(id, map("id", id, "at", at, "every", o.get("every"), "emit", o.get("emit")));
    dirty = true;
  }

  void emit(List<Object> items) {
    long t = now();
    for (Object x : items) {
      Map<String, Object> it = m(SgJson.copy(x));
      if (it == null) continue;
      fill(it, t);
      long delay = l(it, "delay", 0);
      if (delay > 0) {
        it.remove("delay");
        List<Object> one = new ArrayList<>();
        one.add(it);
        String id = "d" + (++timerN) + "-" + t;
        timers.put(id, map("id", id, "at", t + delay, "emit", one));
        continue;
      }
      String k = s(it, "t");
      if ("msg".equals(k)) msg(null, null, it);
      else if ("set".equals(k)) set(null, s(it, "key"), it.get("value"));
    }
    dirty = true;
  }

  /** Подстановки в шаблонах: {{now}} — время центра (мс). */
  @SuppressWarnings("unchecked")
  static void fill(Map<String, Object> m, long t) {
    for (Map.Entry<String, Object> e : m.entrySet()) {
      Object v = e.getValue();
      if (v instanceof String && ((String) v).contains("{{")) {
        if ("{{now}}".equals(v)) e.setValue(t);
        else e.setValue(((String) v).replace("{{now}}", Long.toString(t)));
      } else if (v instanceof Map) fill((Map<String, Object>) v, t);
      else if (v instanceof List) {
        List<Object> l = (List<Object>) v;
        for (int k = 0; k < l.size(); k++) {
          Object y = l.get(k);
          if (y instanceof Map) fill((Map<String, Object>) y, t);
          else if (y instanceof String) l.set(k, ((String) y).replace("{{now}}", Long.toString(t)));
        }
      }
    }
  }

  void admin(Map<String, Object> o) {
    String op = s(o, "op");
    if ("reset".equals(op)) {
      epoch = newEpoch();
      seq = 0;
      log.clear();
      state.clear();
      claims.clear();
      signs.clear();
      ids.clear();
      timers.keySet().removeIf(k -> !k.startsWith("rule:"));
      dirty = true;
      for (SgWs.Conn x : conns) x.send(SgJson.str(map("t", "reset", "epoch", epoch)));
    } else if ("unclaim".equals(op)) {
      claims.remove(s(o, "key"));
      set(null, "claim:" + s(o, "key"), null);
    }
  }

  void tickLoop() {
    while (running) {
      try { Thread.sleep(500); } catch (InterruptedException e) { return; }
      synchronized (lock) {
        try {
          long t = now();
          List<Map<String, Object>> due = new ArrayList<>();
          for (Object x : new ArrayList<>(timers.values())) {
            Map<String, Object> tm = m(x);
            if (tm != null && l(tm, "at", 0) <= t) due.add(tm);
          }
          for (Map<String, Object> tm : due) {
            long every = l(tm, "every", 0);
            if (every >= 1000) {
              long at = l(tm, "at", t);
              while (at <= t) at += every;
              tm.put("at", at);
            } else timers.remove(s(tm, "id"));
            if (b(tm, "auto") && (autoOff() || !inChapters(tm.get("chapters")))) continue;
            emit(a(tm.get("emit")));
          }
          if (dirty && t - savedAt > 2000) save();
        } catch (RuntimeException e) { e.printStackTrace(); }
      }
    }
  }

  /* ---------- сохранение (переживает перезапуск центра) ---------- */
  void save() {
    if (file == null) { dirty = false; return; }
    try {
      String txt = SgJson.str(map("epoch", epoch, "seq", seq, "state", state, "log", log, "claims", claims, "rules", rules, "timers", timers));
      File tmp = new File(file.getPath() + ".tmp");
      try (FileOutputStream f = new FileOutputStream(tmp)) { f.write(txt.getBytes(StandardCharsets.UTF_8)); }
      if (!tmp.renameTo(file)) { file.delete(); tmp.renameTo(file); }
      dirty = false;
      savedAt = now();
    } catch (IOException e) { e.printStackTrace(); }
  }

  void load() {
    if (file == null || !file.exists()) return;
    try (FileInputStream f = new FileInputStream(file)) {
      byte[] d = new byte[(int) file.length()];
      int off = 0;
      while (off < d.length) { int n = f.read(d, off, d.length - off); if (n < 0) break; off += n; }
      Map<String, Object> o = SgJson.obj(new String(d, StandardCharsets.UTF_8));
      epoch = s(o, "epoch");
      seq = l(o, "seq", 0);
      if (m(o.get("state")) != null) state = m(o.get("state"));
      log = a(o.get("log"));
      if (m(o.get("claims")) != null) claims = m(o.get("claims"));
      if (m(o.get("rules")) != null) rules = m(o.get("rules"));
      if (m(o.get("timers")) != null) timers = m(o.get("timers"));
      for (Object x : log) { Map<String, Object> mm = m(x); if (s(mm, "id") != null) ids.put(s(mm, "id"), l(mm, "seq", 0)); }
    } catch (Exception e) { e.printStackTrace(); }
  }

  /** Запуск без Android (проверки): java -cp … ru.signaly.net.SgCenter [порт] [файл]. */
  public static void main(String[] args) throws Exception {
    int port = args.length > 0 ? Integer.parseInt(args[0]) : PORT;
    SgCenter c = new SgCenter(args.length > 1 ? new File(args[1]) : null);
    c.start(port);
    System.out.println("SIGNALY CENTER " + c.port());
    System.out.flush();
    while (true) Thread.sleep(60000);
  }
}
