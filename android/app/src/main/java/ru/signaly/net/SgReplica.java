package ru.signaly.net;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import static ru.signaly.net.SgJson.a;
import static ru.signaly.net.SgJson.l;
import static ru.signaly.net.SgJson.m;
import static ru.signaly.net.SgJson.map;
import static ru.signaly.net.SgJson.s;

/** П17 (Т8-1 А): копия состояния центра на телефоне — запасной центр.
 *  Копия собирается из того, что телефон и так получает (welcome, state, msg), и из сообщений «rep»:
 *  центр присылает только недостающее — сообщения, адресованные другим, и изменения счёта выдач, правил,
 *  таймеров и отложенных (раз в 2 с, пачкой). Формат копии — формат файла центра (SgCenter.save), поэтому
 *  «Поднять центр отсюда» просто запускает центр из копии (SgCenter.forTakeover). */
public class SgReplica {
  final File file;
  final Object lock = new Object();
  String epoch;
  long seq, gen, upto, at;
  Map<String, Object> state = new LinkedHashMap<>();
  final TreeMap<Long, Object> log = new TreeMap<>();
  Map<String, Object> claims = new LinkedHashMap<>(), rules = map("ver", 0L, "list", new ArrayList<>()),
    timers = new LinkedHashMap<>(), later = new LinkedHashMap<>();
  long cv = -1, rv = -1, tv = -1, lv = -1;
  volatile boolean dirty;
  long savedAt;
  /** Как часто писать копию в файл, мс (запись — весь файл; чаще не нужно: батарея и память телефона). */
  public volatile long saveEvery = 15000;
  Thread saver;

  public SgReplica(File file) {
    this.file = file;
    load();
  }

  /** Писать файл в фоне (на телефоне). В проверках — save() вручную. */
  public void autoSave() {
    if (saver != null || file == null) return;
    saver = new Thread(() -> {
      while (true) {
        try { Thread.sleep(2000); } catch (InterruptedException e) { return; }
        if (dirty && System.currentTimeMillis() - savedAt >= saveEvery) save();
      }
    }, "sg-replica");
    saver.setDaemon(true);
    saver.start();
  }

  public boolean has() { synchronized (lock) { return epoch != null; } }
  public long gen() { synchronized (lock) { return gen; } }
  public String epoch() { synchronized (lock) { return epoch; } }
  public long upto() { synchronized (lock) { return upto; } }

  /** Что сказать центру в hello: с какого места копия неполна. */
  public Map<String, Object> hello() {
    synchronized (lock) {
      return map("epoch", epoch, "upto", upto, "cv", cv, "rv", rv, "tv", tv, "lv", lv);
    }
  }

  /** Сводка для пульта: есть ли копия, от какого времени, сколько сообщений. */
  public Map<String, Object> info() {
    synchronized (lock) {
      return map("has", epoch != null, "at", at, "msgs", (long) log.size(), "seq", seq, "gen", gen, "upto", upto);
    }
  }

  void clear() {
    epoch = null; seq = 0; gen = 0; upto = 0;
    state = new LinkedHashMap<>();
    log.clear();
    claims = new LinkedHashMap<>();
    rules = map("ver", 0L, "list", new ArrayList<>());
    timers = new LinkedHashMap<>();
    later = new LinkedHashMap<>();
    cv = rv = tv = lv = -1;
  }

  /** Сообщение от центра (то же, что получает телефон). */
  public void feed(Map<String, Object> o) {
    if (o == null) return;
    String t = s(o, "t");
    if (t == null) return;
    synchronized (lock) {
      switch (t) {
        case "welcome": {
          String ep = s(o, "epoch");
          if (ep == null) return;
          if (!ep.equals(epoch)) { clear(); epoch = ep; }
          gen = Math.max(gen, l(o, "gen", 0));
          seq = Math.max(seq, l(o, "seq", 0));
          Map<String, Object> st = m(o.get("state"));
          state = st == null ? new LinkedHashMap<>() : st;
          break;
        }
        case "reset":
          clear();
          epoch = s(o, "epoch");
          break;
        case "state": {
          if (epoch == null) return;
          String k = s(o, "key");
          if (k == null) return;
          if (o.get("value") == null) state.remove(k); else state.put(k, o.get("value"));
          break;
        }
        case "msg":
          if (epoch == null) return;
          put(o);
          break;
        case "rep": {
          if (epoch == null) return;
          for (Object x : a(o.get("log"))) put(m(x));
          if (o.containsKey("claims")) { Map<String, Object> c = m(o.get("claims")); claims = c == null ? new LinkedHashMap<>() : c; cv = l(o, "cv", cv); }
          if (o.containsKey("rules")) { Map<String, Object> r = m(o.get("rules")); if (r != null) rules = r; rv = l(o, "rv", rv); }
          if (o.containsKey("timers")) { Map<String, Object> r = m(o.get("timers")); timers = r == null ? new LinkedHashMap<>() : r; tv = l(o, "tv", tv); }
          if (o.containsKey("later")) { Map<String, Object> r = m(o.get("later")); later = r == null ? new LinkedHashMap<>() : r; lv = l(o, "lv", lv); }
          if (o.containsKey("upto")) upto = Math.max(upto, l(o, "upto", 0));
          seq = Math.max(seq, l(o, "seq", 0));
          if (o.containsKey("gen")) gen = Math.max(gen, l(o, "gen", 0));
          break;
        }
        default: return;
      }
      at = System.currentTimeMillis();
      dirty = true;
    }
  }

  void put(Map<String, Object> mm) {
    if (mm == null) return;
    long sq = l(mm, "seq", 0);
    if (sq <= 0) return;
    // полное сообщение (из rep) заменяет урезанное (анонимное — без отправителя)
    log.put(sq, mm);
    while (log.size() > SgCenter.LOG_MAX) log.pollFirstEntry();
    if (sq > seq) seq = sq;
  }

  /** Копия в формате файла центра. */
  public Map<String, Object> snapshot() {
    synchronized (lock) {
      long top = log.isEmpty() ? 0 : log.lastKey();
      return map("epoch", epoch, "seq", Math.max(seq, top), "gen", gen, "state", state, "log", new ArrayList<>(log.values()),
        "claims", claims, "rules", rules, "timers", timers, "later", later,
        "vers", map("c", cv, "r", rv, "t", tv, "l", lv), "upto", upto, "at", at);
    }
  }

  public String dump() { return SgJson.str(snapshot()); }

  public void save() {
    if (file == null) { dirty = false; return; }
    String txt;
    synchronized (lock) { txt = dump(); dirty = false; savedAt = System.currentTimeMillis(); }
    try {
      File tmp = new File(file.getPath() + ".tmp");
      try (FileOutputStream f = new FileOutputStream(tmp)) { f.write(txt.getBytes(StandardCharsets.UTF_8)); }
      if (!tmp.renameTo(file)) { file.delete(); tmp.renameTo(file); }
    } catch (IOException e) { dirty = true; e.printStackTrace(); }
  }

  void load() {
    if (file == null || !file.exists()) return;
    try (FileInputStream f = new FileInputStream(file)) {
      byte[] d = new byte[(int) file.length()];
      int off = 0;
      while (off < d.length) { int n = f.read(d, off, d.length - off); if (n < 0) break; off += n; }
      Map<String, Object> o = SgJson.obj(new String(d, StandardCharsets.UTF_8));
      synchronized (lock) {
        clear();
        epoch = s(o, "epoch");
        seq = l(o, "seq", 0);
        gen = l(o, "gen", 0);
        upto = l(o, "upto", 0);
        at = l(o, "at", 0);
        if (m(o.get("state")) != null) state = m(o.get("state"));
        for (Object x : a(o.get("log"))) put(m(x));
        if (m(o.get("claims")) != null) claims = m(o.get("claims"));
        if (m(o.get("rules")) != null) rules = m(o.get("rules"));
        if (m(o.get("timers")) != null) timers = m(o.get("timers"));
        if (m(o.get("later")) != null) later = m(o.get("later"));
        Map<String, Object> v = m(o.get("vers"));
        if (v != null) { cv = l(v, "c", -1); rv = l(v, "r", -1); tv = l(v, "t", -1); lv = l(v, "l", -1); }
      }
    } catch (Exception e) { e.printStackTrace(); }
  }

  /** Для проверок: число сообщений в копии. */
  public int size() { synchronized (lock) { return log.size(); } }
  public List<Object> logList() { synchronized (lock) { return new ArrayList<>(log.values()); } }
  public Map<String, Object> stateCopy() { synchronized (lock) { return new LinkedHashMap<>(state); } }
  public Map<String, Object> claimsCopy() { synchronized (lock) { return new LinkedHashMap<>(claims); } }
  public Map<String, Object> laterCopy() { synchronized (lock) { return new LinkedHashMap<>(later); } }
  public Map<String, Object> timersCopy() { synchronized (lock) { return new LinkedHashMap<>(timers); } }
  public Map<String, Object> rulesCopy() { synchronized (lock) { return rules; } }
}
