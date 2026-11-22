package ru.signaly.net;

/** П26: base64 без android.util и java.util.Base64 (Android 7 и проверки на обычной Java). */
public final class SgB64 {
  static final char[] A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".toCharArray();
  private SgB64() { }
  public static String enc(byte[] b, int n) {
    StringBuilder s = new StringBuilder((n + 2) / 3 * 4);
    for (int i = 0; i < n; i += 3) {
      int x = (b[i] & 0xff) << 16 | (i + 1 < n ? (b[i + 1] & 0xff) << 8 : 0) | (i + 2 < n ? b[i + 2] & 0xff : 0);
      s.append(A[x >> 18 & 63]).append(A[x >> 12 & 63]).append(i + 1 < n ? A[x >> 6 & 63] : '=').append(i + 2 < n ? A[x & 63] : '=');
    }
    return s.toString();
  }
}
