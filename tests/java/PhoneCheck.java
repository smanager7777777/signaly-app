import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import ru.signaly.net.SgJson;
import ru.signaly.net.SgPhoneCore;

/** П17 (Т8-6 Б): события телефона в службе — встряхнули, положение, экран, «не в приложении», когда работает правило. */
public class PhoneCheck {
  static int fails = 0;
  static void ok(boolean c, String what) { System.out.println((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; }
  static long T = 1000000;
  static final List<String> sent = new ArrayList<>(), app = new ArrayList<>(), local = new ArrayList<>();
  static boolean fgNow = true;

  static Map<String, Object> rule(String id, String sensor, long seconds, String screen, long every) {
    List<Object> net = new ArrayList<>();
    net.add(SgJson.map("t", "msg", "to", new ArrayList<>(java.util.Arrays.asList("all")), "kind", "notify", "body", SgJson.map("title", id, "text", "{{now}}")));
    List<Object> loc = new ArrayList<>();
    loc.add(SgJson.map("kind", "torch", "body", SgJson.map("n", 2L)));
    loc.add(SgJson.map("kind", "notify", "body", SgJson.map("title", "ВЕРНИТЕСЬ", "text", "")));
    loc.add(SgJson.map("kind", "open", "body", SgJson.map("blocks", new ArrayList<>())));
    return SgJson.map("id", id, "sensor", sensor, "seconds", seconds, "screen", screen, "every", every, "net", net, "local", loc);
  }
  static int count(List<String> l, String s) { int n = 0; for (String x : l) if (x.contains(s)) n++; return n; }
  static void clear() { sent.clear(); app.clear(); local.clear(); }
  static void run(SgPhoneCore c, long ms) { for (long k = 0; k < ms; k += 500) { T += 500; c.tick(T); } }
  static void shake(SgPhoneCore c) { for (int i = 0; i < 3; i++) { T += 200; c.motion(0, 0, 30, T); T += 50; c.motion(0, 0, 9.8, T); } }
  static void lay(SgPhoneCore c, double z) { for (int i = 0; i < 6; i++) { T += 200; c.motion(0, 0, z, T); } }

  public static void main(String[] a) {
    SgPhoneCore c = new SgPhoneCore(new SgPhoneCore.Out() {
      public long now() { return T; }
      public void send(String json) { sent.add(json); }
      public void toApp(String json) { app.add(json); }
      public boolean local(String kind, Map<String, Object> body) { if ("notify".equals(kind) && fgNow) return false; local.add(kind); return true; }
    });
    List<Object> rules = new ArrayList<>();
    rules.add(rule("rShake", "shake", 0, "", 0));
    rules.add(rule("rShakeOff", "shake", 0, "off", 0));
    rules.add(rule("rDown", "facedown", 0, "", 0));
    rules.add(rule("rDown3", "facedown", 3, "", 0));
    rules.add(rule("rLocked", "locked", 5, "", 0));
    rules.add(rule("rUnl", "unlocked", 10, "on", 0));
    rules.add(rule("rAway", "away", 4, "", 0));
    c.configure(SgJson.str(SgJson.map("rules", rules)));
    ok(c.needsMotion() && c.needsTick() && c.any(), "акселерометр и таймер нужны (есть правила)");

    shake(c);
    ok(count(app, "\"id\":\"rShake\"") == 1 && count(app, "rShakeOff") == 0, "встряхнули при включённом экране: «всегда» — да, «только при выключенном» — нет");
    ok(count(sent, "\"title\":\"rShake\"") == 1 && !sent.get(0).contains("{{now}}") && sent.get(0).contains("\"id\":\"ph"), "сообщение центру с временем и номером");
    ok(local.contains("torch") && !local.contains("notify") && app.get(0).contains("\"done\":[\"torch\"]"), "вспышка — сама служба; уведомление при открытом приложении — приложению");
    clear();
    T += 2000;
    c.screen("off", T);
    shake(c);
    ok(count(app, "rShakeOff") == 1 && count(app, "\"id\":\"rShake\"") == 1, "встряхнули с погашенным экраном: срабатывают оба (в кармане)");
    clear();
    lay(c, -9.6);
    ok(count(app, "\"id\":\"rDown\"") == 1 && count(app, "rDown3") == 0, "экраном вниз: сразу — правило без «дольше», «дольше 3 с» — ещё нет");
    run(c, 3500);
    ok(count(app, "rDown3") == 1, "лежит экраном вниз 3 с — «дольше 3 с» сработало");
    run(c, 3000);
    ok(count(app, "rDown3") == 1, "и только один раз за это положение");
    clear();
    run(c, 4000);
    c.screen("on", T);
    c.screen("present", T);
    ok(count(app, "rLocked") == 1 && app.get(app.size() - 1).contains("\"dur\":"), "разблокировали после 5+ с — «экран заблокирован дольше 5 с»");
    clear();
    c.screen("off", T); T += 2000; c.screen("present", T);
    ok(count(app, "rLocked") == 0, "заблокирован 2 с — не срабатывает");
    // не блокировали дольше 10 с (только при включённом экране)
    clear();
    run(c, 10500);
    ok(count(app, "rUnl") == 1, "не блокировали 10 с — сработало");
    run(c, 10000);
    ok(count(app, "rUnl") == 2, "и снова через 10 с");
    // игрок свернул приложение: экран горит, приложение не на экране
    clear();
    fgNow = false;
    c.foreground(false, T);
    run(c, 3000);
    ok(count(app, "rAway") == 0, "свернул 3 с — ещё нет");
    run(c, 1500);
    ok(count(app, "rAway") == 1, "свернул дольше 4 с — «не в приложении»");
    ok(local.contains("notify"), "приложение не на экране — уведомление в шторку делает служба");
    run(c, 4000);
    ok(count(app, "rAway") == 2, "всё ещё не в приложении — снова через 4 с");
    c.screen("off", T);
    run(c, 9000);
    ok(count(app, "rAway") == 2, "экран погас — «не в приложении» не считается");
    c.screen("present", T);
    c.foreground(true, T);
    fgNow = true;
    run(c, 6000);
    ok(count(app, "rAway") == 2, "вернулся в приложение — не срабатывает");
    // every: не чаще раза в N
    List<Object> r2 = new ArrayList<>();
    r2.add(rule("rE", "shake", 0, "", 60000));
    c.configure(SgJson.str(SgJson.map("rules", r2)));
    clear();
    shake(c); T += 2000; shake(c);
    ok(count(app, "\"id\":\"rE\"") == 1, "«не чаще раза в 60 с»: второе встряхивание молчит");
    ok(!c.needsTick(), "без правил «дольше N» таймер не нужен");
    // П25 (06, 149): «в руках» — разблокирован и мелкие движения за 10 с; правило «взяли в руки» и «держат дольше 5 с»
    List<Object> r3 = new ArrayList<>();
    r3.add(rule("rH", "hands", 0, "", 0));
    r3.add(rule("rH5", "hands", 5, "", 0));
    c.configure(SgJson.str(SgJson.map("rules", r3)));
    clear();
    c.screen("present", T);
    for (int i = 0; i < 5; i++) { T += 100; c.motion(0, 0, 9.8, T); }
    T += 11000; c.tick(T); clear();
    for (int i = 0; i < 5; i++) { T += 100; c.motion(0, 0, 9.8, T); }
    ok(!c.inHands(T) && count(app, "\"id\":\"rH\"") == 0, "П25: лежит неподвижно — не в руках");
    T += 100; c.motion(0.2, 0.1, 9.8, T);
    ok(c.inHands(T) && count(app, "\"id\":\"rH\"") == 1, "П25: дрогнул в руке — «в руках», правило «взяли в руки»");
    for (int i = 0; i < 6; i++) { T += 1000; c.motion(0.2 * (i % 2), 0.1, 9.8, T); c.tick(T); }
    ok(count(app, "\"id\":\"rH5\"") == 1, "П25: держат дольше 5 с — сработало один раз");
    T += 11000; c.tick(T);
    ok(!c.inHands(T), "П25: 10 с без движения — уже не в руках");
    c.screen("off", T);
    T += 100; c.motion(0.3, 0.1, 9.8, T);
    ok(!c.inHands(T), "П25: экран погашен (в кармане) — не в руках");
    c.configure("{\"rules\":[],\"hands\":true}");
    ok(c.needsMotion() && c.any(), "П25: «в руках» нужен (адресат или взлом) — акселерометр включён и без правил");
    c.configure("{\"rules\":[]}");
    ok(!c.needsMotion() && !c.any(), "нет правил — датчики выключены");
    System.out.println(fails == 0 ? "PHONE OK" : "PHONE FAIL " + fails);
    System.exit(fails == 0 ? 0 : 1);
  }
}
