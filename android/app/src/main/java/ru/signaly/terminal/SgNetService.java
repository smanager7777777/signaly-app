package ru.signaly.terminal;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.RouteInfo;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

import androidx.core.app.NotificationCompat;

import java.io.File;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import ru.signaly.net.SgCenter;
import ru.signaly.net.SgJson;
import ru.signaly.net.SgLink;
import ru.signaly.net.SgReplica;
import ru.signaly.net.SgSeen;

/** СИГНАЛЫ: служба связи. Держит соединение с центром (и сам центр, если он на этом телефоне)
 *  с погашенным экраном, показывает уведомления в шторке, включает аварийный режим (сирена громче
 *  беззвучного режима — поток будильника, вибрация, фонарик). Состояние — статическое (Core),
 *  служба нужна, чтобы Android не усыплял приложение. */
public class SgNetService extends Service {
  static final String CH_LINK = "sg-link", CH_NOTE = "sg-note", CH_ALARM = "sg-alarm";
  static final int ID_FG = 7100, ID_ALARM = 7101;
  static int noteId = 7200;

  interface Sink {
    void onText(long idx, String text);
    void onStatus(boolean up, String info);
  }

  /* ---------- общее состояние ---------- */
  static Context app;
  static SgLink link;
  static SgCenter center;
  /** П17 (Т8-1 А): копия состояния центра на этом телефоне — запасной центр (файл replica.json). */
  static SgReplica replica;
  static final List<String> buf = new ArrayList<>();
  static long bufBase = 0;
  static volatile boolean foreground = true;
  static volatile Sink sink;
  static volatile boolean linkUp;
  static volatile String linkInfo = "";
  static String myAcc;
  /** Что служба уже показала в шторке: повтор старых сообщений после переподключения не всплывает снова. */
  static SgSeen seen;
  /** Время центра − время телефона (из welcome и pong): голос подставляет время центра в действия. */
  static volatile long centerOffset;
  static SgNetService instance;
  static final Handler main = new Handler(Looper.getMainLooper());

  static synchronized void init(Context c) {
    if (app != null) return;
    app = c.getApplicationContext();
    NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
    if (Build.VERSION.SDK_INT >= 26 && nm != null) {
      NotificationChannel a = new NotificationChannel(CH_LINK, "Связь с центром", NotificationManager.IMPORTANCE_LOW);
      a.setShowBadge(false);
      nm.createNotificationChannel(a);
      NotificationChannel b = new NotificationChannel(CH_NOTE, "Сообщения игры", NotificationManager.IMPORTANCE_HIGH);
      b.enableVibration(true);
      nm.createNotificationChannel(b);
      NotificationChannel c2 = new NotificationChannel(CH_ALARM, "Аварийный режим", NotificationManager.IMPORTANCE_HIGH);
      c2.setSound(null, null);
      c2.enableVibration(false);
      nm.createNotificationChannel(c2);
    }
    SharedPreferences sp = prefs();
    seen = new SgSeen(sp.getString("seen-epoch", null), sp.getLong("seen-seq", 0),
      (ep, sq) -> prefs().edit().putString("seen-epoch", ep).putLong("seen-seq", sq).apply());
    SgVoice.init(app);
    replica = new SgReplica(new File(app.getFilesDir(), "replica.json"));
    replica.autoSave();
    SgPhone.init(app);
  }

  static SharedPreferences prefs() { return app.getSharedPreferences("sg-net", Context.MODE_PRIVATE); }

  /* ---------- связь ---------- */
  static synchronized void connect(String url, String hello) {
    prefs().edit().putString("url", url).putString("hello", hello).apply();
    readAcc(hello);
    if (link == null) {
      link = new SgLink(new SgLink.Listener() {
        public void onText(String text) { received(text); }
        public void onStatus(boolean up, String info) {
          linkUp = up;
          if (up) linkFails = 0; else linkFails++;
          linkInfo = info;
          Sink s = sink;
          if (s != null) s.onStatus(up, info);
          refreshForeground();
        }
      });
      link.prep = SgNetService::prepSocket;
      link.alt = SgNetService::gatewayUrl;
      link.finder = SgNetService::findList;
      link.replica = replica;
      link.repWant = () -> center == null;   // телефон сам центр — копия не нужна
      watchWifi();
    }
    link.start(url, hello);
    ensureService();
    main.removeCallbacks(statTick);
    main.postDelayed(statTick, 4000);
  }

  /* ---------- П16: пульт «ТЕЛЕФОНЫ» — раз в минуту заряд, голос, версия приложения (служба шлёт и в фоне) ---------- */
  static final Runnable statTick = SgNetService::sendStat;
  static void sendStat() {
    main.removeCallbacks(statTick);
    if (link == null || app == null) return;
    try {
      Map<String, Object> bat = null;
      android.os.BatteryManager bm = (android.os.BatteryManager) app.getSystemService(Context.BATTERY_SERVICE);
      if (bm != null) bat = SgJson.map("l", (long) bm.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY), "c", bm.isCharging());
      String apk = "";
      try { apk = app.getPackageManager().getPackageInfo(app.getPackageName(), 0).versionName; } catch (Exception ignored) { /* нет */ }
      Map<String, Object> v = SgJson.map("mode", SgVoice.mode, "on", SgVoice.listening, "err", SgVoice.errText, "free", SgVoice.core != null && SgVoice.core.free);
      if (SgVoice.core != null && SgVoice.core.heardAt > 0) { v.put("last", SgVoice.core.lastText); v.put("what", SgVoice.core.lastWhat); v.put("at", SgVoice.core.heardAt); }
      if (link.connected()) send(SgJson.str(SgJson.map("t", "stat", "bat", bat, "voice", v, "apk", apk)));
    } catch (RuntimeException ignored) { /* не страшно */ }
    main.postDelayed(statTick, 60000);
  }

  /* ---------- сеть Wi-Fi напрямую ----------
     Если Wi-Fi без интернета, Android шлёт всё через мобильные данные; VPN забирает и адреса 192.168…
     Привязываем сокет к сети Wi-Fi, в подсети которой лежит адрес центра. VPN, не разрешающий обход,
     привязку запрещает — тогда остаётся путь по умолчанию, а на экране — совет выключить VPN. */
  static volatile String bindNote = "";
  static volatile int linkFails;

  static void prepSocket(Socket s, String host) {
    String note = "";
    try {
      InetAddress t = InetAddress.getByName(host);
      if (t.isLoopbackAddress() || Build.VERSION.SDK_INT < 23) { bindNote = "local"; return; }
      Network n = wifiFor(t);
      if (n == null) note = "nowifi";
      else {
        try { n.bindSocket(s); note = "wifi"; } catch (Exception e) { note = "blocked"; }
      }
    } catch (Exception e) { note = "?"; }
    bindNote = note;
  }

  /** Запасной адрес центра — шлюз сети Wi-Fi (П-38: центр — телефон мастера с точкой доступа,
   *  после перезапуска точки её адрес может смениться, а шлюзом она остаётся). */
  static String gatewayUrl(String url) {
    try {
      String host = SgLink.hostOf(url);
      if (host == null) return null;
      InetAddress h = InetAddress.getByName(host);
      if (h.isLoopbackAddress()) return null;
      int port = SgCenter.PORT;
      int col = url.lastIndexOf(':');
      if (col > 5) try { port = Integer.parseInt(url.substring(col + 1).replaceAll("/.*", "")); } catch (NumberFormatException ignored) { /* по умолчанию */ }
      ConnectivityManager cm = (ConnectivityManager) app.getSystemService(Context.CONNECTIVITY_SERVICE);
      if (cm == null) return null;
      for (Network n : cm.getAllNetworks()) {
        NetworkCapabilities nc = cm.getNetworkCapabilities(n);
        if (nc == null || nc.hasTransport(NetworkCapabilities.TRANSPORT_VPN) || !nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) continue;
        LinkProperties lp = cm.getLinkProperties(n);
        if (lp == null) continue;
        for (RouteInfo r : lp.getRoutes()) {
          InetAddress g = r.getGateway();
          if (r.isDefaultRoute() && g instanceof Inet4Address && !g.isAnyLocalAddress()) return "ws://" + g.getHostAddress() + ":" + port;
        }
      }
    } catch (Exception ignored) { /* нет сети */ }
    return null;
  }

  /** П-62: где искать центр без адреса. Первым — шлюз каждой сети Wi-Fi (центр — телефон мастера с точкой
   *  доступа, он же шлюз), затем вся подсеть /24 этих сетей, затем адреса по умолчанию (SgLink.subnetUrls). */
  static List<String> findList() {
    List<String> out = new ArrayList<>();
    int port = SgCenter.PORT;
    try {
      ConnectivityManager cm = (ConnectivityManager) app.getSystemService(Context.CONNECTIVITY_SERVICE);
      if (cm != null) {
        List<String> nets = new ArrayList<>();
        for (Network n : cm.getAllNetworks()) {
          NetworkCapabilities nc = cm.getNetworkCapabilities(n);
          if (nc == null || nc.hasTransport(NetworkCapabilities.TRANSPORT_VPN) || !nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) continue;
          LinkProperties lp = cm.getLinkProperties(n);
          if (lp == null) continue;
          for (RouteInfo r : lp.getRoutes()) {
            InetAddress g = r.getGateway();
            if (r.isDefaultRoute() && g instanceof Inet4Address && !g.isAnyLocalAddress()) out.add("ws://" + g.getHostAddress() + ":" + port);
          }
          for (LinkAddress la : lp.getLinkAddresses()) {
            InetAddress a = la.getAddress();
            if (!(a instanceof Inet4Address)) continue;
            byte[] b = a.getAddress();
            String pre = (b[0] & 255) + "." + (b[1] & 255) + "." + (b[2] & 255) + ".";
            int me = b[3] & 255;
            for (int i = 1; i < 255; i++) if (i != me) nets.add("ws://" + pre + i + ":" + port);
          }
        }
        out.addAll(nets);
      }
    } catch (Exception ignored) { /* нет сети */ }
    out.addAll(SgLink.subnetUrls(port));
    return out;
  }

  /** Сеть Wi-Fi появилась или пропала — переподключиться сразу (П-38: точку доступа выключили и включили). */
  static boolean watching;
  static void watchWifi() {
    if (watching || Build.VERSION.SDK_INT < 24) return;
    try {
      ConnectivityManager cm = (ConnectivityManager) app.getSystemService(Context.CONNECTIVITY_SERVICE);
      if (cm == null) return;
      cm.registerNetworkCallback(new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(),
        new ConnectivityManager.NetworkCallback() {
          @Override public void onAvailable(Network n) { main.postDelayed(() -> kick(true), 1500); }
          @Override public void onLost(Network n) { kick(true); }
        });
      watching = true;
    } catch (Exception ignored) { /* нет разрешения */ }
  }

  static void kick(boolean drop) {
    SgLink l = link;
    if (l == null) return;
    try {
      String host = SgLink.hostOf(l.cur != null ? l.cur : l.url());
      if (host != null && !SgLink.AUTO.equals(host) && InetAddress.getByName(host).isLoopbackAddress()) drop = false;   // центр на этом телефоне
    } catch (Exception ignored) { /* имя не разобрать */ }
    final boolean d = drop;
    new Thread(() -> l.kick(d), "sg-kick").start();
  }

  /** Сеть Wi-Fi (не VPN), в подсети которой лежит адрес. */
  static Network wifiFor(InetAddress t) {
    ConnectivityManager cm = (ConnectivityManager) app.getSystemService(Context.CONNECTIVITY_SERVICE);
    if (cm == null) return null;
    for (Network n : cm.getAllNetworks()) {
      NetworkCapabilities nc = cm.getNetworkCapabilities(n);
      if (nc == null || nc.hasTransport(NetworkCapabilities.TRANSPORT_VPN) || !nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) continue;
      LinkProperties lp = cm.getLinkProperties(n);
      if (lp == null) continue;
      for (LinkAddress la : lp.getLinkAddresses()) {
        if (la.getAddress() instanceof Inet4Address && SgLink.sameNet(la.getAddress(), t, la.getPrefixLength())) return n;
      }
    }
    return null;
  }

  /** Включён ли VPN на телефоне. */
  static boolean vpnOn() {
    try {
      ConnectivityManager cm = (ConnectivityManager) app.getSystemService(Context.CONNECTIVITY_SERVICE);
      if (cm == null) return false;
      for (Network n : cm.getAllNetworks()) {
        NetworkCapabilities nc = cm.getNetworkCapabilities(n);
        if (nc != null && nc.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return true;
      }
    } catch (Exception ignored) { /* нет доступа */ }
    return false;
  }

  /** Есть ли подключение к Wi-Fi. */
  static boolean wifiOn() {
    try {
      ConnectivityManager cm = (ConnectivityManager) app.getSystemService(Context.CONNECTIVITY_SERVICE);
      if (cm == null) return false;
      for (Network n : cm.getAllNetworks()) {
        NetworkCapabilities nc = cm.getNetworkCapabilities(n);
        if (nc != null && nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) && !nc.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return true;
      }
    } catch (Exception ignored) { /* нет доступа */ }
    return false;
  }

  static void readAcc(String hello) {
    try { myAcc = SgJson.s(SgJson.obj(hello), "acc"); } catch (RuntimeException e) { myAcc = null; }
  }

  static synchronized void setHello(String hello) {
    prefs().edit().putString("hello", hello).apply();
    readAcc(hello);
    if (link != null) link.setHello(hello);
  }

  static synchronized void disconnect() {
    prefs().edit().remove("url").apply();
    if (link != null) link.stop();
    link = null;
    linkUp = false;
    stopIfIdle();
  }

  /** Отправка в сокет — не в главном потоке: Android запрещает там сеть (NetworkOnMainThreadException).
   *  П18: приложение падало при разблокировке и встряхивании — правила телефона (SgPhone) и «stat» шли из главного потока. */
  static final java.util.concurrent.ExecutorService sender = java.util.concurrent.Executors.newSingleThreadExecutor();
  static void send(String text) {
    SgLink l = link;
    if (l == null) return;
    if (Looper.myLooper() == Looper.getMainLooper()) sender.execute(() -> l.send(text));
    else l.send(text);
  }

  static void received(String text) {
    // П17: пачки копии разбирает SgLink (SgReplica) — странице они не нужны и не должны вытеснять сообщения из буфера
    if (text.startsWith("{\"t\":\"rep\"")) return;
    long idx;
    synchronized (buf) {
      buf.add(text);
      while (buf.size() > 600) { buf.remove(0); bufBase++; }
      idx = bufBase + buf.size() - 1;
    }
    Sink s = sink;
    if (s != null) s.onText(idx, text);
    try { react(SgJson.obj(text)); } catch (RuntimeException ignored) { /* не JSON */ }
  }

  static List<String> drain(long from, long[] next) {
    synchronized (buf) {
      List<String> out = new ArrayList<>();
      long start = Math.max(from, bufBase);
      for (long k = start; k < bufBase + buf.size(); k++) out.add(buf.get((int) (k - bufBase)));
      next[0] = bufBase + buf.size();
      return out;
    }
  }

  /** П13: общие переменные из состояния центра («var:имя») — для «{{имя}}» в уведомлениях шторки. */
  static final Map<String, Object> vars = new java.util.concurrent.ConcurrentHashMap<>();

  /** Что служба делает сама, даже когда приложение спит: шторка и авария. */
  static void react(Map<String, Object> o) {
    String t = SgJson.s(o, "t");
    if ("welcome".equals(t) || "pong".equals(t)) {
      long now = SgJson.l(o, "now", 0);
      if (now > 0) centerOffset = now - System.currentTimeMillis();
    }
    if ("claimed".equals(t) && SgVoice.core != null && SgVoice.core.claimed(o)) return;   // ответ на фразу голосом
    if (seen != null && !seen.fresh(o)) return;   // это сообщение служба уже показывала (повтор после переподключения)
    if ("msg".equals(t)) {
      if (!toMe(SgJson.a(o.get("to")))) return;
      Map<String, Object> body = SgJson.m(o.get("body"));
      Map<String, Object> from = SgJson.m(o.get("from"));
      String kind = SgJson.s(o, "kind");
      if ("notify".equals(kind)) {
        note(SgCenter.fillVars(SgJson.s(body, "title"), vars), SgCenter.fillVars(SgJson.s(body, "text"), vars));
      } else if ("chat".equals(kind) && !foreground) {
        if (myAcc != null && myAcc.equals(SgJson.s(from, "acc"))) return;
        String who = SgJson.s(from, "name");
        Map<String, Object> as = body == null ? null : SgJson.m(body.get("as"));
        if (SgJson.b(body, "sys") || ("master".equals(SgJson.s(from, "role")) && as == null)) who = "СИСТЕМА";
        else if (as != null && "master".equals(SgJson.s(from, "role"))) who = SgJson.s(as, "name");
        if (SgJson.b(from, "anon") || SgJson.b(body, "anon")) who = null;
        note("СВЯЗЬ" + (who != null ? ": " + who : ""), SgJson.b(body, "photo") ? "[снимок]" : SgJson.s(body, "text"));
      } else if (("open".equals(kind) || "signed".equals(kind)) && !foreground) {
        note("НОВЫЕ ДАННЫЕ", SgJson.s(body, "title"));
      }
    } else if ("state".equals(t)) {
      if ("alarm".equals(SgJson.s(o, "key"))) alarmState(SgJson.m(o.get("value")));
      if ("probe".equals(SgJson.s(o, "key"))) SgVoice.probe(SgJson.m(o.get("value")));   // П16: проба голоса с пульта
      String k = SgJson.s(o, "key");
      if (k != null && k.startsWith("var:")) { if (o.get("value") == null) vars.remove(k); else vars.put(k, o.get("value")); }
    } else if ("welcome".equals(t)) {
      Map<String, Object> st = SgJson.m(o.get("state"));
      vars.clear();
      if (st != null) for (Map.Entry<String, Object> e : st.entrySet()) if (e.getKey().startsWith("var:")) vars.put(e.getKey(), e.getValue());
      alarmState(st == null ? null : SgJson.m(st.get("alarm")));
      SgVoice.probe(st == null ? null : SgJson.m(st.get("probe")));
      main.postDelayed(SgNetService::sendStat, 1500);
    }
  }

  static boolean toMe(List<Object> to) {
    for (Object x : to) {
      String s = String.valueOf(x);
      if (s.equals("all") || (myAcc != null && s.equals("acc:" + myAcc))) return true;
    }
    return false;
  }

  static void note(String title, String text) {
    if (app == null) return;
    Intent i = new Intent(app, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
    PendingIntent pi = PendingIntent.getActivity(app, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    Notification n = new NotificationCompat.Builder(app, CH_NOTE)
      .setSmallIcon(R.drawable.ic_stat_sg)
      .setContentTitle(title == null ? "СИГНАЛЫ" : title)
      .setContentText(text == null ? "" : text)
      .setStyle(new NotificationCompat.BigTextStyle().bigText(text == null ? "" : text))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setDefaults(NotificationCompat.DEFAULT_ALL)
      .setAutoCancel(true)
      .setContentIntent(pi)
      .build();
    try {
      NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm != null) nm.notify(noteId++, n);
    } catch (SecurityException ignored) { /* нет разрешения на уведомления */ }
  }

  /* ---------- центр на этом телефоне ---------- */
  static synchronized String startCenter() {
    if (center != null) return null;
    try {
      SgCenter c = new SgCenter(new File(app.getFilesDir(), "center.json"));
      c.listener = online -> refreshForeground();
      c.staleListener = g -> main.post(() -> onStale(g));
      c.start(SgCenter.PORT);
      center = c;
      prefs().edit().putBoolean("center", true).apply();
      ensureService();
      return null;
    } catch (Exception e) {
      return String.valueOf(e.getMessage());
    }
  }

  /** П17: этот центр уступил — игру ведёт центр, поднятый из копии на другом телефоне. */
  static void onStale(long gen) {
    stopCenter();
    note("ЦЕНТР УСТУПИЛ", "Игру уже ведёт другой центр (поднят из копии на другом телефоне). Этот телефон подключится к нему сам.");
    SgLink l = link;
    if (l != null) l.kick(true);
  }

  /** П17: «Поднять центр отсюда» — центр на этом телефоне из копии (или из файла data). null — получилось, иначе причина. */
  static synchronized String takeover(String data) {
    if (center != null) return "центр уже работает на этом телефоне";
    SgLink l = link;
    if (l != null && l.connected() && data == null) return "этот телефон на связи с центром — второй центр поднимать нельзя";
    try {
      Map<String, Object> snap = data != null ? SgJson.obj(data) : replica == null ? null : replica.snapshot();
      if (snap == null || SgJson.s(snap, "epoch") == null) return "на этом телефоне нет копии игры";
      Map<String, Object> d = SgCenter.forTakeover(snap);
      if (l != null && l.gen >= SgJson.l(d, "gen", 0)) d.put("gen", l.gen + 1);
      SgCenter.writeFile(new File(app.getFilesDir(), "center.json"), d);
    } catch (Exception e) { return "копия не читается: " + e.getMessage(); }
    return startCenter();
  }

  /** П17: сохранить текст в «Загрузки» (выгрузка состояния). Возвращает, куда записано. */
  static String saveFile(String name, String text) throws java.io.IOException {
    byte[] b = text.getBytes(java.nio.charset.StandardCharsets.UTF_8);
    if (Build.VERSION.SDK_INT >= 29) {
      android.content.ContentValues cv = new android.content.ContentValues();
      cv.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, name);
      cv.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "application/json");
      cv.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS);
      android.net.Uri uri = app.getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
      if (uri == null) throw new java.io.IOException("нет доступа к «Загрузкам»");
      try (java.io.OutputStream o = app.getContentResolver().openOutputStream(uri)) {
        if (o == null) throw new java.io.IOException("нет доступа к «Загрузкам»");
        o.write(b);
      }
      return "Загрузки/" + name;
    }
    File dir = app.getExternalFilesDir(null);
    if (dir == null) dir = app.getFilesDir();
    File f = new File(dir, name);
    try (java.io.FileOutputStream o = new java.io.FileOutputStream(f)) { o.write(b); }
    return f.getAbsolutePath();
  }

  static synchronized void stopCenter() {
    prefs().edit().putBoolean("center", false).apply();
    if (center != null) center.stop();
    center = null;
    stopIfIdle();
  }

  static List<String> addresses() {
    List<String> wifi = new ArrayList<>(), other = new ArrayList<>();
    try {
      for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
        if (!ni.isUp() || ni.isLoopback()) continue;
        String name = ni.getName();
        for (InetAddress a : Collections.list(ni.getInetAddresses())) {
          if (!(a instanceof Inet4Address) || a.isLoopbackAddress()) continue;
          String ip = a.getHostAddress();
          if (name.startsWith("wlan") || name.startsWith("ap") || name.startsWith("swlan") || name.startsWith("softap")) wifi.add(ip);
          else if (!name.startsWith("rmnet") && !name.startsWith("ccmni") && !name.startsWith("tun")) other.add(ip);
        }
      }
    } catch (Exception ignored) { /* нет сети */ }
    wifi.addAll(other);
    return wifi;
  }

  /* ---------- аварийный режим ---------- */
  static AudioTrack siren;
  static int savedVolume = -1;
  static boolean torchOn, torchRun;
  static String torchId;
  static String alarmKey;

  static void alarmState(Map<String, Object> v) {
    boolean on = v != null && SgJson.b(v, "on");
    String key = on ? SgJson.s(v, "id") + ":" + SgJson.s(v, "at") : null;
    if (on && key.equals(alarmKey)) return;
    if (!on && alarmKey == null) return;
    alarmKey = key;
    if (on) main.post(() -> alarmOn(!v.containsKey("siren") || SgJson.b(v, "siren"), !v.containsKey("vibrate") || SgJson.b(v, "vibrate"),
      !v.containsKey("torch") || SgJson.b(v, "torch"), SgJson.s(v, "title"), SgJson.s(v, "text"), !v.containsKey("full") || SgJson.b(v, "full")));
    else main.post(SgNetService::alarmOff);
  }

  static void alarmOn(boolean snd, boolean vib, boolean torch, String title, String text, boolean full) {
    alarmOff();
    if (snd) startSiren();
    if (vib) {
      Vibrator v = (Vibrator) app.getSystemService(Context.VIBRATOR_SERVICE);
      long[] pat = { 0, 700, 300, 700, 300 };
      if (v != null) {
        if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(pat, 0));
        else v.vibrate(pat, 0);
      }
    }
    if (torch) startTorch();
    Intent i = new Intent(app, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("sg-alarm", true);
    PendingIntent pi = PendingIntent.getActivity(app, 2, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    NotificationCompat.Builder b = new NotificationCompat.Builder(app, CH_ALARM)
      .setSmallIcon(R.drawable.ic_stat_sg)
      .setContentTitle(title == null || title.isEmpty() ? "АВАРИЙНЫЙ РЕЖИМ" : title)
      .setContentText(text == null ? "" : text)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setOngoing(true)
      .setContentIntent(pi);
    if (full) b.setFullScreenIntent(pi, true);
    try {
      NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm != null) nm.notify(ID_ALARM, b.build());
    } catch (SecurityException ignored) { /* нет разрешения */ }
  }

  static void alarmOff() {
    if (siren != null) {
      try { siren.stop(); } catch (IllegalStateException ignored) { /* уже */ }
      siren.release();
      siren = null;
    }
    if (savedVolume >= 0) {
      AudioManager am = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
      try { if (am != null) am.setStreamVolume(AudioManager.STREAM_ALARM, savedVolume, 0); } catch (SecurityException ignored) { /* режим «не беспокоить» */ }
      savedVolume = -1;
    }
    Vibrator v = (Vibrator) app.getSystemService(Context.VIBRATOR_SERVICE);
    if (v != null) v.cancel();
    torchRun = false;
    setTorch(false);
    NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) nm.cancel(ID_ALARM);
  }

  static void startSiren() {
    int rate = 22050;
    int frames = rate * 2;
    short[] pcm = new short[frames];
    double ph = 0;
    for (int k = 0; k < frames; k++) {
      double x = (double) k / frames;               // 0…1 за 2 секунды: вверх и вниз
      double f = 650 + 750 * (x < 0.5 ? x * 2 : (1 - x) * 2);
      ph += 2 * Math.PI * f / rate;
      double s = Math.sin(ph) + 0.3 * Math.sin(3 * ph);
      pcm[k] = (short) (s / 1.3 * 30000);
    }
    AudioManager am = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
    if (am != null) {
      try {
        savedVolume = am.getStreamVolume(AudioManager.STREAM_ALARM);
        am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
      } catch (SecurityException e) { savedVolume = -1; }
    }
    AudioTrack tr = new AudioTrack(
      new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build(),
      new AudioFormat.Builder().setSampleRate(rate).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build(),
      frames * 2, AudioTrack.MODE_STATIC, AudioManager.AUDIO_SESSION_ID_GENERATE);
    tr.write(pcm, 0, frames);
    tr.setLoopPoints(0, frames, -1);
    tr.play();
    siren = tr;
  }

  /** П16: действие «Вспышка» — фонарик мигает count раз (если не идёт авария со своим миганием). */
  static void flash(int count) {
    if (torchRun || app == null) return;
    if (torchId == null) {
      try {
        CameraManager cm = (CameraManager) app.getSystemService(Context.CAMERA_SERVICE);
        if (cm == null) return;
        for (String id : cm.getCameraIdList()) {
          Boolean fl = cm.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
          if (Boolean.TRUE.equals(fl)) { torchId = id; break; }
        }
      } catch (Exception e) { return; }
      if (torchId == null) return;
    }
    final int n = Math.max(1, Math.min(20, count)) * 2;
    for (int k = 0; k < n; k++) {
      final boolean on = k % 2 == 0;
      main.postDelayed(() -> { if (!torchRun) setTorch(on); }, k * 180L);
    }
    main.postDelayed(() -> { if (!torchRun) setTorch(false); }, n * 180L + 50);
  }

  static void startTorch() {
    try {
      CameraManager cm = (CameraManager) app.getSystemService(Context.CAMERA_SERVICE);
      if (cm == null) return;
      for (String id : cm.getCameraIdList()) {
        Boolean fl = cm.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
        if (Boolean.TRUE.equals(fl)) { torchId = id; break; }
      }
    } catch (Exception e) { return; }
    if (torchId == null) return;
    torchRun = true;
    blink();
  }

  static void blink() {
    if (!torchRun) return;
    setTorch(!torchOn);
    main.postDelayed(SgNetService::blink, torchOn ? 250 : 450);
  }

  static void setTorch(boolean on) {
    if (torchId == null) return;
    try {
      CameraManager cm = (CameraManager) app.getSystemService(Context.CAMERA_SERVICE);
      if (cm != null) cm.setTorchMode(torchId, on);
      torchOn = on;
    } catch (Exception ignored) { /* камера занята сканером */ }
  }

  /* ---------- сама служба ---------- */
  static void ensureService() {
    if (instance != null) { refreshForeground(); return; }
    Intent i = new Intent(app, SgNetService.class);
    try {
      if (Build.VERSION.SDK_INT >= 26) app.startForegroundService(i);
      else app.startService(i);
    } catch (Exception ignored) { /* Android не дал запустить из фона */ }
  }

  static synchronized void stopIfIdle() {
    if (link == null && center == null && !SgVoice.active() && !SgPhone.active() && instance != null) instance.stopSelf();
  }

  static Notification fgNotification() {
    Intent i = new Intent(app, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
    PendingIntent pi = PendingIntent.getActivity(app, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    String text;
    if (center != null) text = "Центр сети: " + center.online() + " подключено";
    else if (link == null) text = "Работает";
    else text = linkUp ? "Связь с центром есть" : "Нет связи с центром — переподключение";
    // П9, ответ 13Б: о фоновом голосе в шторке не пишем (игроки не знают, что микрофон слушает)
    return new NotificationCompat.Builder(app, CH_LINK)
      .setSmallIcon(R.drawable.ic_stat_sg)
      .setContentTitle("СИГНАЛЫ")
      .setContentText(text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(pi)
      .build();
  }

  /** Служба на переднем плане. Голос в фоне (П-58) — ещё и тип «микрофон»: Android даёт его, только пока приложение
   *  на экране (иначе SecurityException — тогда без микрофона, голос попросит открыть приложение). */
  static void startFg(Service s) {
    Notification n = fgNotification();
    int t = 0;
    if (Build.VERSION.SDK_INT >= 34) t |= ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE;
    if (SgVoice.background() && Build.VERSION.SDK_INT >= 30) t |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
    try {
      if (Build.VERSION.SDK_INT >= 29 && t != 0) s.startForeground(ID_FG, n, t);
      else s.startForeground(ID_FG, n);
    } catch (RuntimeException e) {
      SgVoice.errText = "микрофон в фоне не разрешён: откройте приложение";
      if (Build.VERSION.SDK_INT >= 34) s.startForeground(ID_FG, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
      else s.startForeground(ID_FG, n);
    }
  }

  /** Режим голоса сменился — перезапросить тип службы (вызывается, пока приложение на экране). */
  static void voiceForeground() {
    main.post(() -> {
      SgNetService s = instance;
      if (s != null) startFg(s);
      else if (SgVoice.active()) ensureService();
    });
  }

  static void refreshForeground() {
    SgNetService s = instance;
    if (s == null || app == null) return;
    try {
      NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm != null) nm.notify(ID_FG, fgNotification());
    } catch (SecurityException ignored) { /* нет разрешения */ }
  }

  PowerManager.WakeLock wake;
  WifiManager.WifiLock wifi;

  @Override public void onCreate() {
    super.onCreate();
    init(this);
    instance = this;
  }

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    startFg(this);
    if (wake == null) {
      PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
      if (pm != null) { wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "signaly:net"); wake.acquire(); }
      WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
      if (wm != null) {
        wifi = wm.createWifiLock(Build.VERSION.SDK_INT >= 29 ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF, "signaly:wifi");
        wifi.acquire();
      }
    }
    // перезапуск после того, как Android выгрузил приложение: поднимаем связь и центр из настроек
    if (intent == null) {
      SharedPreferences p = prefs();
      if (p.getBoolean("center", false) && center == null) startCenter();
      String url = p.getString("url", null);
      if (url != null && link == null) connect(url, p.getString("hello", "{\"t\":\"hello\"}"));
    }
    if (link == null && center == null && !SgVoice.active() && !SgPhone.active()) stopSelf();
    return START_STICKY;
  }

  @Override public void onDestroy() {
    if (replica != null) replica.save();
    if (wake != null && wake.isHeld()) wake.release();
    if (wifi != null && wifi.isHeld()) wifi.release();
    wake = null;
    wifi = null;
    instance = null;
    super.onDestroy();
  }

  @Override public IBinder onBind(Intent intent) { return null; }
}
