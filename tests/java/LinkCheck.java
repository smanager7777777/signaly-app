import java.io.File;
import java.util.ArrayList;
import java.util.List;

import ru.signaly.net.SgCenter;
import ru.signaly.net.SgLink;

/** Проверка клиента SgLink (тот же код, что в службе Android): подключение, очередь при разрыве,
 *  переподключение к перезапущенному центру, сохранение центра в файл. Печатает OK/FAIL. */
public class LinkCheck {
  static int fails = 0;
  static void ok(boolean c, String what) { System.out.println((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; }

  public static void main(String[] a) throws Exception {
    File f = File.createTempFile("sgcenter", ".json");
    f.delete();
    int port = 18791;
    SgCenter c1 = new SgCenter(f);
    c1.start(port);
    final List<String> got = new ArrayList<>();
    final boolean[] up = { false };
    SgLink link = new SgLink(new SgLink.Listener() {
      public void onText(String t) { synchronized (got) { got.add(t); } }
      public void onStatus(boolean connected, String info) { up[0] = connected; }
    });
    link.start("ws://127.0.0.1:" + port, "{\"t\":\"hello\",\"role\":\"phone\",\"dev\":\"J1\",\"acc\":\"aJ\"}");
    wait(() -> up[0], 5000);
    ok(up[0], "SgLink подключился к центру");
    wait(() -> has(got, "\"welcome\""), 3000);
    ok(has(got, "\"welcome\""), "центр ответил welcome");
    link.send("{\"t\":\"set\",\"key\":\"x\",\"value\":1}");
    wait(() -> has(got, "\"key\":\"x\""), 3000);
    ok(has(got, "\"key\":\"x\""), "состояние x пришло обратно");
    link.send("{\"t\":\"msg\",\"id\":\"j-1\",\"to\":[\"acc:aJ\"],\"kind\":\"chat\",\"body\":{\"text\":\"раз\"}}");
    wait(() -> has(got, "раз"), 3000);
    long seq1 = link.lastSeq;
    ok(seq1 == 1, "номер последнего сообщения запомнен: " + seq1);

    // центр выключается; телефон копит отправку
    c1.stop();
    Thread.sleep(800);
    link.send("{\"t\":\"msg\",\"id\":\"j-2\",\"to\":[\"acc:aJ\"],\"kind\":\"chat\",\"body\":{\"text\":\"два\"}}");
    ok(link.queued() == 1, "без связи сообщение ждёт в очереди");
    SgCenter c2 = new SgCenter(f);
    ok(c2.port() == 0, "центр перезапущен с тем же файлом");
    c2.start(port);
    wait(() -> has(got, "два"), 12000);
    ok(has(got, "два"), "после переподключения очередь ушла и сообщение вернулось");
    ok(link.queued() == 0, "очередь пуста");
    ok(link.lastSeq > 2, "номер продолжился после перезапуска центра (с запасом): " + link.lastSeq);
    synchronized (got) {
      int n = 0;
      for (String s : got) if (s.contains("раз") && s.contains("\"t\":\"msg\"")) n++;
      ok(n == 1, "старое сообщение повторно не прислано (" + n + ")");
    }
    // замечание build-26/36: новая связь (служба перезапущена, «сброс прогресса») берёт отметку приложения
    // «до какого сообщения видели» (epoch + since в hello) и не получает старое заново
    String ep = link.epoch;
    long mark = link.lastSeq;
    final List<String> got5 = new ArrayList<>();
    final boolean[] up5 = { false };
    SgLink l5 = new SgLink(new SgLink.Listener() {
      public void onText(String t) { synchronized (got5) { got5.add(t); } }
      public void onStatus(boolean connected, String i) { up5[0] = connected; }
    });
    l5.start("ws://127.0.0.1:" + port, "{\"t\":\"hello\",\"role\":\"phone\",\"dev\":\"J1\",\"acc\":\"aJ\",\"epoch\":\"" + ep + "\",\"since\":" + mark + "}");
    wait(() -> has(got5, "\"welcome\""), 5000);
    Thread.sleep(400);
    ok(has(got5, "\"welcome\"") && !has(got5, "раз") && !has(got5, "два"), "новая связь с отметкой приложения — старые сообщения не присланы заново");
    ok(l5.lastSeq == mark && ep.equals(l5.epoch), "отметка взята из hello: " + l5.lastSeq);
    l5.stop();
    link.stop();   // один вход на персонажа: первая связь уходит
    Thread.sleep(300);
    final List<String> got6 = new ArrayList<>();
    SgLink l6 = new SgLink(new SgLink.Listener() {
      public void onText(String t) { synchronized (got6) { got6.add(t); } }
      public void onStatus(boolean connected, String i) { }
    });
    l6.start("ws://127.0.0.1:" + port, "{\"t\":\"hello\",\"role\":\"phone\",\"dev\":\"J6\",\"acc\":\"aJ\"}");
    wait(() -> has(got6, "два"), 5000);
    ok(has(got6, "раз") && has(got6, "два"), "телефон без отметки (первый раз в сети) получает всю переписку своего персонажа");
    l6.stop();
    // служба: уведомление показывается один раз, даже если центр прислал сообщение повторно
    final long[] saved = { -1 };
    ru.signaly.net.SgSeen seen = new ru.signaly.net.SgSeen(null, 0, (e, q) -> saved[0] = q);
    java.util.function.Function<String, java.util.Map<String, Object>> js = ru.signaly.net.SgJson::obj;
    ok(seen.fresh(js.apply("{\"t\":\"welcome\",\"epoch\":\"E1\",\"seq\":5}")), "welcome принят");
    boolean f1 = seen.fresh(js.apply("{\"t\":\"msg\",\"seq\":4,\"kind\":\"notify\"}"));
    boolean f2 = seen.fresh(js.apply("{\"t\":\"msg\",\"seq\":4,\"kind\":\"notify\"}"));
    ok(f1 && !f2 && saved[0] == 4, "сообщение №4: первый раз — показать, второй — нет; номер сохранён");
    ru.signaly.net.SgSeen again = new ru.signaly.net.SgSeen("E1", 4, null);   // служба перезапущена, номер из настроек
    again.fresh(js.apply("{\"t\":\"welcome\",\"epoch\":\"E1\",\"seq\":6}"));
    ok(!again.fresh(js.apply("{\"t\":\"msg\",\"seq\":3}")) && again.fresh(js.apply("{\"t\":\"msg\",\"seq\":5}")), "после перезапуска службы старое не всплывает, новое — да");
    again.fresh(js.apply("{\"t\":\"welcome\",\"epoch\":\"E2\",\"seq\":1}"));
    ok(again.fresh(js.apply("{\"t\":\"msg\",\"seq\":1}")), "другой центр (новый epoch) — счёт сначала");
    link.stop();
    c2.stop();

    // причина, если центр недоступен (её видит игрок на экране)
    final String[] prepHost = { null };
    final String[] info = { "" };
    SgLink bad = new SgLink(new SgLink.Listener() {
      public void onText(String t) { }
      public void onStatus(boolean connected, String i) { info[0] = i; }
    });
    bad.prep = (sock, host) -> prepHost[0] = host;
    bad.start("ws://127.0.0.1:18799", "{\"t\":\"hello\"}");
    wait(() -> !bad.err.isEmpty(), 4000);
    ok("refused".equals(bad.err), "центр не запущен → причина «отказал»: " + bad.err + " / " + info[0]);
    ok(info[0].contains("не запущен"), "текст причины ушёл на экран");
    ok("127.0.0.1".equals(prepHost[0]), "сокет подготовлен до подключения (привязка к Wi-Fi)");
    ok(bad.tries >= 1, "попытки считаются: " + bad.tries);
    bad.stop();
    ok("timeout".equals(SgLink.reason(new java.net.SocketTimeoutException("connect timed out"))), "нет ответа → timeout");
    ok("unreach".equals(SgLink.reason(new java.net.NoRouteToHostException("EHOSTUNREACH"))), "нет пути → unreach");
    ok("notcenter".equals(SgLink.reason(new ru.signaly.net.SgWs.HandshakeException())), "не центр → notcenter");
    ok("192.168.0.154".equals(SgLink.hostOf("ws://192.168.0.154:8790")), "хост из адреса");
    java.net.InetAddress x = java.net.InetAddress.getByName("192.168.0.154"), y = java.net.InetAddress.getByName("192.168.0.37"), z = java.net.InetAddress.getByName("192.168.1.37");
    ok(SgLink.sameNet(x, y, 24) && !SgLink.sameNet(x, z, 24) && SgLink.sameNet(x, z, 16), "одна подсеть / разные подсети");
    ok(Boolean.TRUE.equals(SgLink.sameSubnet("127.0.0.1")), "свой адрес — та же сеть");
    // запасной адрес (П-38): по адресу из QR центра нет, а шлюз Wi-Fi — центр (точка доступа на телефоне-центре)
    SgCenter c3 = new SgCenter(null);
    c3.start(18792);
    final boolean[] up3 = { false };
    SgLink l3 = new SgLink(new SgLink.Listener() {
      public void onText(String t) { }
      public void onStatus(boolean connected, String i) { up3[0] = connected; }
    });
    l3.alt = (u) -> "ws://127.0.0.1:18792";
    l3.start("ws://127.0.0.1:18797", "{\"t\":\"hello\",\"dev\":\"J3\"}");
    wait(() -> up3[0], 9000);
    ok(up3[0] && "ws://127.0.0.1:18792".equals(l3.cur), "старый адрес не отвечает → подключился по запасному (шлюз): " + l3.cur);
    l3.stop();
    // сеть Wi-Fi вернулась → переподключение сразу, без паузы
    final boolean[] up4 = { false };
    SgLink l4 = new SgLink(new SgLink.Listener() {
      public void onText(String t) { }
      public void onStatus(boolean connected, String i) { up4[0] = connected; }
    });
    l4.start("ws://127.0.0.1:18793", "{\"t\":\"hello\",\"dev\":\"J4\"}");
    Thread.sleep(3500);   // пауза между попытками выросла до 4 с
    SgCenter c4 = new SgCenter(null);
    c4.start(18793);
    long k0 = System.currentTimeMillis();
    l4.kick(true);
    wait(() -> up4[0], 5000);
    long dt = System.currentTimeMillis() - k0;
    ok(up4[0] && dt < 1500, "после сигнала «сеть появилась» подключился за " + dt + " мс");
    l4.stop();
    c3.stop();
    c4.stop();
    // П-62: адреса нет — телефон сам ищет центр (шлюз первым, затем подсеть), найденный адрес запоминается
    SgCenter cA = new SgCenter(null);
    cA.start(18794);
    final String[] gotA = { null };
    SgLink lA = new SgLink(new SgLink.Listener() {
      public void onText(String t) { }
      public void onStatus(boolean connected, String i) { if (connected) gotA[0] = i; }
    });
    lA.finder = () -> java.util.Arrays.asList("ws://127.0.0.1:18781", "ws://127.0.0.1:18782", "ws://127.0.0.1:18794", "ws://127.0.0.1:18783");
    long tA = System.currentTimeMillis();
    lA.start(SgLink.AUTO, "{\"t\":\"hello\",\"dev\":\"J5\"}");
    wait(() -> gotA[0] != null, 8000);
    ok("ws://127.0.0.1:18794".equals(gotA[0]) && "ws://127.0.0.1:18794".equals(lA.url()),
      "без адреса: нашёл центр среди адресов и запомнил его за " + (System.currentTimeMillis() - tA) + " мс: " + gotA[0]);
    lA.stop();
    // первый по порядку (шлюз) важнее остальных: оба отвечают — берётся шлюз
    SgCenter cB = new SgCenter(null);
    cB.start(18796);
    SgLink lB = new SgLink(new SgLink.Listener() { public void onText(String t) { } public void onStatus(boolean c, String i) { } });
    lB.running = true;
    ok("ws://127.0.0.1:18796".equals(lB.find(java.util.Arrays.asList("ws://127.0.0.1:18785", "ws://127.0.0.1:18796", "ws://127.0.0.1:18794"))),
      "поиск: из двух отвечающих — первый по списку");
    ok(lB.find(java.util.Arrays.asList("ws://127.0.0.1:18786", "ws://127.0.0.1:18787")) == null, "поиск: никто не отвечает — null");
    lB.running = false;
    // центр не найден — причина на экране, после запуска центра телефон подключается сам
    final String[] stC = { "", null };
    SgLink lC = new SgLink(new SgLink.Listener() {
      public void onText(String t) { }
      public void onStatus(boolean connected, String i) { if (connected) stC[1] = i; else stC[0] = i; }
    });
    lC.finder = () -> java.util.Arrays.asList("ws://127.0.0.1:18798");
    lC.start(SgLink.AUTO, "{\"t\":\"hello\",\"dev\":\"J7\"}");
    wait(() -> stC[0].contains("не найден"), 5000);
    ok(stC[0].contains("не найден") && !lC.connected(), "центра нет: «" + stC[0] + "»");
    SgCenter cC = new SgCenter(null);
    cC.start(18798);
    wait(() -> stC[1] != null, 9000);
    ok("ws://127.0.0.1:18798".equals(stC[1]), "центр запустили — телефон нашёл его сам");
    lC.stop();
    // адрес из QR перестал отвечать (центр сменил адрес), запасного шлюза нет — после 6 неудач поиск
    SgLink lD = new SgLink(new SgLink.Listener() { public void onText(String t) { } public void onStatus(boolean c, String i) { } });
    lD.finder = () -> java.util.Arrays.asList("ws://127.0.0.1:18794");
    lD.start("ws://127.0.0.1:18799", "{\"t\":\"hello\",\"dev\":\"J8\"}");
    for (int i = 0; i < 12; i++) { Thread.sleep(400); lD.kick(false); }
    wait(() -> lD.connected(), 6000);
    ok(lD.connected() && "ws://127.0.0.1:18794".equals(lD.cur), "старый адрес молчит — нашёл центр поиском: " + lD.cur);
    lD.stop();
    ok(SgLink.subnetUrls(8790).contains("ws://192.168.43.1:8790"), "в поиске есть адрес точки доступа Android по умолчанию");
    cA.stop(); cB.stop(); cC.stop();
    // П13: «{{имя}}» в уведомлении шторки — из состояния центра
    java.util.Map<String, Object> st = new java.util.HashMap<>();
    st.put("var:power", 7L); st.put("var:open", Boolean.TRUE); st.put("var:x", 2.0);
    ok("Энергия 7, шлюз да, {{nope}}, 2".equals(ru.signaly.net.SgCenter.fillVars("Энергия {{power}}, шлюз {{ $open }}, {{nope}}, {{x}}", st)),
      "служба: {{имя}} в уведомлении — значение общей переменной");
    System.out.println(fails == 0 ? "LINK OK" : "LINK FAIL " + fails);
    System.exit(fails == 0 ? 0 : 1);
  }

  interface Cond { boolean ok(); }
  static void wait(Cond c, long ms) throws InterruptedException {
    long t = System.currentTimeMillis() + ms;
    while (!c.ok() && System.currentTimeMillis() < t) Thread.sleep(50);
  }
  static boolean has(List<String> l, String s) { synchronized (l) { for (String x : l) if (x.contains(s)) return true; } return false; }
}
