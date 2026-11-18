package ru.signaly.net;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/** СИГНАЛЫ: детектор голоса (VAD) для экономии батареи. Распознаватель Vosk получает звук только
 *  тогда, когда в кадрах есть речь: громкость выше уровня шума на margin дБ. Уровень шума подстраивается сам
 *  (быстро вниз, медленно вверх). Перед началом речи отдаётся «запас» (preroll), чтобы не потерять первый слог.
 *  Чистая Java: проверяется без Android (tests/java/VoiceCheck.java). */
public class SgVad {
  public static final int RATE = 16000, FRAME = 320;           // 20 мс
  public static final int SILENT = 0, START = 1, SPEECH = 2, END = 3;

  final double margin;          // дБ над шумом
  final int pre = 15;           // 300 мс запаса
  final int hang = 40;          // 800 мс тишины — конец фразы
  final int maxFrames = 400;    // 8 с — не дольше
  double floor = Double.NaN;
  boolean inSpeech;
  int quiet, len, warm;
  final ArrayDeque<short[]> ring = new ArrayDeque<>();
  final ArrayDeque<Boolean> votes = new ArrayDeque<>();
  /** Сколько кадров всего и сколько из них ушло в распознаватель (для замера батареи). */
  public long frames, fed;

  /** sens: 0 — низкая (12 дБ), 1 — обычная (9 дБ), 2 — высокая (6 дБ). */
  public SgVad(int sens) { margin = sens <= 0 ? 12 : sens >= 2 ? 6 : 9; }

  public static double db(short[] f, int n) {
    double s = 0;
    for (int i = 0; i < n; i++) { double x = f[i] / 32768.0; s += x * x; }
    return 10 * Math.log10(s / Math.max(1, n) + 1e-10);
  }

  public double floor() { return floor; }
  public boolean inSpeech() { return inSpeech; }

  /** Очередной кадр. START — вызывающий отдаёт распознавателю preroll() (в нём уже и этот кадр);
   *  SPEECH — этот кадр; END — этот кадр и закрыть фразу. */
  public int push(short[] f, int n) {
    frames++;
    double e = db(f, n);
    if (Double.isNaN(floor)) floor = e;
    if (warm < 10) { warm++; floor = Math.min(floor, e); }
    boolean loud = e > floor + margin && e > -60;
    if (!inSpeech) {
      if (e < floor) floor = floor * 0.9 + e * 0.1; else floor = floor * 0.995 + e * 0.005;
    } else if (!loud) floor = floor * 0.998 + e * 0.002;
    short[] copy = new short[n];
    System.arraycopy(f, 0, copy, 0, n);
    if (!inSpeech) {
      ring.addLast(copy);
      while (ring.size() > pre) ring.removeFirst();
      votes.addLast(loud);
      while (votes.size() > 5) votes.removeFirst();
      int k = 0;
      for (Boolean v : votes) if (v) k++;
      if (k >= 3) { inSpeech = true; quiet = 0; len = ring.size(); votes.clear(); fed += ring.size(); return START; }
      return SILENT;
    }
    fed++;
    len++;
    quiet = loud ? 0 : quiet + 1;
    if (quiet >= hang || len >= maxFrames) { inSpeech = false; ring.clear(); return END; }
    return SPEECH;
  }

  /** Запас перед речью (вместе с кадром, на котором речь началась). */
  public List<short[]> preroll() { List<short[]> out = new ArrayList<>(ring); ring.clear(); return out; }
}
