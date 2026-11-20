import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import ru.signaly.net.SgCenter;
import ru.signaly.net.SgJson;
import ru.signaly.net.SgLink;
import ru.signaly.net.SgReplica;

/** П17 (Т8-1 А): запасной центр. Копия состояния на телефонах (только недостающее), «Поднять центр отсюда»
 *  из копии, телефоны сами находят новый центр, старый центр уступает (stale), выгрузка и загрузка файлом. */
public class BackupCheck {
  static int fails = 0;
  static void ok(boolean c, String what) { System.out.println((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; }
  interface Cond { boolean ok(); }
  static void wait(Cond c, long ms) throws InterruptedException { long t = System.currentTimeMillis() + ms; while (System.currentTimeMillis() < t && !c.ok()) Thread.sleep(50); }

  static class Phone {
    final List<String> got = new ArrayList<>();
    final boolean[] up = { false };
    final SgLink link;
    final SgReplica rep;
    Phone(String url, String dev, String acc, String role, File repFile, List<String> find) { this(url, dev, acc, role, repFile, find, 0, null); }
    Phone(String url, String dev, String acc, String role, File repFile, List<String> find, long gen, String epoch) {
      rep = repFile == null ? null : new SgReplica(repFile);
      link = new SgLink(new SgLink.Listener() {
        public void onText(String t) { synchronized (got) { got.add(t); } }
        public void onStatus(boolean c, String info) { up[0] = c; }
      });
      link.replica = rep;
      link.finder = () -> find;
      link.findAfter = 2;
      link.probeMs = 400;
      link.gen = gen;
      Map<String, Object> h = SgJson.map("t", "hello", "role", role, "dev", dev, "acc", acc, "name", dev);
      if (epoch != null) h.put("epoch", epoch);
      link.start(url, SgJson.str(h));
    }
    boolean has(String s) { synchronized (got) { for (String t : got) if (t.contains(s)) return true; } return false; }
    int count(String s) { int n = 0; synchronized (got) { for (String t : got) if (t.startsWith("{\"t\":\"msg\"") && t.contains(s)) n++; } return n; }
    void send(Object o) { link.send(SgJson.str(o)); }
  }

  static Long num(Object v) { return v instanceof Number ? ((Number) v).longValue() : null; }

  static Map<String, Object> msg(String id, List<Object> to, String text, boolean anon) {
    Map<String, Object> b = SgJson.map("text", text);
    if (anon) b.put("anon", true);
    return SgJson.map("t", "msg", "id", id, "to", to, "kind", "chat", "body", b);
  }

  public static void main(String[] a) throws Exception {
    File dir = new File(System.getProperty("java.io.tmpdir"), "sg-backup-" + System.nanoTime());
    dir.mkdirs();
    File fa = new File(dir, "a.json"), fb = new File(dir, "b.json");
    int pa = 18810, pb = 18811;
    String ua = "ws://127.0.0.1:" + pa, ub = "ws://127.0.0.1:" + pb;
    List<String> find = Arrays.asList(ua, ub);
    SgCenter A = new SgCenter(fa);
    A.start(pa);
    Phone p1 = new Phone(ua, "d1", "a1", "phone", new File(dir, "r1.json"), find);
    Phone p2 = new Phone(ua, "d2", "a2", "phone", new File(dir, "r2.json"), find);
    Phone pm = new Phone(ua, "dm", null, "master", null, find);
    wait(() -> p1.up[0] && p2.up[0] && pm.up[0], 5000);
    ok(p1.up[0] && p2.up[0] && pm.up[0], "три телефона на центре A");

    // игра идёт: правила, переписка (личная, анонимная, с фото), переменная, выдачи, отложенное, таймер
    List<Object> rules = new ArrayList<>();
    rules.add(SgJson.map("id", "b1", "on", "bounds", "key", "var:power", "min", 0L, "max", 10L));
    rules.add(SgJson.map("id", "e1", "on", "every", "every", 600000L, "emit", new ArrayList<>()));
    pm.send(SgJson.map("t", "rules", "ver", 7L, "list", rules));
    p1.send(msg("x1", new ArrayList<>(Arrays.asList("acc:a2")), "личное от первого", false));
    p2.send(msg("x2", new ArrayList<>(Arrays.asList("all")), "анонимно всем", true));
    Map<String, Object> ph = msg("x3", new ArrayList<>(Arrays.asList("acc:a2")), "", false);
    SgJson.m(ph.get("body")).put("photo", "data:image/jpeg;base64," + "A".repeat(500000));
    p1.send(ph);
    p1.send(SgJson.map("t", "set", "key", "var:power", "value", 5L));
    p1.send(SgJson.map("t", "claim", "id", "c1", "key", "box", "acc", "a1", "limit", 3L));
    p2.send(SgJson.map("t", "claim", "id", "c2", "key", "box", "acc", "a2", "limit", 3L));
    p2.send(SgJson.map("t", "msg", "id", "x4", "to", new ArrayList<>(Arrays.asList("all")), "kind", "chat", "body", SgJson.map("text", "через 6 секунд"),
      "at", System.currentTimeMillis() + 6000));
    pm.send(SgJson.map("t", "timer", "id", "t1", "delay", 3600000L, "emit", new ArrayList<>()));
    wait(() -> p1.has("\"c1\"") && p2.has("\"c2\""), 3000);
    wait(() -> p1.rep.upto() >= 4 && p1.rep.laterCopy().size() == 1 && p1.rep.timersCopy().containsKey("t1"), 6000);

    Map<String, Object> ca = A.snapshotCopy();
    List<Object> rl = p1.rep.logList();
    ok(rl.size() == SgJson.a(ca.get("log")).size(), "копия первого телефона: все сообщения центра (" + rl.size() + "), в том числе чужие личные");
    boolean anonFull = false, photo = false;
    for (Object x : rl) {
      Map<String, Object> mm = SgJson.m(x);
      if ("x2".equals(SgJson.s(mm, "id"))) anonFull = "d2".equals(SgJson.s(SgJson.m(mm.get("from")), "dev"));
      if ("x3".equals(SgJson.s(mm, "id"))) photo = String.valueOf(SgJson.m(mm.get("body")).get("photo")).length() > 400000;
    }
    ok(anonFull, "анонимное — в копии целиком (отправителя знает только копия, на экране его нет)");
    ok(photo, "снимок из чужого личного чата — в копии");
    ok(Long.valueOf(5).equals(num(p1.rep.stateCopy().get("var:power"))), "переменная в копии");
    ok(SgJson.l(SgJson.m(p1.rep.claimsCopy().get("box")), "n", 0) == 2, "счёт выдач в копии (2)");
    ok(p1.rep.laterCopy().size() == 1, "отложенное сообщение в копии");
    ok(p1.rep.timersCopy().containsKey("t1"), "таймер в копии");
    ok(SgJson.a(p1.rep.rulesCopy().get("list")).size() == 2, "правила центра в копии");
    ok(p1.rep.upto() == SgJson.l(ca, "seq", -1), "копия полна до последнего номера центра");
    // экономия сети: своё сообщение второй раз не приходит, анонимное и чужое — пачкой rep
    ok(p2.count("личное от первого") == 1, "адресату личное пришло один раз (копия не дублирует)");
    p1.rep.save();
    ok(new File(dir, "r1.json").length() > 400000, "копия записана в файл телефона");
    SgReplica again = new SgReplica(new File(dir, "r1.json"));
    ok(again.size() == rl.size() && again.upto() == p1.rep.upto(), "копия читается из файла (после перезапуска службы)");

    // телефон мастера сел: центр A пропал без записи
    A.kill();
    Thread.sleep(500);
    ok(!p1.link.connected(), "центр A пропал");
    // «Поднять центр отсюда» на первом телефоне: центр из копии, поколение +1
    SgCenter.writeFile(fb, SgCenter.forTakeover(p1.rep.snapshot()));
    SgCenter B = new SgCenter(fb);
    B.start(pb);
    ok(B.gen() == 1, "новый центр — поколение 1");
    long t0 = System.currentTimeMillis();
    wait(() -> ub.equals(p1.link.cur) && ub.equals(p2.link.cur) && ub.equals(pm.link.cur), 40000);
    ok(ub.equals(p1.link.cur) && ub.equals(p2.link.cur) && ub.equals(pm.link.cur), "телефоны сами нашли новый центр (" + (System.currentTimeMillis() - t0) / 1000 + " с)");
    ok(ub.equals(p2.link.url()), "новый адрес запомнен");
    Map<String, Object> cb = B.snapshotCopy();
    ok(Long.valueOf(5).equals(num(SgJson.m(cb.get("state")).get("var:power"))), "новый центр: переменная та же");
    ok(SgJson.s(cb, "epoch").equals(SgJson.s(ca, "epoch")), "новый центр: та же игра (эпоха)");
    p2.send(SgJson.map("t", "claim", "id", "c3", "key", "box", "acc", "a2", "limit", 3L));
    p1.send(SgJson.map("t", "claim", "id", "c4", "key", "box", "acc", "a1", "limit", 3L));
    wait(() -> p2.has("\"c3\"") && p1.has("\"c4\""), 8000);
    if (System.getenv("SGDBG") != null) synchronized (p2.got) { for (String t : p2.got) System.out.println("P2 " + t.substring(0, Math.min(200, t.length()))); }
    ok(p2.has("\"id\":\"c3\",\"key\":\"box\",\"ok\":true,\"n\":3"), "счёт выдач продолжился: третья выдача");
    ok(p1.has("\"id\":\"c4\",\"key\":\"box\",\"ok\":false,\"reason\":\"empty\""), "четвёртой нет — предел 3 помнится");
    wait(() -> p1.has("через 6 секунд"), 12000);
    ok(p1.has("через 6 секунд"), "отложенное сообщение доставил новый центр");
    p2.send(msg("x5", new ArrayList<>(Arrays.asList("acc:a1")), "после подъёма", false));
    wait(() -> p1.has("после подъёма"), 4000);
    ok(p1.has("после подъёма"), "переписка идёт через новый центр");
    ok(p1.link.lastSeq > SgJson.l(ca, "seq", 0), "номера сообщений продолжились");
    ok(p1.link.gen == 1 && p2.link.gen == 1, "телефоны знают поколение 1");
    ok(p1.count("личное от первого") == 0 && p2.count("личное от первого") == 1, "старое не пришло второй раз");

    // старый телефон-центр зарядили: центр A вернулся со своим старым файлом — уступает
    SgCenter A2 = new SgCenter(fa);
    A2.start(pa);
    Phone p3 = new Phone(ua, "d3", "a3", "phone", null, find, 1, SgJson.s(ca, "epoch"));
    wait(() -> A2.isStale(), 5000);
    ok(A2.isStale(), "старый центр узнал о новом (поколение 1 в hello) и уступил");
    wait(() -> ub.equals(p3.link.cur), 15000);
    ok(ub.equals(p3.link.cur), "телефон ушёл со старого центра на новый");
    Phone p4 = new Phone(ua, "d4", "a4", "phone", null, Arrays.asList(ua));
    Thread.sleep(1500);
    ok(p4.has("\"stale\"") && !p4.up[0] || !p4.link.connected(), "уступивший центр никого не принимает");
    p4.link.stop();

    // выгрузка и загрузка файлом (пульт мастера)
    pm.send(SgJson.map("t", "admin", "op", "dump", "id", "dmp"));
    wait(() -> pm.has("\"t\":\"dump\""), 4000);
    String dump = null;
    synchronized (pm.got) { for (String t : pm.got) if (t.startsWith("{\"t\":\"dump\"")) dump = t; }
    ok(dump != null && dump.contains("после подъёма"), "выгрузка: всё состояние мастеру");
    Map<String, Object> data = SgJson.m(SgJson.obj(dump).get("data"));
    pm.send(SgJson.map("t", "set", "key", "var:power", "value", 9L));
    Thread.sleep(500);
    pm.send(SgJson.map("t", "admin", "op", "restore", "data", data));
    wait(() -> B.gen() == 2 && p1.up[0] && p1.link.gen == 2, 10000);
    ok(B.gen() == 2, "загрузка из файла: поколение 2");
    ok(Long.valueOf(5).equals(num(SgJson.m(B.snapshotCopy().get("state")).get("var:power"))), "загрузка из файла: переменная из файла (5, было 9)");
    ok(p1.link.gen == 2, "телефоны переподключились к загруженному центру");

    // фото не влезает в кадр — выгрузка урезает старые снимки
    Map<String, Object> big = SgJson.map("log", new ArrayList<>(Arrays.asList((Object) SgJson.map("seq", 1L, "body", SgJson.map("photo", "x".repeat(3000))),
      SgJson.map("seq", 2L, "body", SgJson.map("photo", "y".repeat(3000))))));
    Map<String, Object> fit = SgCenter.fitDumpForTest(big, 4000);
    ok(SgJson.l(fit, "photoCut", 0) == 1 && SgJson.str(fit).contains("yyyy"), "большая выгрузка: старый снимок убран, новый остался");

    for (Phone p : new Phone[] { p1, p2, pm, p3 }) p.link.stop();
    B.stop();
    A2.stop();
    System.out.println(fails == 0 ? "BACKUP OK" : "BACKUP FAIL " + fails);
    System.exit(fails == 0 ? 0 : 1);
  }
}
