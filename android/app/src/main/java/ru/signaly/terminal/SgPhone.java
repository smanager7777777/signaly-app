package ru.signaly.terminal;

import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.PowerManager;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.content.ContextCompat;
import java.util.Map;
import ru.signaly.net.SgCenter;
import ru.signaly.net.SgJson;
import ru.signaly.net.SgPhoneCore;

/** П17 (Т8-6 Б): события телефона в службе — и когда приложение свёрнуто или экран погашен.
 *  Датчик ускорения (только если есть правила «встряхнули» / положение), экран (погас / включился / разблокирован),
 *  приложение на экране или нет (плагин: onPause / onResume) → SgPhoneCore. Таймер раз в секунду — для «дольше N с». */
class SgPhone {
  static SgPhoneCore core;
  static Context app;
  static SensorManager sm;
  static boolean listening, ticking;
  static ToneGenerator tone;

  static synchronized void init(Context c) {
    if (app != null) return;
    app = c.getApplicationContext();
    core = new SgPhoneCore(new SgPhoneCore.Out() {
      public long now() { return System.currentTimeMillis() + SgNetService.centerOffset; }
      public void send(String json) { SgNetService.send(json); }
      public void toApp(String json) { SgNetService.received(json); }
      public boolean local(String kind, Map<String, Object> body) { return doLocal(kind, body); }
    });
    PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
    KeyguardManager km = (KeyguardManager) app.getSystemService(Context.KEYGUARD_SERVICE);
    core.screenOn = pm == null || pm.isInteractive();
    core.unlocked = core.screenOn && (km == null || !km.isKeyguardLocked());
    IntentFilter f = new IntentFilter();
    f.addAction(Intent.ACTION_SCREEN_OFF);
    f.addAction(Intent.ACTION_SCREEN_ON);
    f.addAction(Intent.ACTION_USER_PRESENT);
    ContextCompat.registerReceiver(app, new BroadcastReceiver() {
      @Override public void onReceive(Context ctx, Intent i) {
        String a = i.getAction();
        long t = core.now() ;
        if (Intent.ACTION_SCREEN_OFF.equals(a)) core.screen("off", t);
        else if (Intent.ACTION_USER_PRESENT.equals(a)) core.screen("present", t);
        else if (Intent.ACTION_SCREEN_ON.equals(a)) {
          core.screen("on", t);
          if (km == null || !km.isKeyguardLocked()) core.screen("present", t);   // без блокировки экрана
        }
      }
    }, f, ContextCompat.RECEIVER_EXPORTED);
  }

  /** Настройка от приложения (SG.phoneConfig): правила этого персонажа в этой главе. */
  static synchronized void configure(String json) {
    if (core == null) return;
    core.configure(json == null ? "{}" : json);
    sensors();
    if (core.any()) SgNetService.ensureService();
  }

  static void foreground(boolean fg) {
    if (core != null) core.foreground(fg, core.now());
  }

  static boolean active() { return core != null && core.any(); }
  /** П25 (06, 149): в руках ли телефон (нет датчика или правил — считается, что да, если разблокирован). */
  static boolean inHands() { return core == null || !core.needsMotion() ? true : core.inHands(core.now()); }

  static final SensorEventListener motion = new SensorEventListener() {
    @Override public void onSensorChanged(SensorEvent e) {
      if (core != null && e.values.length >= 3) core.motion(e.values[0], e.values[1], e.values[2], core.now());
    }
    @Override public void onAccuracyChanged(Sensor s, int a) { }
  };

  static final Runnable tick = new Runnable() {
    @Override public void run() {
      if (core == null || !core.needsTick()) { ticking = false; return; }
      core.tick(core.now());
      SgNetService.main.postDelayed(this, 1000);
    }
  };

  /** Датчик ускорения — только когда нужен (батарея); таймер — только для «дольше N с». */
  static void sensors() {
    if (sm == null) sm = (SensorManager) app.getSystemService(Context.SENSOR_SERVICE);
    boolean want = core.needsMotion();
    if (sm != null && want && !listening) {
      Sensor s = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
      if (s != null) { sm.registerListener(motion, s, SensorManager.SENSOR_DELAY_UI); listening = true; }
    } else if (sm != null && !want && listening) {
      sm.unregisterListener(motion);
      listening = false;
    }
    if (core.needsTick() && !ticking) { ticking = true; SgNetService.main.postDelayed(tick, 1000); }
  }

  /** Что служба делает сама: вспышка, короткий сигнал; уведомление — в шторку, только если приложение не на экране. */
  static boolean doLocal(String kind, Map<String, Object> body) {
    try {
      if ("torch".equals(kind)) {
        SgNetService.flash((int) Math.max(1, Math.min(20, SgJson.l(body, "n", 3))));
        return true;
      }
      if ("beep".equals(kind)) {
        if (tone == null) tone = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 80);
        tone.startTone("err".equals(SgJson.s(body, "sound")) ? ToneGenerator.TONE_PROP_NACK : ToneGenerator.TONE_PROP_BEEP, 180);
        if (body == null || !Boolean.FALSE.equals(body.get("vibrate"))) {
          Vibrator v = (Vibrator) app.getSystemService(Context.VIBRATOR_SERVICE);
          if (v != null) {
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(150, VibrationEffect.DEFAULT_AMPLITUDE));
            else v.vibrate(150);
          }
        }
        return true;
      }
      if ("notify".equals(kind)) {
        if (SgNetService.foreground) return false;   // приложение на экране — окно покажет оно
        SgNetService.note(SgCenter.fillVars(SgJson.s(body, "title"), SgNetService.vars), SgCenter.fillVars(SgJson.s(body, "text"), SgNetService.vars));
        return true;
      }
    } catch (RuntimeException e) { return false; }
    return false;
  }
}
