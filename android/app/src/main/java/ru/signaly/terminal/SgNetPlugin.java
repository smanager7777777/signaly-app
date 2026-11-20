package ru.signaly.terminal;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.WindowManager;

import android.app.NotificationManager;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

import ru.signaly.net.SgCenter;
import ru.signaly.net.SgLink;

/** СИГНАЛЫ: мост между страницей приложения (JS) и службой связи. В JS — window.Capacitor.Plugins.SgNet. */
@CapacitorPlugin(name = "SgNet")
public class SgNetPlugin extends Plugin {

  @Override public void load() {
    SgNetService.init(getContext());
    SgNetService.sink = new SgNetService.Sink() {
      public void onText(long idx, String text) {
        JSObject o = new JSObject();
        o.put("idx", idx);
        o.put("text", text);
        notifyListeners("text", o);
      }
      public void onStatus(boolean up, String info) {
        JSObject o = new JSObject();
        o.put("up", up);
        o.put("info", info);
        notifyListeners("status", o);
      }
    };
  }

  @Override protected void handleOnPause() { SgNetService.foreground = false; SgVoice.update(); SgPhone.foreground(false); }
  @Override protected void handleOnResume() { SgNetService.foreground = true; SgVoice.update(); SgPhone.foreground(true); }

  /** П17 (Т8-6 Б): правила «на самом телефоне» — их выполняет служба (и в фоне). */
  @PluginMethod public void phoneConfig(PluginCall call) {
    SgNetService.init(getContext());
    SgPhone.configure(call.getString("config", "{}"));
    call.resolve();
  }

  @PluginMethod public void connect(PluginCall call) {
    String url = call.getString("url");
    String hello = call.getString("hello", "{\"t\":\"hello\"}");
    if (url == null || url.isEmpty()) { call.reject("нет адреса центра"); return; }
    askNotifications();
    SgNetService.connect(url, hello);
    call.resolve();
  }

  @PluginMethod public void setHello(PluginCall call) {
    SgNetService.setHello(call.getString("hello", "{\"t\":\"hello\"}"));
    call.resolve();
  }

  @PluginMethod public void disconnect(PluginCall call) {
    SgNetService.disconnect();
    call.resolve();
  }

  @PluginMethod public void send(PluginCall call) {
    SgNetService.send(call.getString("text", ""));
    call.resolve();
  }

  /** Всё, что пришло начиная с номера from (пока страница спала, сообщения копятся в службе). */
  @PluginMethod public void drain(PluginCall call) {
    long[] next = new long[1];
    Object f = call.getData().opt("from");
    List<String> got = SgNetService.drain(f instanceof Number ? ((Number) f).longValue() : 0L, next);
    JSArray a = new JSArray();
    for (String s : got) a.put(s);
    JSObject o = new JSObject();
    o.put("items", a);
    o.put("next", next[0]);
    call.resolve(o);
  }

  @PluginMethod public void status(PluginCall call) {
    JSObject o = new JSObject();
    o.put("up", SgNetService.linkUp);
    o.put("info", SgNetService.linkInfo);
    o.put("queued", SgNetService.link == null ? 0 : SgNetService.link.queued());
    o.put("center", SgNetService.center != null);
    o.put("online", SgNetService.center == null ? 0 : SgNetService.center.online());
    o.put("port", SgCenter.PORT);
    // проверка сети для экрана «СЕТЬ»: почему нет связи
    SgLink l = SgNetService.link;
    o.put("err", l == null ? "" : l.err);
    o.put("errText", l == null ? "" : l.errText);
    o.put("tries", l == null ? 0 : l.tries);
    o.put("bind", SgNetService.bindNote);
    o.put("vpn", SgNetService.vpnOn());
    o.put("wifi", SgNetService.wifiOn());
    String url = SgNetService.prefs().getString("url", null);
    Boolean same = url == null ? null : SgLink.sameSubnet(SgLink.hostOf(url));
    if (same != null) o.put("same", same.booleanValue());
    JSArray ips = new JSArray();
    for (String ip : SgNetService.addresses()) ips.put(ip);
    o.put("ips", ips);
    // П17: копия игры на этом телефоне (запасной центр)
    if (SgNetService.replica != null) {
      java.util.Map<String, Object> ri = SgNetService.replica.info();
      JSObject r = new JSObject();
      r.put("has", Boolean.TRUE.equals(ri.get("has")));
      r.put("at", ((Number) ri.get("at")).longValue());
      r.put("msgs", ((Number) ri.get("msgs")).longValue());
      r.put("gen", ((Number) ri.get("gen")).longValue());
      o.put("rep", r);
    }
    o.put("gen", l == null ? 0 : l.gen);
    call.resolve(o);
  }

  /** П17: «Поднять центр отсюда» (из копии этого телефона или из файла: data). */
  @PluginMethod public void takeover(PluginCall call) {
    askNotifications();
    String err = SgNetService.takeover(call.getString("data", null));
    if (err != null) { call.reject(err); return; }
    status(call);
  }

  /** П17: копия игры этого телефона — текстом (выгрузка в файл без связи с центром). */
  @PluginMethod public void replicaDump(PluginCall call) {
    JSObject o = new JSObject();
    o.put("text", SgNetService.replica == null ? "" : SgNetService.replica.dump());
    call.resolve(o);
  }

  /** П17: записать файл в «Загрузки». */
  @PluginMethod public void saveFile(PluginCall call) {
    try {
      String where = SgNetService.saveFile(call.getString("name", "signaly.json"), call.getString("text", ""));
      JSObject o = new JSObject();
      o.put("where", where);
      call.resolve(o);
    } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
  }

  @PluginMethod public void startCenter(PluginCall call) {
    askNotifications();
    String err = SgNetService.startCenter();
    if (err != null) { call.reject("центр не запустился: " + err); return; }
    status(call);
  }

  @PluginMethod public void stopCenter(PluginCall call) {
    SgNetService.stopCenter();
    call.resolve();
  }

  /** П16: действие «Вспышка» — фонарик мигает count раз. */
  @PluginMethod public void flash(PluginCall call) {
    final int n = call.getInt("count", 3);
    SgNetService.main.post(() -> SgNetService.flash(n));
    call.resolve();
  }

    @PluginMethod public void notify(PluginCall call) {
    SgNetService.note(call.getString("title", "СИГНАЛЫ"), call.getString("text", ""));
    call.resolve();
  }

  /** Местная авария (без сети: код введён, пока нет связи). */
  @PluginMethod public void alarm(PluginCall call) {
    boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
    if (on) {
      SgNetService.alarmKey = "local:" + System.currentTimeMillis();
      final boolean snd = Boolean.TRUE.equals(call.getBoolean("siren", true));
      final boolean vib = Boolean.TRUE.equals(call.getBoolean("vibrate", true));
      final boolean torch = Boolean.TRUE.equals(call.getBoolean("torch", true));
      final String title = call.getString("title", "");
      final String text = call.getString("text", "");
      SgNetService.main.post(() -> SgNetService.alarmOn(snd, vib, torch, title, text, false));
    } else {
      SgNetService.alarmKey = null;
      SgNetService.main.post(SgNetService::alarmOff);
    }
    call.resolve();
  }

  /* ---------- голос (П-58) ---------- */
  JSObject voiceState() {
    try { return new JSObject(SgVoice.statusJson()); } catch (Exception e) { return new JSObject(); }
  }

  /** Режим и фразы: mode (off, button, screen, always), config — SG.voiceConfig (JSON), sens — детектор голоса. */
  @PluginMethod public void voiceConfig(PluginCall call) {
    String mode = call.getString("mode", "off");
    if (!"off".equals(mode) && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.RECORD_AUDIO }, 7153);
    }
    SgVoice.configure(mode, call.getString("config", "{}"), call.getInt("sens", 1));
    call.resolve(voiceState());
  }

  /** Кнопка 🎙: on — слушать, пока не отпустят. */
  @PluginMethod public void voiceButton(PluginCall call) {
    SgVoice.button(Boolean.TRUE.equals(call.getBoolean("on", false)));
    call.resolve(voiceState());
  }

  @PluginMethod public void voiceStatus(PluginCall call) { call.resolve(voiceState()); }

  /** Замер батареи: раз в 5 минут заряд, режим, экран. */
  @PluginMethod public void voiceMeter(PluginCall call) {
    SgVoice.Meter.set(Boolean.TRUE.equals(call.getBoolean("on", false)));
    call.resolve(voiceState());
  }

  /** Не гасить экран (телефон-центр на зарядке). */
  @PluginMethod public void keepScreen(PluginCall call) {
    final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
    getActivity().runOnUiThread(() -> {
      if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    });
    call.resolve();
  }

  /** Попросить Android не усыплять приложение (экономия батареи). */
  @PluginMethod public void battery(PluginCall call) {
    JSObject o = new JSObject();
    if (Build.VERSION.SDK_INT >= 23) {
      PowerManager pm = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
      boolean ok = pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
      o.put("ok", ok);
      if (!ok && Boolean.TRUE.equals(call.getBoolean("ask", false))) {
        try {
          Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName()));
          getActivity().startActivity(i);
        } catch (Exception e) {
          try { getActivity().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); } catch (Exception ignored) { /* нет экрана */ }
        }
      }
    } else o.put("ok", true);
    call.resolve(o);
  }

  /** Первый вход (П-55): какие разрешения уже есть; ask — попросить одно (cam, mic, notify, full). */
  @PluginMethod public void perms(PluginCall call) {
    String ask = call.getString("ask", "");
    android.content.Context c = getContext();
    try {
      if ("notify".equals(ask)) {
        if (Build.VERSION.SDK_INT >= 33) askNotifications();
        else openAppNotifications();
      } else if ("full".equals(ask) && Build.VERSION.SDK_INT >= 34) {
        getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + c.getPackageName())));
      } else if ("cam".equals(ask)) {
        ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.CAMERA }, 7151);
      } else if ("mic".equals(ask)) {
        ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.RECORD_AUDIO }, 7152);
      }
    } catch (Exception ignored) { /* нет такого экрана настроек */ }
    JSObject o = new JSObject();
    o.put("cam", ContextCompat.checkSelfPermission(c, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED);
    o.put("mic", ContextCompat.checkSelfPermission(c, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED);
    o.put("notify", NotificationManagerCompat.from(c).areNotificationsEnabled());
    boolean full = true;
    if (Build.VERSION.SDK_INT >= 34) {
      NotificationManager nm = (NotificationManager) c.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
      full = nm == null || nm.canUseFullScreenIntent();
    }
    o.put("full", full);
    o.put("sdk", Build.VERSION.SDK_INT);
    call.resolve(o);
  }

  /** До Android 13 разрешения на уведомления нет — только переключатель в настройках приложения. */
  void openAppNotifications() {
    Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
    i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
    getActivity().startActivity(i);
  }

  void askNotifications() {
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 7150);
    }
  }
}
