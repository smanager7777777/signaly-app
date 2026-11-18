package ru.signaly.net;

import java.util.Map;

/** Какие сообщения центра служба уже показала (шторка, уведомление). Центр после переподключения
 *  присылает пропущенное начиная с since — и иногда то, что уже было (служба перезапущена, приложение
 *  сброшено). Чтобы уведомление не всплывало второй раз, служба помнит epoch центра и номер последнего
 *  показанного сообщения (сохраняется в настройках службы через {@link Store}). Чистая Java: проверяется
 *  в tests/java/LinkCheck.java. */
public class SgSeen {
  public interface Store { void save(String epoch, long seq); }

  public volatile String epoch;
  public volatile long seq;
  final Store store;

  public SgSeen(String epoch, long seq, Store store) { this.epoch = epoch; this.seq = seq; this.store = store; }

  /** true — сообщение новое (показать), false — уже было. Для welcome/reset — запоминает epoch. */
  public synchronized boolean fresh(Map<String, Object> o) {
    String t = SgJson.s(o, "t");
    if ("welcome".equals(t)) {
      String ep = SgJson.s(o, "epoch");
      long cs = SgJson.l(o, "seq", 0);
      if (ep != null && !ep.equals(epoch)) { epoch = ep; seq = 0; save(); }
      else if (cs < seq) { seq = cs; save(); }   // центр не успел записать последние сообщения — новые пойдут с меньшими номерами
      return true;
    }
    if ("reset".equals(t)) { epoch = SgJson.s(o, "epoch"); seq = 0; save(); return true; }
    if (!"msg".equals(t)) return true;
    long sq = SgJson.l(o, "seq", 0);
    if (sq <= 0) return true;
    if (sq <= seq) return false;
    seq = sq;
    save();
    return true;
  }

  void save() { if (store != null) try { store.save(epoch, seq); } catch (RuntimeException ignored) { /* не страшно */ } }
}
