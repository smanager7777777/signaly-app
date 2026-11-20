import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import ru.signaly.net.SgCenter;
import ru.signaly.net.SgInbox;
import ru.signaly.net.SgLink;

/** П19 (замечание 1): встряхивание Инженера — пульт на том же телефоне показывал старое значение.
 *  Как в службе Android: правило «на телефоне» шлёт set центру (из потока отправки) и сразу кладёт t:'phone'
 *  в буфер страницы из потока датчиков; ответ центра (state) кладёт поток связи. Страница (как net.js)
 *  выбрасывает номер меньше уже виденного. Центр шлёт state и отправителю — проверяется здесь же. */
public class InboxCheck {
  static int fails = 0;
  static void ok(boolean c, String what) { System.out.println((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; }

  /** Страница: как net.js до П19 — номер меньше виденного выбрасывается; пропуск номера — забрать из буфера. */
  static class Page implements SgInbox.Sink {
    long next = 0;
    int states = 0, dropped = 0, gaps = 0;
    long last = -1;
    boolean ordered = true;
    SgInbox inbox;
    public synchronized void onText(long idx, String text) {
      if (idx <= last) ordered = false;
      last = Math.max(last, idx);
      if (idx < next) { dropped++; return; }
      if (next > 0 && idx > next) {   // П19: пропуск — забрать пропущенное по порядку
        gaps++;
        long[] n = { 0 };
        List<String> items = inbox.drain(next, n);
        long first = n[0] - items.size();
        for (int i = 0; i < items.size(); i++) if (first + i >= next) { take(items.get(i)); next = first + i + 1; }
        return;
      }
      next = idx + 1;
      take(text);
    }
    void take(String t) { if (t.contains("\"t\":\"state\"") && t.contains("var:shakes")) states++; }
  }

  public static void main(String[] a) throws Exception {
    File f = File.createTempFile("sgcenter", ".json");
    f.delete();
    int port = 18797;
    SgCenter c = new SgCenter(f);
    c.start(port);
    SgInbox inbox = new SgInbox(600);
    Page page = new Page();
    page.inbox = inbox;
    inbox.sink = page;
    final boolean[] up = { false };
    SgLink link = new SgLink(new SgLink.Listener() {
      public void onText(String t) { inbox.add(t); }
      public void onStatus(boolean connected, String info) { up[0] = connected; }
    });
    link.start("ws://127.0.0.1:" + port, "{\"t\":\"hello\",\"role\":\"master\",\"dev\":\"E1\",\"acc\":\"aE\",\"name\":\"Инженер\"}");
    long t0 = System.currentTimeMillis();
    while (!up[0] && System.currentTimeMillis() - t0 < 5000) Thread.sleep(20);
    ok(up[0], "служба телефона (SgLink) подключилась к центру");
    Thread.sleep(300);
    ExecutorService sender = Executors.newSingleThreadExecutor();
    int n = 300;
    for (int i = 0; i < n; i++) {
      // поток датчиков: set — центру через поток отправки, t:'phone' — странице
      sender.execute(() -> link.send("{\"t\":\"set\",\"key\":\"var:shakes\",\"add\":1}"));
      inbox.add("{\"t\":\"phone\",\"id\":\"r4\",\"at\":" + i + "}");
      if (i % 10 == 0) Thread.sleep(1);
    }
    t0 = System.currentTimeMillis();
    while (page.states < n && System.currentTimeMillis() - t0 < 8000) Thread.sleep(50);
    ok(page.states == n, "все " + n + " ответов state от своих же set дошли до страницы: " + page.states + " (выброшено как старые: " + page.dropped + ")");
    ok(page.ordered, "страница получает сообщения строго по номерам (SgInbox: номер и доставка под одним замком)");
    ok(page.dropped == 0, "ни одно сообщение не выброшено");
    Object v = ((java.util.Map<?, ?>) c.snapshotCopy().get("state")).get("var:shakes");
    ok(v instanceof Number && ((Number) v).intValue() == n, "центр насчитал " + n + " встряхиваний: " + v);
    sender.shutdown();
    link.stop();
    c.stop();
    System.out.println(fails == 0 ? "INBOX OK" : "INBOX FAIL " + fails);
    System.exit(fails == 0 ? 0 : 1);
  }
}
