package ru.signaly.terminal;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle savedInstanceState) {
    registerPlugin(SgNetPlugin.class);   // СИГНАЛЫ: служба связи (сеть, шторка, авария)
    super.onCreate(savedInstanceState);
    alarmWake(getIntent());
  }

  @Override protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    alarmWake(intent);
  }

  /** Аварийный режим: показать приложение поверх экрана блокировки и включить экран. */
  void alarmWake(Intent i) {
    if (i == null || !i.getBooleanExtra("sg-alarm", false)) return;
    if (Build.VERSION.SDK_INT >= 27) {
      setShowWhenLocked(true);
      setTurnScreenOn(true);
    }
  }
}
