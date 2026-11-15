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
    ok(link.lastSeq == 2, "номер продолжился после перезапуска центра: " + link.lastSeq);
    synchronized (got) {
      int n = 0;
      for (String s : got) if (s.contains("раз") && s.contains("\"t\":\"msg\"")) n++;
      ok(n == 1, "старое сообщение повторно не прислано (" + n + ")");
    }
    link.stop();
    c2.stop();
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
