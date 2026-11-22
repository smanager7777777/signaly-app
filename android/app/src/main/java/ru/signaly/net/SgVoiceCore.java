package ru.signaly.net;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** СИГНАЛЫ: голосовые фразы (Vosk, режим грамматики) — что услышано и что делать.
 *  Чистая Java, без Android: служба кормит её результатами Vosk, проверка — tests/java/VoiceCheck.java.
 *
 *  Настройка приходит из приложения (SG.voiceConfig): {phrases: [{id, text, max, every, net}], digits, minConf}.
 *  net — готовые сообщения центру (действия кода для других телефонов); null — код целиком выполняет приложение
 *  (ограничения выдачи, подписи). Фраза с max/every сначала спрашивает центр (claim voice): кто первый — у того
 *  и срабатывает (решение автора П-58). Без связи — срабатывает сразу. */
public class SgVoiceCore {
  public interface Out {
    boolean up();                  // связь с центром есть
    long now();                    // время центра
    void send(String json);        // центру
    void toApp(String json);       // приложению (в журнал службы → JS)
  }

  static final class Phrase {
    String id, text;
    String[] words;
    long max, every, last;
    List<Object> net;
    boolean scr;   // П26 (06, 154): только при включённом экране в приложении
  }

  final Out out;
  List<Phrase> phrases = new ArrayList<>();
  boolean digits = true;
  double minConf = 0.6;
  final Map<String, Phrase> pending = new LinkedHashMap<>();
  final Map<String, Long> pendingAt = new LinkedHashMap<>();
  int seq;
  /** Для окна «ГОЛОС» в режиме мастера и замера батареи. */
  public volatile String lastText = "", lastWhat = "";
  public volatile double lastConf;
  public volatile long heardN, firedN, rejectedN;

  public SgVoiceCore(Out out) { this.out = out; }

  /** П26 (06, 154): приложение на экране и экран включён (null — считать, что да). Фразы «только при экране» иначе молчат. */
  public interface InApp { boolean inApp(); }
  public volatile InApp inApp;
  boolean inAppNow() { InApp f = inApp; return f == null || f.inApp(); }

  /* ---------- П16: проба голоса (Т7-3 А) ---------- */
  /** Знает ли модель слово (null — проверить нельзя). На телефоне — словарь Vosk, в проверках — свой. */
  public interface Known { Boolean knows(String word); }
  public volatile Known known;
  /** report — сообщать центру всё услышанное (пульт «ПРОБА ГОЛОСА»); free — свободное распознавание (без грамматики). */
  public volatile boolean report, free;
  public volatile long heardAt;

  /* ---------- П25 (06, 146): шпионаж текстом — этот телефон слушают ---------- */
  /** Есть ли в пакете «Перехват» (тогда микрофон нужен и без голоса: служба держит тип «микрофон»). */
  public volatile boolean spyable;
  /** П26 (06, 156): в пакете видео-шпионаж — службе нужен тип «камера»; какая камера. */
  public volatile boolean vidable, vidFront = true;
  /** П25: модель загрузить заранее (мини-игры голосом), даже если голос выключен. */
  public volatile boolean preload;
  /** Сеансы: ключ состояния центра «spy:<я>:<шпион>» → {sid, spy, until}. */
  final Map<String, String[]> spies = new LinkedHashMap<>();
  final Map<String, Long> spyUntil = new LinkedHashMap<>();
  final java.util.Set<String> spyAcked = new java.util.HashSet<>();
  /** Состояние центра для ключа spy:… (мой персонаж — me). true — изменилось, слушают ли (нужна новая грамматика). */
  public synchronized boolean spy(String me, String key, Map<String, Object> v) {
    if (key == null || me == null || !key.startsWith("spy:" + me + ":")) return false;
    boolean was = spyOn();
    String spyAcc = key.substring(("spy:" + me + ":").length());
    if (v == null || SgJson.s(v, "sid") == null) { spies.remove(key); spyUntil.remove(key); }
    else { spies.put(key, new String[] { SgJson.s(v, "sid"), spyAcc, snd(v), vid(v) }); spyUntil.put(key, SgJson.l(v, "until", 0)); }
    return was != spyOn();
  }
  /** Все сеансы разом (welcome): прежние забыть. */
  public synchronized boolean spyAll(String me, Map<String, Object> st) {
    boolean was = spyOn();
    spies.clear(); spyUntil.clear();
    if (st != null && me != null) for (Map.Entry<String, Object> e : st.entrySet()) if (e.getKey().startsWith("spy:" + me + ":")) {
      Map<String, Object> v = SgJson.m(e.getValue());
      if (v != null && SgJson.s(v, "sid") != null) { spies.put(e.getKey(), new String[] { SgJson.s(v, "sid"), e.getKey().substring(("spy:" + me + ":").length()), snd(v), vid(v) }); spyUntil.put(e.getKey(), SgJson.l(v, "until", 0)); }
    }
    return was != spyOn();
  }
  /* ---------- П26 (06, 150, 153): шпионаж звуком — 8 кГц, μ-закон, кусками по 0,5 с живым потоком ---------- */
  /** П26 (06, 156): сеансы с камерой — [sid, шпион]. */
  public synchronized List<String[]> spyVideo() {
    List<String[]> r = new java.util.ArrayList<>();
    long t = out.now();
    for (Map.Entry<String, String[]> e : spies.entrySet()) {
      Long u = spyUntil.get(e.getKey());
      String[] x = e.getValue();
      if ("1".equals(x[3]) && (u == null || u == 0 || t <= u + 5000)) r.add(x);
    }
    return r;
  }
  /** Кадр камеры (src: photo / none) — шпионам с камерой. */
  public void spyFrame(String src, String jpegB64) {
    if (!out.up()) return;
    for (String[] x : spyVideo()) {
      Map<String, Object> b = SgJson.map("k", "spv", "sid", x[0], "src", src);
      if (jpegB64 != null) b.put("d", jpegB64);
      out.send(SgJson.str(SgJson.map("t", "live", "to", java.util.Arrays.asList((Object) ("acc:" + x[1])), "body", b)));
    }
  }
  static String vid(Map<String, Object> v) { return Boolean.TRUE.equals(v.get("vid")) ? "1" : ""; }
  static String snd(Map<String, Object> v) { String s = SgJson.s(v, "snd"); return "sound".equals(s) || "both".equals(s) ? s : ""; }
  /** Нужен ли звук кому-то из шпионов. */
  public synchronized boolean spySound() {
    long t = out.now();
    for (Map.Entry<String, String[]> e : spies.entrySet()) {
      Long u = spyUntil.get(e.getKey());
      if (!e.getValue()[2].isEmpty() && (u == null || u == 0 || t <= u + 5000)) return true;
    }
    return false;
  }
  final byte[] aBuf = new byte[4000];
  int aN, aSeq, aHalf;
  float aPrev;
  /** Отсчёты микрофона 16 кГц (16 бит) → 8 кГц μ-закон; набралось 0,5 с — шпионам со звуком. */
  public void spyAudio(short[] f, int n) {
    if (!spySound()) { aN = 0; return; }
    for (int i = 0; i < n; i++) {
      if ((aHalf++ & 1) == 0) { aPrev = f[i]; continue; }
      aBuf[aN++] = ulaw((int) ((aPrev + f[i]) / 2));   // среднее пары — простой фильтр перед прореживанием
      if (aN == aBuf.length) { spyAudioSend(SgB64.enc(aBuf, aN)); aN = 0; }
    }
  }
  synchronized void spyAudioSend(String d) {
    if (!out.up()) return;
    long t = out.now();
    aSeq++;
    for (Map.Entry<String, String[]> e : spies.entrySet()) {
      Long u = spyUntil.get(e.getKey());
      String[] x = e.getValue();
      if (x[2].isEmpty() || (u != null && u != 0 && t > u + 5000)) continue;
      out.send(SgJson.str(SgJson.map("t", "live", "to", java.util.Arrays.asList((Object) ("acc:" + x[1])), "body", SgJson.map("k", "spa", "sid", x[0], "seq", (long) aSeq, "rate", 8000L, "d", d))));
    }
  }
  /** G.711 μ-закон: 16 бит → 1 байт. */
  public static byte ulaw(int s) {
    int sign = s < 0 ? 0x80 : 0;
    if (sign != 0) s = -s;
    if (s > 32635) s = 32635;
    s += 0x84;
    int e = 7;
    for (int m = 0x4000; (s & m) == 0 && e > 0; e--, m >>= 1) { /* старший бит */ }
    return (byte) (~(sign | (e << 4) | ((s >> (e + 3)) & 0x0f)) & 0xff);
  }

  /** Слушают ли сейчас (сеанс не кончился: until + 5 с запаса). */
  public synchronized boolean spyOn() {
    long t = out.now();
    for (Map.Entry<String, Long> e : spyUntil.entrySet()) if (e.getValue() == 0 || t <= e.getValue() + 5000) return true;
    return false;
  }
  /** Шпионам: телефон готов (и есть ли микрофон) — один раз на сеанс. */
  public synchronized void spyReady(boolean mic) {
    if (!out.up()) return;
    long t = out.now();
    for (Map.Entry<String, String[]> e : spies.entrySet()) {
      Long u = spyUntil.get(e.getKey());
      if (u != null && u != 0 && t > u + 5000) continue;
      String[] x = e.getValue();
      if (!spyAcked.add(x[0])) continue;
      out.send(SgJson.str(SgJson.map("t", "live", "to", java.util.Arrays.asList((Object) ("acc:" + x[1])), "body", SgJson.map("k", "spy", "sid", x[0], "ready", true, "mic", mic))));
    }
  }
  /** Услышанное (part — недоговорённое) — шпионам живым потоком центра. */
  public synchronized void spyText(String text, boolean part) {
    if (text == null || text.isEmpty() || !out.up()) return;
    long t = out.now();
    for (Map.Entry<String, String[]> e : spies.entrySet()) {
      Long u = spyUntil.get(e.getKey());
      if (u != null && u != 0 && t > u + 5000) continue;
      String[] x = e.getValue();
      if ("sound".equals(x[2])) continue;   // П26: только звук — текст не нужен
      out.send(SgJson.str(SgJson.map("t", "live", "to", java.util.Arrays.asList((Object) ("acc:" + x[1])), "body", SgJson.map("k", "spy", "sid", x[0], "text", text, "part", part))));
    }
  }
  /** Недоговорённое из частичного результата Vosk ({"partial": …}). */
  public void spyPartial(String json) {
    if (!spyOn()) return;
    try { String t = norm(SgJson.s(SgJson.obj(json), "partial")).replace("[unk]", "").trim(); if (!t.isEmpty()) spyText(t, true); } catch (RuntimeException ignored) { /* не JSON */ }
  }

  /** Состояние центра «probe»: {on, free}. true — нужна новая грамматика (сменился режим free). */
  public synchronized boolean probe(Map<String, Object> p) {
    boolean r = p != null && SgJson.b(p, "on"), f = r && SgJson.b(p, "free");
    boolean ch = f != free;
    report = r;
    free = f;
    return ch;
  }

  /** Слово так, как его знает модель: фразы хранятся без «ё» (norm), а словарь модели может знать только «зелёный». */
  public String spell(String w) {
    Known k = known;
    if (k == null || w.indexOf('е') < 0) return w;
    Boolean ok = k.knows(w);
    if (ok == null || ok) return w;
    for (int i = w.indexOf('е'); i >= 0; i = w.indexOf('е', i + 1)) {
      String v = w.substring(0, i) + 'ё' + w.substring(i + 1);
      if (Boolean.TRUE.equals(k.knows(v))) return v;
    }
    String all = w.replace('е', 'ё');
    return Boolean.TRUE.equals(k.knows(all)) ? all : w;
  }
  /** Слово, которого модель не знает ни с «е», ни с «ё»: true / false / null — проверить нельзя. */
  public Boolean unknown(String w) {
    Known k = known;
    if (k == null) return null;
    Boolean ok = k.knows(spell(w));
    return ok == null ? null : !ok;
  }

  public static String norm(String s) {
    return String.valueOf(s == null ? "" : s).toLowerCase(Locale.ROOT).replace('ё', 'е')
      .replaceAll("[^a-zа-я0-9\\[\\] ]+", " ").replaceAll("\\s+", " ").trim();
  }

  static final String[][] DIGITS = { { "ноль", "0" }, { "нуль", "0" }, { "один", "1" }, { "одна", "1" }, { "два", "2" }, { "две", "2" },
    { "три", "3" }, { "четыре", "4" }, { "пять", "5" }, { "шесть", "6" }, { "семь", "7" }, { "восемь", "8" }, { "девять", "9" } };

  static String digit(String w) {
    for (String[] d : DIGITS) if (d[0].equals(w)) return d[1];
    return null;
  }

  public synchronized void configure(String json) {
    Map<String, Object> o = SgJson.obj(json);
    List<Phrase> list = new ArrayList<>();
    for (Object x : SgJson.a(o.get("phrases"))) {
      Map<String, Object> p = SgJson.m(x);
      if (p == null) continue;
      Phrase f = new Phrase();
      f.id = SgJson.s(p, "id");
      f.text = norm(SgJson.s(p, "text"));
      if (f.id == null || f.text.isEmpty()) continue;
      f.words = f.text.split(" ");
      f.max = SgJson.l(p, "max", 0);
      f.every = SgJson.l(p, "every", 0);
      f.scr = Boolean.TRUE.equals(p.get("scr"));
      f.net = p.get("net") instanceof List ? SgJson.a(p.get("net")) : null;
      for (Phrase old : phrases) if (old.id.equals(f.id)) f.last = old.last;   // пауза не сбрасывается при смене главы
      list.add(f);
    }
    // длинная фраза важнее короткой («слава лидеру всем» раньше «слава лидеру»)
    Collections.sort(list, (a, b) -> b.words.length - a.words.length);
    phrases = list;
    digits = !Boolean.FALSE.equals(o.get("digits"));
    spyable = Boolean.TRUE.equals(o.get("spyable"));
    vidable = Boolean.TRUE.equals(o.get("vidable"));
    vidFront = !"back".equals(SgJson.s(o, "vidCam"));
    preload = Boolean.TRUE.equals(o.get("preload"));   // П25: в пакете мини-игры — модель загрузить заранее
    Object mc = o.get("minConf");
    if (mc instanceof Number) minConf = ((Number) mc).doubleValue();
  }

  /** Все слова фраз (без повторов) — для проверки по словарю модели. */
  public synchronized List<String> words() {
    LinkedHashSet<String> s = new LinkedHashSet<>();
    for (Phrase p : phrases) for (String w : p.words) if (!w.isEmpty()) s.add(w);
    return new ArrayList<>(s);
  }

  public synchronized boolean empty() { return !free && !spyOn() && phrases.isEmpty() && !digits; }

  /** Грамматика Vosk: фразы, цифры и [unk] (всё прочее — «непонятно», а не ближайшая фраза). */
  public synchronized String grammar() {
    if (free || spyOn()) return null;   // П16: свободное распознавание — без грамматики; П25: и пока этот телефон слушают
    LinkedHashSet<String> g = new LinkedHashSet<>();
    for (Phrase p : phrases) {
      StringBuilder b = new StringBuilder();
      for (String w : p.words) { if (b.length() > 0) b.append(' '); b.append(spell(w)); }
      g.add(b.toString());
    }
    if (digits) for (String[] d : DIGITS) g.add(d[0]);
    g.add("[unk]");
    return SgJson.str(new ArrayList<Object>(g));
  }

  /** Результат Vosk ({"text": …, "result": [{word, conf}]}). bg — фоновый режим (не кнопка). */
  public synchronized String heard(String resultJson, boolean bg) {
    Map<String, Object> r;
    try { r = SgJson.obj(resultJson); } catch (RuntimeException e) { return ""; }
    List<String> w = new ArrayList<>();
    List<Double> c = new ArrayList<>();
    List<Object> res = SgJson.a(r.get("result"));
    if (!res.isEmpty()) {
      for (Object x : res) {
        Map<String, Object> m = SgJson.m(x);
        if (m == null) continue;
        String word = norm(SgJson.s(m, "word"));
        if (word.isEmpty()) continue;
        w.add(word);
        Object cf = m.get("conf");
        c.add(cf instanceof Number ? ((Number) cf).doubleValue() : 1.0);
      }
    } else {
      for (String x : norm(SgJson.s(r, "text")).split(" ")) if (!x.isEmpty()) { w.add(x); c.add(1.0); }
    }
    return words(w, c, bg);
  }

  /** То же для проверок: текст целиком с одной уверенностью. */
  public synchronized String heardText(String text, double conf, boolean bg) {
    List<String> w = new ArrayList<>();
    List<Double> c = new ArrayList<>();
    for (String x : norm(text).split(" ")) if (!x.isEmpty()) { w.add(x); c.add(conf); }
    return words(w, c, bg);
  }

  String words(List<String> w, List<Double> c, boolean bg) {
    if (w.isEmpty()) return "";
    if (spyOn()) {   // П25: шпионам — всё услышанное (без «[unk]»)
      StringBuilder b = new StringBuilder();
      for (String x : w) if (!"[unk]".equals(x)) { if (b.length() > 0) b.append(' '); b.append(x); }
      spyText(b.toString(), false);
    }
    String r = match(w, c, bg);
    heardAt = out.now();
    if (report && out.up()) {
      // П16: проба голоса — всё услышанное на пульт мастера (и то, что не фраза)
      double sum = 0;
      for (double x : c) sum += x;
      boolean unk = true;
      for (String x : w) if (!"[unk]".equals(x)) unk = false;
      out.send(SgJson.str(SgJson.map("t", "stat", "heard", SgJson.map("text", String.join(" ", w), "conf", c.isEmpty() ? 0 : Math.round(sum / c.size() * 100) / 100.0,
        "what", unk ? "не разобрано" : lastWhat, "res", r, "free", free, "bg", bg, "at", heardAt))));
    }
    return r;
  }

  String match(List<String> w, List<Double> c, boolean bg) {
    lastWhat = "";
    boolean any = false;
    for (String x : w) if (!"[unk]".equals(x)) any = true;
    if (!any) return "";
    heardN++;
    lastText = String.join(" ", w);
    double sum = 0;
    for (double x : c) sum += x;
    lastConf = c.isEmpty() ? 0 : sum / c.size();
    for (Phrase p : phrases) {
      int at = find(w, p.words);
      if (at < 0) continue;
      double s = 0;
      for (int k = 0; k < p.words.length; k++) s += c.get(at + k);
      double conf = s / p.words.length;
      if (conf < minConf) { lastWhat = "не уверен (" + Math.round(conf * 100) + " %): " + p.text; return "low:" + p.id; }
      if (p.scr && !inAppNow()) { lastWhat = "только при экране: " + p.text; rejectedN++; return "scr:" + p.id; }
      return trigger(p, bg);
    }
    if (digits) {
      StringBuilder d = new StringBuilder();
      double s = 0;
      for (int k = 0; k < w.size(); k++) {
        String g = digit(w.get(k));
        if (g == null) { d = null; break; }
        d.append(g);
        s += c.get(k);
      }
      if (d != null && d.length() > 0) {
        if (s / w.size() < minConf) { lastWhat = "не уверен в цифрах"; return "low:digits"; }
        lastWhat = "цифры " + d;
        out.toApp(SgJson.str(SgJson.map("t", "voice", "digits", d.toString(), "bg", bg, "text", lastText, "at", stamp())));
        return "digits:" + d;
      }
    }
    lastWhat = "не фраза";
    return "";
  }

  static int find(List<String> w, String[] p) {
    outer:
    for (int i = 0; i + p.length <= w.size(); i++) {
      for (int k = 0; k < p.length; k++) if (!w.get(i + k).equals(p[k])) continue outer;
      return i;
    }
    return -1;
  }

  String trigger(Phrase p, boolean bg) {
    long t = out.now();
    if (p.every > 0 && p.last > 0 && t - p.last < p.every) { lastWhat = "пауза: " + p.text; rejectedN++; return "cool:" + p.id; }
    if ((p.max > 0 || p.every > 0) && out.up()) {
      // старые запросы без ответа (связь пропала) — забыть
      pendingAt.entrySet().removeIf(e -> t - e.getValue() > 6000 && pending.remove(e.getKey()) != null);
      String id = "vj" + (++seq) + "-" + Long.toString(t, 36);
      pending.put(id, p);
      pendingAt.put(id, t);
      lastWhat = "спрашиваю центр: " + p.text;
      out.send(SgJson.str(SgJson.map("t", "claim", "id", id, "key", "voice:" + p.id, "voice", true, "max", p.max, "every", p.every)));
      return "ask:" + p.id;
    }
    fire(p, bg);
    return "fire:" + p.id;
  }

  void fire(Phrase p, boolean bg) {
    long t = out.now();
    p.last = t;
    firedN++;
    lastWhat = "сработала: " + p.text;
    if (p.net != null) {
      int k = 0;
      for (Object x : p.net) {
        Map<String, Object> m = SgJson.m(SgJson.copy(x));
        if (m == null) continue;
        SgCenter.fill(m, t);
        String id = "v" + Long.toString(t, 36) + "-" + (++k) + "-" + seq;
        if ("timer".equals(SgJson.s(m, "t")) || "msg".equals(SgJson.s(m, "t"))) m.put("id", id);
        out.send(SgJson.str(m));
      }
    }
    out.toApp(SgJson.str(SgJson.map("t", "voice", "code", p.id, "netDone", p.net != null, "bg", bg, "text", lastText, "at", stamp())));
  }

  long lastAt;
  /** Метка события для приложения: растёт строго (приложение не выполняет одно событие дважды после перезагрузки). */
  long stamp() { long t = Math.max(out.now(), lastAt + 1); lastAt = t; return t; }

  /** Ответ центра на запрос фразы. true — это был наш запрос. */
  public synchronized boolean claimed(Map<String, Object> o) {
    String id = SgJson.s(o, "id");
    if (id == null || !id.startsWith("vj")) return false;
    Phrase p = pending.remove(id);
    pendingAt.remove(id);
    if (p == null) return true;
    if (SgJson.b(o, "ok")) fire(p, true);
    else {
      rejectedN++;
      p.last = out.now();
      lastWhat = ("cool".equals(SgJson.s(o, "reason")) ? "пауза (центр): " : "уже сработала на другом телефоне: ") + p.text;
    }
    return true;
  }
}
