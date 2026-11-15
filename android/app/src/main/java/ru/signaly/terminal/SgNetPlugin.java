package ru.signaly.terminal;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.WindowManager;

import androidx.core.app.ActivityCompat;
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

  @Override protected void handleOnPause() { SgNetService.foreground = false; }
  @Override protected void handleOnResume() { SgNetService.foreground = true; }

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
    call.resolve(o);
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

  void askNotifications() {
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 7150);
    }
  }
}
