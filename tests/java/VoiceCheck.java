import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import ru.signaly.net.SgCenter;
import ru.signaly.net.SgJson;
import ru.signaly.net.SgLink;
import ru.signaly.net.SgVad;
import ru.signaly.net.SgVoiceCore;

/** Проверка голоса без Android (тот же код, что в службе): детектор голоса, разбор фраз и цифр,
 *  «кто первый — у того и сработало» и пауза через настоящий центр, удалённый сбой на другом телефоне.
 *  Распознанная фраза имитируется текстом (как результат Vosk). Печатает VOICE OK/FAIL. */
public class VoiceCheck {
  static int fails = 0;
  static void ok(boolean c, String what) { System.out.println((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; }

  static class Phone {
    final List<String> got = new ArrayList<>(), app = new ArrayList<>();
    final boolean[] up = { false };
    final SgLink link;
    final SgVoiceCore core;
    Phone(String url, String acc) {
      final Phone me = this;
      core = new SgVoiceCore(new SgVoiceCore.Out() {
        public boolean up() { return me.up[0]; }
        public long now() { return System.currentTimeMillis(); }
        public void send(String json) { me.link.send(json); }
        public void toApp(String json) { synchronized (app) { app.add(json); } }
      });
      link = new SgLink(new SgLink.Listener() {
        public void onText(String t) {
          synchronized (got) { got.add(t); }
          Map<String, Object> o = SgJson.obj(t);
          if ("claimed".equals(SgJson.s(o, "t"))) core.claimed(o);
        }
        public void onStatus(boolean c, String info) { up[0] = c; }
      });
      if (url != null) link.start(url, "{\"t\":\"hello\",\"role\":\"phone\",\"dev\":\"V" + acc + "\",\"acc\":\"" + acc + "\"}");
    }
    int fired(String code) { int n = 0; synchronized (app) { for (String s : app) if (s.contains("\"code\":\"" + code + "\"")) n++; } return n; }
  }

  static short[] frame(double amp, double freq, int k) {
    short[] f = new short[SgVad.FRAME];
    java.util.Random r = new java.util.Random(k);
    for (int i = 0; i < f.length; i++) {
      double t = (k * SgVad.FRAME + i) / (double) SgVad.RATE;
      double v = amp * Math.sin(2 * Math.PI * freq * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t)) + 0.003 * r.nextGaussian();
      f[i] = (short) Math.max(-32767, Math.min(32767, v * 32767));
    }
    return f;
  }

  public static void main(String[] a) throws Exception {
    // ---------- детектор голоса ----------
    SgVad vad = new SgVad(1);
    int k = 0, starts = 0, ends = 0;
    for (int i = 0; i < 250; i++) { int s = vad.push(frame(0, 0, k), SgVad.FRAME); k++; if (s == SgVad.START) starts++; }   // 5 с тишины
    ok(starts == 0 && vad.fed == 0, "тишина 5 с: распознаватель не получает звук (" + vad.fed + " кадров)");
    List<short[]> pre = null;
    for (int i = 0; i < 60; i++) { int s = vad.push(frame(0.3, 220, k), SgVad.FRAME); k++; if (s == SgVad.START) { starts++; pre = vad.preroll(); } }
    ok(starts == 1, "речь 1,2 с: начало фразы замечено один раз");
    ok(pre != null && pre.size() >= 3 && pre.size() <= 15, "перед речью отдан запас (" + (pre == null ? 0 : pre.size()) + " кадров)");
    for (int i = 0; i < 60; i++) { int s = vad.push(frame(0, 0, k), SgVad.FRAME); k++; if (s == SgVad.END) ends++; }
    ok(ends == 1 && !vad.inSpeech(), "после 0,8 с тишины фраза закрыта");
    long fedBefore = vad.fed;
    for (int i = 0; i < 500; i++) { vad.push(frame(0, 0, k), SgVad.FRAME); k++; }
    ok(vad.fed == fedBefore, "дальше тишина — снова ничего не распознаётся");
    double share = (double) vad.fed / vad.frames;
    ok(share < 0.15, "за ~17 с распознавалось " + Math.round(share * 100) + " % звука");
    SgVad vad2 = new SgVad(1);
    int st2 = 0;
    for (int i = 0; i < 300; i++) { if (vad2.push(frame(0.01, 300, i), SgVad.FRAME) == SgVad.START) st2++; }
    ok(st2 <= 1, "ровный тихий гул не считается речью всё время (" + st2 + ")");

    // ---------- разбор фраз ----------
    final List<String> sent = new ArrayList<>(), app = new ArrayList<>();
    final boolean[] up = { false };
    SgVoiceCore c = new SgVoiceCore(new SgVoiceCore.Out() {
      public boolean up() { return up[0]; }
      public long now() { return System.currentTimeMillis(); }
      public void send(String json) { sent.add(json); }
      public void toApp(String json) { app.add(json); }
    });
    c.configure("{\"phrases\":[{\"id\":\"kB\",\"text\":\"Императив блок\",\"net\":null},"
      + "{\"id\":\"kB2\",\"text\":\"императив блок второй\",\"max\":1,\"net\":[{\"t\":\"msg\",\"to\":[\"acc:a2\"],\"kind\":\"glitch\",\"body\":{\"id\":\"g9\"}}]},"
      + "{\"id\":\"kF\",\"text\":\"слава лидеру\",\"every\":60000,\"net\":[]}],\"digits\":true,\"minConf\":0.6}");
    String g = c.grammar();
    ok(g.contains("\"императив блок\"") && g.contains("\"слава лидеру\"") && g.contains("\"[unk]\"") && g.contains("\"семь\""), "грамматика: фразы, цифры и [unk]");
    ok(c.heardText("императив блок", 0.9, true).equals("fire:kB"), "«императив блок» → код kB (без центра: выполняет приложение)");
    ok(app.size() == 1 && app.get(0).contains("\"netDone\":false"), "приложению: сработал kB, сеть — на приложении");
    ok(c.heardText("[unk] императив блок второй", 0.9, true).equals("fire:kB2"), "длинная фраза важнее короткой; без связи — сразу");
    ok(sent.size() == 1 && sent.get(0).contains("\"acc:a2\"") && sent.get(0).contains("\"id\":\"v"), "сообщение второму телефону ушло с номером");
    ok(c.heardText("императив", 0.9, true).equals(""), "половина фразы — не фраза");
    ok(c.heardText("императив блок", 0.3, true).startsWith("low:"), "низкая уверенность — не срабатывает");
    ok(c.heardText("Слава лидеру!", 0.8, false).equals("fire:kF"), "регистр и знаки не мешают; ё = е");
    ok(c.heardText("слава лидеру", 0.8, false).startsWith("cool:"), "пауза 60 с: второй раз подряд — молчит");
    // П26 (06, 154): фраза «только при экране в приложении»
    final boolean[] inApp = { false };
    SgVoiceCore sc = new SgVoiceCore(new SgVoiceCore.Out() {
      public boolean up() { return false; }
      public long now() { return System.currentTimeMillis(); }
      public void send(String json) { }
      public void toApp(String json) { }
    });
    sc.configure("{\"phrases\":[{\"id\":\"kS\",\"text\":\"только при экране\",\"scr\":true,\"net\":null},{\"id\":\"kN\",\"text\":\"всегда в фоне\",\"net\":null}]}");
    sc.inApp = () -> inApp[0];
    ok(sc.heardText("только при экране", 0.9, true).equals("scr:kS") && sc.lastWhat.startsWith("только при экране"), "П26: «только при экране» — экран погашен или приложение свёрнуто → молчит");
    ok(sc.heardText("всегда в фоне", 0.9, true).equals("fire:kN"), "П26: обычная фраза — срабатывает в фоне");
    inApp[0] = true;
    ok(sc.heardText("только при экране", 0.9, false).equals("fire:kS"), "П26: приложение на экране — срабатывает");
    // П16: проба голоса — словарь с «ё», всё услышанное центру, свободное распознавание
    final java.util.Set<String> dict = new java.util.HashSet<>(java.util.Arrays.asList("зелёный", "апельсин", "лежит", "в", "траве", "императив", "блок", "второй", "слава", "лидеру"));
    SgVoiceCore q = new SgVoiceCore(new SgVoiceCore.Out() {
      public boolean up() { return true; }
      public long now() { return System.currentTimeMillis(); }
      public void send(String json) { sent.add(json); }
      public void toApp(String json) { app.add(json); }
    });
    q.known = w -> dict.contains(w);
    q.configure("{\"phrases\":[{\"id\":\"p1\",\"text\":\"апельсин\"},{\"id\":\"p2\",\"text\":\"зелёный апельсин лежит в траве\"},{\"id\":\"p3\",\"text\":\"синий кит\"}],\"digits\":false}");
    String qg = q.grammar();
    ok(qg.contains("\"зелёный апельсин лежит в траве\""), "П16: в грамматике слово так, как знает модель («зелёный» с ё): " + qg);
    ok(Boolean.TRUE.equals(q.unknown("синий")) && Boolean.FALSE.equals(q.unknown("зеленый")), "П16: «Модель не знает» — с ё/е не путается");
    int s0 = sent.size();
    q.heardText("зелёный апельсин лежит в траве", 0.9, true);
    ok(sent.size() == s0, "без пробы услышанное центру не уходит");
    q.probe(SgJson.obj("{\"on\":true}"));
    ok(q.heardText("зелёный апельсин лежит в траве", 0.9, true).equals("fire:p2") && sent.size() == s0 + 1 && sent.get(s0).contains("\"t\":\"stat\"")
      && sent.get(s0).contains("\"heard\"") && sent.get(s0).contains("сработала: зеленый апельсин лежит в траве"), "П16: проба — услышанное и итог центру: " + (sent.size() > s0 ? sent.get(s0) : ""));
    q.heardText("[unk]", 0.5, true);
    ok(sent.size() == s0 + 2 && sent.get(s0 + 1).contains("не разобрано"), "проба: и то, что не разобрано");
    ok(!q.probe(SgJson.obj("{\"on\":true}")) && q.probe(SgJson.obj("{\"on\":true,\"free\":true}")) && q.grammar() == null && !q.empty(), "свободное распознавание — без грамматики (смена режима → новая грамматика)");
    ok(q.heardText("ну вот зелёный апельсин лежит в траве и всё", 0.8, true).equals("fire:p2") && sent.get(sent.size() - 1).contains("\"free\":true"), "в свободном тексте пароль находится");
    ok(q.probe(null) && !q.report && q.grammar() != null, "проба выключена — снова грамматика, центру не сообщает");
    String d = c.heardText("один два три четыре", 0.9, true);
    ok(d.equals("digits:1234") && app.get(app.size() - 1).contains("\"bg\":true"), "цифры голосом: «один два три четыре» → 1234 (" + d + ")");
    ok(c.heardText("два [unk] три", 0.9, true).equals(""), "цифры с непонятным словом — не код");
    ok(c.heard("{\"text\":\"императив блок\",\"result\":[{\"word\":\"императив\",\"conf\":0.95},{\"word\":\"блок\",\"conf\":0.2}]}", true).startsWith("low:")
      && c.heard("{\"text\":\"императив блок\",\"result\":[{\"word\":\"императив\",\"conf\":0.95},{\"word\":\"блок\",\"conf\":0.8}]}", true).equals("fire:kB"),
      "результат Vosk: уверенность по словам фразы");
    up[0] = true;
    ok(c.heardText("императив блок второй", 0.9, true).equals("ask:kB2"), "со связью и пределом — сначала запрос центру");
    ok(sent.get(sent.size() - 1).contains("\"voice\":true") && sent.get(sent.size() - 1).contains("\"max\":1"), "запрос: голос, не больше 1 телефона");

    // ---------- через центр ----------
    File f = File.createTempFile("sgvoice", ".json");
    f.delete();
    int port = 18781;
    SgCenter center = new SgCenter(f);
    center.start(port);
    String url = "ws://127.0.0.1:" + port;
    Phone p1 = new Phone(url, "a1"), p2 = new Phone(url, "a2"), p3 = new Phone(url, "a3");
    waitFor(() -> p1.up[0] && p2.up[0] && p3.up[0], 5000);
    ok(p1.up[0] && p2.up[0] && p3.up[0], "три телефона в сети");
    Thread.sleep(300);
    String cfg = "{\"phrases\":[{\"id\":\"kR\",\"text\":\"императив блок второй\",\"max\":1,\"every\":0,"
      + "\"net\":[{\"t\":\"msg\",\"to\":[\"acc:a2\"],\"kind\":\"glitch\",\"body\":{\"id\":\"gB\"}}]},"
      + "{\"id\":\"kA\",\"text\":\"тревога\",\"max\":0,\"every\":4000,\"net\":[]},"
      + "{\"id\":\"kT\",\"text\":\"отсчёт\",\"max\":1,\"net\":[{\"t\":\"set\",\"key\":\"countdown\",\"value\":{\"on\":true,\"until\":\"{{now+60000}}\"}}]}]}";
    for (Phone p : new Phone[] { p1, p2, p3 }) p.core.configure(cfg);
    // фразу расслышали все три телефона почти одновременно; max 1
    p1.core.heardText("императив блок второй", 0.9, true);
    p3.core.heardText("императив блок второй", 0.9, true);
    waitFor(() -> p1.fired("kR") + p3.fired("kR") >= 1 && p1.core.rejectedN + p3.core.rejectedN >= 1, 3000);
    ok(p1.fired("kR") + p3.fired("kR") == 1, "предел 1: сработало только на одном телефоне (" + p1.fired("kR") + "+" + p3.fired("kR") + ")");
    ok(p1.core.rejectedN + p3.core.rejectedN == 1, "второму центр ответил «уже сработала»: " + (p1.core.lastWhat + " / " + p3.core.lastWhat));
    waitFor(() -> has(p2.got, "\"gB\""), 3000);
    ok(has(p2.got, "\"kind\":\"glitch\"") && has(p2.got, "\"gB\""), "второй телефон получил сбой от ключевой фразы");
    // все расслышавшие, но с паузой 4 с
    p1.core.heardText("тревога", 0.9, true);
    p2.core.heardText("тревога", 0.9, true);
    p3.core.heardText("тревога", 0.9, true);
    waitFor(() -> p1.fired("kA") + p2.fired("kA") + p3.fired("kA") >= 3, 3000);
    ok(p1.fired("kA") + p2.fired("kA") + p3.fired("kA") == 3, "без предела: сработало у всех трёх");
    Thread.sleep(3300);   // одно срабатывание кончилось, пауза ещё идёт
    p2.core.heardText("тревога", 0.9, true);
    waitFor(() -> p2.core.rejectedN >= 1, 3000);
    ok(p2.fired("kA") == 1 && p2.core.lastWhat.contains("пауза"), "пауза 4 с — центр не дал сработать снова: " + p2.core.lastWhat);
    Thread.sleep(1200);
    p2.core.heardText("тревога", 0.9, true);
    waitFor(() -> p2.fired("kA") >= 2, 3000);
    ok(p2.fired("kA") == 2, "после паузы — снова срабатывает");
    // подстановка времени центра в действие
    p1.core.heardText("отсчёт", 0.9, true);
    waitFor(() -> has(p3.got, "\"countdown\""), 3000);
    String cd = find(p3.got, "\"countdown\"");
    ok(cd != null && !cd.contains("{{now") && cd.contains("\"until\":1"), "время в действии подставлено числом");
    // П25 (06, 146): шпионаж текстом — p3 шпионит за p1: центр «spy:a1:a3», p1 слушает свободно и шлёт услышанное живым потоком
    ok(p1.core.grammar() != null, "П25: до сеанса — грамматика");
    long until = System.currentTimeMillis() + 60000;
    Map<String, Object> sv = SgJson.map("sid", "s1", "at", System.currentTimeMillis(), "until", until);
    ok(p1.core.spy("a1", "spy:a1:a3", sv) && p1.core.spyOn() && p1.core.grammar() == null, "П25: слушают — свободное распознавание (без грамматики)");
    ok(!p2.core.spy("a2", "spy:a1:a3", sv) && !p2.core.spyOn(), "П25: чужой сеанс не трогает другой телефон");
    p1.core.spyReady(true);
    waitFor(() -> has(p3.got, "\"ready\":true"), 3000);
    ok(has(p3.got, "\"t\":\"live\"") && has(p3.got, "\"sid\":\"s1\""), "П25: шпион получил «готов» (live, не из журнала)");
    p1.core.heardText("где лежит ключ от шлюза", 0.9, true);
    waitFor(() -> has(p3.got, "ключ от шлюза"), 3000);
    ok(has(p3.got, "где лежит ключ от шлюза") && !has(p2.got, "ключ от шлюза"), "П25: речь жертвы — у шпиона, у третьего телефона — нет");
    p1.core.spyPartial("{\"partial\":\"медленно идёт\"}");
    waitFor(() -> has(p3.got, "\"part\":true"), 3000);
    ok(has(p3.got, "медленно идет"), "П25: недоговорённое — серой строкой (part)");
    p1.core.heardText("слава лидеру", 0.9, true);
    ok(p1.core.spy("a1", "spy:a1:a3", null) && !p1.core.spyOn() && p1.core.grammar() != null, "П25: сеанс кончился — снова грамматика");
    Map<String, Object> old = SgJson.map("sid", "s2", "at", 1, "until", System.currentTimeMillis() - 10000);
    p1.core.spy("a1", "spy:a1:a3", old);
    ok(!p1.core.spyOn(), "П25: просроченный сеанс (until прошёл) — не слушают");
    for (Phone p : new Phone[] { p1, p2, p3 }) p.link.stop();
    center.stop();
    System.out.println(fails == 0 ? "VOICE OK" : "VOICE FAIL " + fails);
    System.exit(fails == 0 ? 0 : 1);
  }

  interface Cond { boolean ok(); }
  static void waitFor(Cond c, long ms) throws InterruptedException {
    long t = System.currentTimeMillis() + ms;
    while (!c.ok() && System.currentTimeMillis() < t) Thread.sleep(30);
  }
  static boolean has(List<String> l, String s) { return find(l, s) != null; }
  static String find(List<String> l, String s) { synchronized (l) { for (String x : l) if (x.contains(s)) return x; } return null; }
}
