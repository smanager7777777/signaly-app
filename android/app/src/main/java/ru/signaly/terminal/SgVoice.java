package ru.signaly.terminal;

import android.Manifest;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.BatteryManager;
import android.os.PowerManager;

import androidx.core.content.ContextCompat;

import org.vosk.Model;
import org.vosk.Recognizer;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import ru.signaly.net.SgJson;
import ru.signaly.net.SgVad;
import ru.signaly.net.SgVoiceCore;

/** СИГНАЛЫ: голос (П-58). Микрофон → детектор голоса (SgVad) → Vosk (малая русская модель из APK, режим грамматики)
 *  → SgVoiceCore (фразы, цифры, запрос центру, сообщения). Режимы: off, button (пока нажата кнопка в приложении),
 *  screen (в фоне, пока экран включён и разблокирован), always (всегда; служба с типом «микрофон»).
 *  Живёт в процессе приложения, звук читает свой поток; службу связи держит включённой (SgNetService). */
final class SgVoice {
  static final String ASSET = "model-ru";
  static volatile String mode = "off";
  static volatile boolean button;
  static volatile int sens = 1;
  static volatile boolean screenOk = true;
  static volatile boolean listening;
  static volatile String modelState = "не загружена", errText = "";
  static volatile boolean grammarDirty = true;
  static Model model;
  static boolean loading;
  static SgVoiceCore core;
  static Thread worker;
  static volatile boolean run;
  static SgVad vad;
  static long listenMs, speechMs, listenFrom;
  static Context app;

  static synchronized void init(Context c) {
    if (app != null) return;
    app = c.getApplicationContext();
    core = new SgVoiceCore(new SgVoiceCore.Out() {
      public boolean up() { return SgNetService.link != null && SgNetService.link.connected(); }
      public long now() { return System.currentTimeMillis() + SgNetService.centerOffset; }
      public void send(String json) { SgNetService.send(json); }
      public void toApp(String json) { SgNetService.received(json); }
    });
    PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
    KeyguardManager km = (KeyguardManager) app.getSystemService(Context.KEYGUARD_SERVICE);
    screenOk = (pm == null || pm.isInteractive()) && (km == null || !km.isKeyguardLocked());
    IntentFilter f = new IntentFilter();
    f.addAction(Intent.ACTION_SCREEN_OFF);
    f.addAction(Intent.ACTION_SCREEN_ON);
    f.addAction(Intent.ACTION_USER_PRESENT);
    ContextCompat.registerReceiver(app, new BroadcastReceiver() {
      @Override public void onReceive(Context ctx, Intent i) {
        String a = i.getAction();
        if (Intent.ACTION_SCREEN_OFF.equals(a)) screenOk = false;
        else if (Intent.ACTION_USER_PRESENT.equals(a)) screenOk = true;
        else if (Intent.ACTION_SCREEN_ON.equals(a)) screenOk = km == null || !km.isKeyguardLocked();
        update();
      }
    }, f, ContextCompat.RECEIVER_EXPORTED);
    Meter.restore();
  }

  static boolean micGranted() {
    return app != null && ContextCompat.checkSelfPermission(app, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
  }
  /** Нужна ли службе связь «микрофон в фоне». */
  static boolean background() { return ("screen".equals(mode) || "always".equals(mode)) && micGranted(); }
  /** Держать ли службу включённой ради голоса. */
  static boolean active() { return "screen".equals(mode) || "always".equals(mode) || Meter.on; }

  static synchronized void configure(String m, String config, int s) {
    String was = mode;
    mode = m == null ? "off" : m;
    sens = s;
    try { core.configure(config == null ? "{}" : config); } catch (RuntimeException e) { errText = "настройка голоса не прочитана"; }
    grammarDirty = true;
    if (!"button".equals(mode)) button = false;
    if (!"off".equals(mode)) loadModel();
    if (background() || active()) SgNetService.ensureService();
    if (!was.equals(mode)) SgNetService.voiceForeground();
    update();
  }

  static void button(boolean on) { button = on; update(); }

  static boolean wanted() {
    if (!micGranted() || core == null || core.empty()) return false;
    if ("button".equals(mode)) return button && SgNetService.foreground;
    if ("screen".equals(mode)) return screenOk;
    return "always".equals(mode);
  }

  static synchronized void update() {
    if (app == null) return;
    boolean w = wanted() && model != null;
    if (!micGranted() && !"off".equals(mode)) errText = "нет разрешения на микрофон";
    else if (model == null && !"off".equals(mode)) errText = "модель: " + modelState;
    else if ("screen".equals(mode) && !screenOk) errText = "экран погашен или заблокирован — микрофон выключен";
    else if (!errText.startsWith("микрофон занят")) errText = "";
    if (w && !run) start();
    else if (!w && run) run = false;
    status();
  }

  /* ---------- модель: из APK в файлы приложения (один раз), затем загрузка ---------- */
  static void loadModel() {
    synchronized (SgVoice.class) {
      if (model != null || loading) return;
      loading = true;
      modelState = "загружается";
    }
    new Thread(() -> {
      try {
        File dir = new File(app.getFilesDir(), "vosk-ru");
        String want = readAsset(ASSET + "/uuid");
        if (want == null) throw new IllegalStateException("нет модели в APK");
        File mark = new File(dir, "uuid");
        if (!mark.exists() || !want.equals(readFile(mark))) {
          deleteAll(dir);
          copyAssets(app.getAssets(), ASSET, dir);
        }
        Model m = new Model(dir.getAbsolutePath());
        synchronized (SgVoice.class) { model = m; modelState = "готова"; }
      } catch (Throwable e) {
        modelState = "ошибка: " + e.getMessage();
      } finally {
        synchronized (SgVoice.class) { loading = false; }
        update();
      }
    }, "sg-voice-model").start();
  }

  static String readAsset(String path) {
    try (InputStream in = app.getAssets().open(path)) { return new String(readAll(in), "UTF-8").trim(); } catch (Exception e) { return null; }
  }
  static String readFile(File f) {
    try (InputStream in = new java.io.FileInputStream(f)) { return new String(readAll(in), "UTF-8").trim(); } catch (Exception e) { return null; }
  }
  static byte[] readAll(InputStream in) throws java.io.IOException {
    java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
    byte[] buf = new byte[8192];
    int n;
    while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
    return b.toByteArray();
  }
  static void copyAssets(AssetManager am, String from, File to) throws java.io.IOException {
    String[] list = am.list(from);
    if (list == null || list.length == 0) {
      to.getParentFile().mkdirs();
      try (InputStream in = am.open(from); OutputStream out = new FileOutputStream(to)) {
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
      }
      return;
    }
    to.mkdirs();
    for (String x : list) copyAssets(am, from + "/" + x, new File(to, x));
  }
  static void deleteAll(File f) {
    File[] l = f.listFiles();
    if (l != null) for (File x : l) deleteAll(x);
    f.delete();
  }

  /* ---------- звук ---------- */
  static synchronized void start() {
    Thread old = worker;
    if (old != null && old.isAlive()) { try { old.join(1000); } catch (InterruptedException ignored) { /* дальше */ } }
    run = true;
    worker = new Thread(SgVoice::loop, "sg-voice");
    worker.start();
  }

  static void loop() {
    AudioRecord rec = null;
    Recognizer r = null;
    boolean btn = "button".equals(mode);
    try {
      int min = AudioRecord.getMinBufferSize(SgVad.RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
      rec = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, SgVad.RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
        Math.max(min, SgVad.RATE));
      if (rec.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException("микрофон занят или недоступен");
      rec.startRecording();
      vad = new SgVad(sens);
      listening = true;
      listenFrom = System.currentTimeMillis();
      status();
      short[] f = new short[SgVad.FRAME];
      while (run) {
        if (r == null || grammarDirty) {
          if (r != null) r.close();
          r = new Recognizer(model, SgVad.RATE, core.grammar());
          r.setWords(true);
          grammarDirty = false;
        }
        int n = 0;
        while (n < f.length && run) {
          int k = rec.read(f, n, f.length - n);
          if (k < 0) throw new IllegalStateException("микрофон: ошибка чтения " + k);
          n += k;
        }
        if (n < f.length) break;
        if (btn) {
          speechMs += 20;
          if (r.acceptWaveForm(f, n)) core.heard(r.getResult(), false);
          continue;
        }
        int st = vad.push(f, n);
        if (st == SgVad.START) {
          for (short[] p : vad.preroll()) if (r.acceptWaveForm(p, p.length)) core.heard(r.getResult(), true);
        } else if (st == SgVad.SPEECH) {
          if (r.acceptWaveForm(f, n)) core.heard(r.getResult(), true);
        } else if (st == SgVad.END) {
          r.acceptWaveForm(f, n);
          core.heard(r.getFinalResult(), true);
        }
      }
      if (r != null) core.heard(r.getFinalResult(), !btn);   // кнопку отпустили — договорённое до конца
      errText = "";
    } catch (Throwable e) {
      errText = "микрофон занят или недоступен: " + e.getMessage();
      run = false;
    } finally {
      if (vad != null) speechMs += vad.fed * 20;
      if (listening) listenMs += System.currentTimeMillis() - listenFrom;
      listening = false;
      try { if (rec != null) { rec.stop(); rec.release(); } } catch (Throwable ignored) { /* уже */ }
      try { if (r != null) r.close(); } catch (Throwable ignored) { /* уже */ }
      vad = null;
      status();
      // за время остановки могли снова попросить слушать
      SgNetService.main.postDelayed(SgVoice::update, errText.isEmpty() ? 50 : 5000);
    }
  }

  /* ---------- состояние для приложения ---------- */
  static String statusJson() {
    SgVad v = vad;
    long frames = v == null ? 0 : v.frames, fed = v == null ? 0 : v.fed;
    return SgJson.str(SgJson.map("t", "voice-status", "mode", mode, "model", modelState, "listening", listening, "errText", errText,
      "lastText", core == null ? "" : core.lastText, "lastConf", core == null ? 0 : core.lastConf, "lastWhat", core == null ? "" : core.lastWhat,
      "heard", core == null ? 0 : core.heardN, "fired", core == null ? 0 : core.firedN, "rejected", core == null ? 0 : core.rejectedN,
      "frames", frames, "fed", fed, "listenMs", listenMs + (listening ? System.currentTimeMillis() - listenFrom : 0), "speechMs", speechMs + fed * 20,
      "metering", Meter.on, "meter", Meter.list(), "rate", Meter.rate(), "screen", screenOk));
  }
  static boolean lastListening;
  static void status() {
    if (lastListening == listening) return;
    lastListening = listening;
    SgNetService.received(statusJson());
  }

  /* ---------- замер батареи: раз в 5 минут заряд, режим, экран, сколько слушал ---------- */
  static final class Meter {
    static boolean on;
    static final List<Object> rows = new ArrayList<>();
    static final Runnable tick = Meter::sample;

    static SharedPreferences prefs() { return app.getSharedPreferences("sg-voice", Context.MODE_PRIVATE); }
    static void restore() {
      on = prefs().getBoolean("meter", false);
      try { rows.addAll(SgJson.a(SgJson.parse(prefs().getString("rows", "[]")))); } catch (RuntimeException ignored) { /* пусто */ }
      if (on) SgNetService.main.postDelayed(tick, 5 * 60000);
    }
    static synchronized void set(boolean v) {
      on = v;
      SgNetService.main.removeCallbacks(tick);
      if (v) { rows.clear(); sample(); SgNetService.ensureService(); }
      prefs().edit().putBoolean("meter", v).putString("rows", SgJson.str(rows)).apply();
    }
    static synchronized void sample() {
      BatteryManager bm = (BatteryManager) app.getSystemService(Context.BATTERY_SERVICE);
      PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
      long level = bm == null ? -1 : bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
      long fed = vad == null ? 0 : vad.fed;
      rows.add(SgJson.map("t", System.currentTimeMillis(), "level", level, "mode", mode, "screen", pm != null && pm.isInteractive(),
        "listen", listenMs + (listening ? System.currentTimeMillis() - listenFrom : 0), "speech", speechMs + fed * 20));
      while (rows.size() > 300) rows.remove(0);
      prefs().edit().putString("rows", SgJson.str(rows)).apply();
      if (on) { SgNetService.main.removeCallbacks(tick); SgNetService.main.postDelayed(tick, 5 * 60000); }
    }
    static synchronized List<Object> list() { return new ArrayList<>(rows); }
    /** Расход по режимам: «всегда в фоне: 2,1 %/ч за 2,0 ч; выкл: 0,7 %/ч за 2,0 ч». */
    static synchronized String rate() {
      Map<String, double[]> by = new java.util.LinkedHashMap<>();
      for (int i = 1; i < rows.size(); i++) {
        Map<String, Object> a = SgJson.m(rows.get(i - 1)), b = SgJson.m(rows.get(i));
        if (a == null || b == null) continue;
        String m = SgJson.s(a, "mode");
        if (!String.valueOf(m).equals(SgJson.s(b, "mode"))) continue;
        double h = (SgJson.l(b, "t", 0) - SgJson.l(a, "t", 0)) / 3600000.0;
        double d = SgJson.l(a, "level", 0) - SgJson.l(b, "level", 0);
        if (h <= 0 || d < -1) continue;   // зарядка — пропустить
        double[] x = by.get(m);
        if (x == null) { x = new double[2]; by.put(m, x); }
        x[0] += d; x[1] += h;
      }
      StringBuilder s = new StringBuilder();
      for (Map.Entry<String, double[]> e : by.entrySet()) {
        if (e.getValue()[1] < 0.2) continue;
        if (s.length() > 0) s.append("; ");
        s.append(e.getKey()).append(": ").append(String.format(java.util.Locale.ROOT, "%.1f", e.getValue()[0] / e.getValue()[1]).replace('.', ','))
          .append(" %/ч за ").append(String.format(java.util.Locale.ROOT, "%.1f", e.getValue()[1]).replace('.', ',')).append(" ч");
      }
      return s.toString();
    }
  }
}
