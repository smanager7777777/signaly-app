package ru.signaly.net;

import java.util.ArrayList;
import java.util.List;

/** П19: буфер сообщений службы для страницы приложения (номер idx растёт по одному).
 *  Сообщения кладут разные потоки: связь с центром (state, msg…), датчики и голос (t:'phone', 'heard'…).
 *  Раньше номер выдавался под замком, а страница получала сообщение уже без замка — два потока могли
 *  поменяться местами, и страница, увидев номер N+1 раньше N, выбрасывала N как «старое».
 *  Так терялось state от своего же встряхивания (правило «на телефоне»: set ушёл центру, ответ пришёл
 *  в тот же миг, что и t:'phone'): пульт на этом телефоне показывал старое значение (замечание П19-1).
 *  Теперь выдача номера и передача странице — под одним замком, порядок всегда тот же, что и номера. */
public class SgInbox {
  public interface Sink { void onText(long idx, String text); }

  final List<String> buf = new ArrayList<>();
  long base = 0;
  final int max;
  public volatile Sink sink;

  public SgInbox(int max) { this.max = max; }

  /** Положить и сразу отдать странице (если она открыта). Возвращает номер. */
  public long add(String text) {
    synchronized (buf) {
      buf.add(text);
      while (buf.size() > max) { buf.remove(0); base++; }
      long idx = base + buf.size() - 1;
      Sink s = sink;
      if (s != null) {
        try { s.onText(idx, text); } catch (RuntimeException ignored) { /* страница закрыта */ }
      }
      return idx;
    }
  }

  /** Всё с номера from; next[0] — номер следующего. */
  public List<String> drain(long from, long[] next) {
    synchronized (buf) {
      List<String> out = new ArrayList<>();
      long start = Math.max(from, base);
      for (long k = start; k < base + buf.size(); k++) out.add(buf.get((int) (k - base)));
      next[0] = base + buf.size();
      return out;
    }
  }
}
