package ru.signaly.net;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** П17 (Т8-6 Б): события самого телефона в службе Android — и когда приложение свёрнуто или экран погашен.
 *  Правила «на самом телефоне» (настройку присылает приложение: SG.phoneConfig) — встряхнули, экраном вниз / вверх,
 *  перевернули, экран заблокирован дольше N с (при разблокировке), не блокировали дольше N с, **экран включён,
 *  но игрок не в приложении дольше N с** (away). У правила — когда работает: всегда / только при включённом экране /
 *  только при выключенном. Сработало — служба шлёт сообщения центру (net), сама мигает фонариком, пищит,
 *  показывает уведомление в шторке (local) и говорит приложению, что ещё сделать (t:'phone').
 *  Чистая Java без Android: датчики и экран подаются вызовами motion / screen / foreground / tick (проверка — PhoneCheck). */
public class SgPhoneCore {
  public interface Out {
    long now();                                            // время центра
    void send(String json);                                // центру
    void toApp(String json);                               // приложению (журнал службы → JS)
    boolean local(String kind, Map<String, Object> body);  // сделать здесь (вспышка, сигнал, шторка); true — сделано
  }

  static final class Rule {
    String id, sensor, screen;
    long seconds, every, last, next;
    boolean held;     // «держится N с» уже сработало в этом положении
    List<Object> net, local;
  }

  final Out out;
  List<Rule> rules = new ArrayList<>();
  /** Экран горит; разблокирован; приложение на экране. */
  public boolean screenOn = true, unlocked = true, fg = true;
  long offAt, presentAt, awayAt, lastAt;
  String face = "up", faceWant = "";
  long faceAt, faceWantAt;
  final List<Long> jolts = new ArrayList<>();
  /* П25 (06, 149): «в руках» — разблокирован и мелкие движения за последние 10 с. */
  boolean handsNeed, havePrev, wasHands;
  double px, py, pz;
  long moveAt, handsAt;
  /** П26 (Т37-6 А): порог движения (м/с², из пакета или пульта), пульт следит («в руках / лежит» у всех), наибольшее дрожание за 3 с. */
  public volatile double thr = 0.08;
  public volatile boolean probe;
  double peak; long peakAt, statAt;
  long lastShake;
  int seq;
  /** Сколько раз что сработало — для проверок. */
  public int fired;
  public String lastFired = "";

  public SgPhoneCore(Out out) { this.out = out; }

  public synchronized void configure(String json) {
    Map<String, Object> o;
    try { o = SgJson.obj(json); } catch (RuntimeException e) { return; }
    List<Rule> list = new ArrayList<>();
    for (Object x : SgJson.a(o.get("rules"))) {
      Map<String, Object> r = SgJson.m(x);
      if (r == null || SgJson.s(r, "id") == null || SgJson.s(r, "sensor") == null) continue;
      Rule f = new Rule();
      f.id = SgJson.s(r, "id");
      f.sensor = SgJson.s(r, "sensor");
      f.screen = SgJson.s(r, "screen") == null ? "" : SgJson.s(r, "screen");
      f.seconds = SgJson.l(r, "seconds", 0);
      f.every = SgJson.l(r, "every", 0);
      f.net = SgJson.a(r.get("net"));
      f.local = SgJson.a(r.get("local"));
      for (Rule old : rules) if (old.id.equals(f.id)) { f.last = old.last; f.next = old.next; f.held = old.held; }
      list.add(f);
    }
    rules = list;
    handsNeed = SgJson.b(o, "hands");
    Object th = o.get("thr");
    thr = th instanceof Number && ((Number) th).doubleValue() > 0 ? ((Number) th).doubleValue() : 0.08;
    probe = SgJson.b(o, "probe");
    if (probe) handsNeed = true;
    for (Rule r : rules) if ("hands".equals(r.sensor)) handsNeed = true;
    long t = now();
    if (presentAt == 0) presentAt = t;
    plan(t);
  }

  public long now() { return out.now(); }

  /** Нужен ли акселерометр (встряхнуть, положение) — иначе служба его не включает (батарея). */
  public synchronized boolean needsMotion() {
    for (Rule r : rules) if ("shake".equals(r.sensor) || "facedown".equals(r.sensor) || "faceup".equals(r.sensor) || "flip".equals(r.sensor)) return true;
    return handsNeed;
  }

  /** Есть ли правила вообще (служба держится ради них). */
  public synchronized boolean any() { return !rules.isEmpty() || handsNeed; }

  /** Нужен ли таймер (раз в секунду): «дольше N с», «не в приложении». */
  public synchronized boolean needsTick() {
    for (Rule r : rules) if ("unlocked".equals(r.sensor) || "away".equals(r.sensor) || (r.seconds > 0 && (r.sensor.startsWith("face")))) return true;
    return handsNeed;
  }

  /* ---------- датчики ---------- */
  /** Ускорение с силой тяжести, м/с² (как devicemotion в браузере). t — мс. */
  public synchronized void motion(double x, double y, double z, long t) {
    if (havePrev) {
      double d = Math.sqrt((x - px) * (x - px) + (y - py) * (y - py) + (z - pz) * (z - pz));
      if (t - peakAt > 3000) peak = 0;
      if (d > peak) { peak = d; peakAt = t; }
      if (d > thr) { moveAt = t; handsCheck(t); }
    }
    havePrev = true; px = x; py = y; pz = z;
    double mag = Math.sqrt(x * x + y * y + z * z);
    if (Math.abs(mag - 9.8) >= 14) {
      while (!jolts.isEmpty() && t - jolts.get(0) > 2000) jolts.remove(0);
      if (jolts.isEmpty() || t - jolts.get(jolts.size() - 1) > 150) jolts.add(t);
      if (jolts.size() >= 3 && t - lastShake > 1200) { jolts.clear(); lastShake = t; fire("shake", 0, t); }
      return;
    }
    String want = z < -7 ? "down" : z > 7 ? "up" : "";
    if (want.isEmpty() || want.equals(face)) { faceWant = ""; return; }
    if (!want.equals(faceWant)) { faceWant = want; faceWantAt = t; return; }
    if (t - faceWantAt < 800) return;           // положение держится 0,8 с — не дрожание в руке
    long dur = t - faceAt;
    face = want;
    faceAt = t;
    faceWant = "";
    for (Rule r : rules) r.held = false;
    String s = "down".equals(want) ? "facedown" : "faceup";
    fireNow(s, dur, t);
    fireNow("flip", dur, t);
  }

  /** Экран: "off" — погас, "on" — включился (на экране блокировки), "present" — разблокирован. */
  public synchronized void screen(String ev, long t) {
    if ("off".equals(ev)) {
      if (!screenOn) return;
      screenOn = false;
      unlocked = false;
      offAt = t;
    } else if ("on".equals(ev)) {
      screenOn = true;
    } else if ("present".equals(ev)) {
      boolean was = unlocked;
      screenOn = true;
      unlocked = true;
      presentAt = t;
      if (!was && offAt > 0) fire("locked", t - offAt, t);
      offAt = 0;
    }
    plan(t);
  }

  /** Приложение на экране (onResume) или свёрнуто (onPause). */
  public synchronized void foreground(boolean f, long t) {
    if (fg == f) return;
    fg = f;
    plan(t);
  }

  boolean away() { return screenOn && unlocked && !fg; }

  /** П26 (Т37-6 А): для пульта «ТЕЛЕФОНЫ» — в руках ли, сколько мс назад было движение, наибольшее дрожание за 3 с, порог. */
  public synchronized Map<String, Object> handsStat(long t) { return handsStat(t, inHands(t)); }
  Map<String, Object> handsStat(long t, boolean h) {
    return SgJson.map("on", h, "ago", moveAt > 0 ? t - moveAt : -1, "peak", Math.round((t - peakAt > 3000 ? 0 : peak) * 1000) / 1000.0, "thr", thr, "lock", !(screenOn && unlocked));
  }

  /** П25: телефон в руках — разблокирован и двигался за последние 10 с (в любой программе). */
  public synchronized boolean inHands(long t) { return screenOn && unlocked && moveAt > 0 && t - moveAt < 10000; }
  void handsCheck(long t) {
    boolean h = inHands(t);
    if (h && !wasHands) { handsAt = t; for (Rule r : rules) if ("hands".equals(r.sensor)) r.held = false; fire("hands", 0, t); }
    // П26: пульту — сразу при смене и раз в 3 с, пока он следит
    if (h != wasHands || (probe && t - statAt >= 3000)) { statAt = t; out.send(SgJson.str(SgJson.map("t", "stat", "hands", handsStat(t, h)))); }
    wasHands = h;
  }

  /** Сроки «дольше N с» после изменения экрана или приложения. */
  void plan(long t) {
    if (away() && awayAt == 0) awayAt = t;
    if (!away()) awayAt = 0;
    for (Rule r : rules) {
      if ("unlocked".equals(r.sensor)) r.next = screenOn && unlocked && r.seconds > 0 ? (r.next > 0 ? r.next : Math.max(presentAt, 1) + r.seconds * 1000) : 0;
      else if ("away".equals(r.sensor)) r.next = away() ? (r.next > 0 ? r.next : awayAt + Math.max(1, r.seconds) * 1000) : 0;
    }
  }

  /** Раз в секунду: «не блокировали дольше N с», «не в приложении дольше N с», «лежит экраном вниз N с». */
  public synchronized void tick(long t) {
    handsCheck(t);
    for (Rule r : rules) {
      if ("hands".equals(r.sensor) && r.seconds > 0 && !r.held && wasHands && t - handsAt >= r.seconds * 1000) { r.held = true; fireRule(r, t - handsAt, t); continue; }
      if (("unlocked".equals(r.sensor) || "away".equals(r.sensor)) && r.next > 0 && t >= r.next) {
        long from = "away".equals(r.sensor) ? awayAt : presentAt;
        r.next = t + Math.max(1, r.seconds) * 1000;   // пока так и есть — снова через N с
        fireRule(r, t - from, t);
      } else if (r.seconds > 0 && !r.held && (("facedown".equals(r.sensor) && "down".equals(face)) || ("faceup".equals(r.sensor) && "up".equals(face) && faceAt > 0))
        && t - faceAt >= r.seconds * 1000) {
        r.held = true;
        fireRule(r, t - faceAt, t);
      }
    }
  }

  /** Событие (не «держится»): правила этого вида без «дольше N с» или с N меньше dur. */
  void fire(String sensor, long dur, long t) {
    for (Rule r : new ArrayList<>(rules)) if (sensor.equals(r.sensor) && (r.seconds == 0 || dur >= r.seconds * 1000)) fireRule(r, dur, t);
  }

  /** Смена положения: «держится N с» — потом, в tick. */
  void fireNow(String sensor, long dur, long t) {
    for (Rule r : new ArrayList<>(rules)) if (sensor.equals(r.sensor) && (r.seconds == 0 || "flip".equals(sensor) && dur >= r.seconds * 1000)) fireRule(r, dur, t);
  }

  void fireRule(Rule r, long dur, long t) {
    if (r.every > 0 && r.last > 0 && t - r.last < r.every) return;
    if ("on".equals(r.screen) && !screenOn) return;
    if ("off".equals(r.screen) && screenOn) return;
    r.last = t;
    fired++;
    lastFired = r.id;
    long ct = out.now();
    int k = 0;
    seq++;
    for (Object x : r.net) {
      Map<String, Object> m = SgJson.m(SgJson.copy(x));
      if (m == null) continue;
      SgCenter.fill(m, ct);
      String id = "ph" + Long.toString(ct, 36) + "-" + (++k) + "-" + seq;
      if ("timer".equals(SgJson.s(m, "t")) || "msg".equals(SgJson.s(m, "t"))) m.put("id", id);
      out.send(SgJson.str(m));
    }
    List<Object> done = new ArrayList<>();
    for (Object x : r.local) {
      Map<String, Object> l = SgJson.m(x);
      String kind = SgJson.s(l, "kind");
      if (kind == null || done.contains(kind)) continue;
      if (("torch".equals(kind) || "beep".equals(kind) || "notify".equals(kind)) && out.local(kind, SgJson.m(l.get("body")))) done.add(kind);
    }
    long at = Math.max(ct, lastAt + 1);
    lastAt = at;
    out.toApp(SgJson.str(SgJson.map("t", "phone", "id", r.id, "sensor", r.sensor, "dur", dur, "done", done, "fg", fg, "screen", screenOn, "at", at)));
  }
}
