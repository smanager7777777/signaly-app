package ru.signaly.terminal;

import com.sun.jna.Native;
import com.sun.jna.Pointer;

/** СИГНАЛЫ (П9, ответ 12А): знает ли модель Vosk слово. В Java-обёртке Vosk этой функции нет,
 *  а в библиотеке libvosk она есть (vosk_api.h: vosk_model_find_word — номер слова или −1). */
final class SgVoskWords {
  static boolean ok;
  static {
    try { Native.register(SgVoskWords.class, "vosk"); ok = true; } catch (Throwable e) { ok = false; }
  }
  static native int vosk_model_find_word(Pointer model, String word);

  /** true — знает, false — не знает, null — проверить нельзя. */
  static Boolean knows(org.vosk.Model m, String word) {
    if (!ok || m == null) return null;
    try { return vosk_model_find_word(m.getPointer(), word) >= 0; } catch (Throwable e) { ok = false; return null; }
  }
}
