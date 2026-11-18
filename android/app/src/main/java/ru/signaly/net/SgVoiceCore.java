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
      f.net = p.get("net") instanceof List ? SgJson.a(p.get("net")) : null;
      for (Phrase old : phrases) if (old.id.equals(f.id)) f.last = old.last;   // пауза не сбрасывается при смене главы
      list.add(f);
    }
    // длинная фраза важнее короткой («слава лидеру всем» раньше «слава лидеру»)
    Collections.sort(list, (a, b) -> b.words.length - a.words.length);
    phrases = list;
    digits = !Boolean.FALSE.equals(o.get("digits"));
    Object mc = o.get("minConf");
    if (mc instanceof Number) minConf = ((Number) mc).doubleValue();
  }

  public synchronized boolean empty() { return phrases.isEmpty() && !digits; }

  /** Грамматика Vosk: фразы, цифры и [unk] (всё прочее — «непонятно», а не ближайшая фраза). */
  public synchronized String grammar() {
    LinkedHashSet<String> g = new LinkedHashSet<>();
    for (Phrase p : phrases) g.add(p.text);
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
