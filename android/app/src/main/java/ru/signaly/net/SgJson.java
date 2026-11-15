package ru.signaly.net;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** СИГНАЛЫ: маленький JSON без внешних библиотек (на Android и в обычной Java одинаково).
 *  Объект → LinkedHashMap, массив → ArrayList, число → Long или Double. */
public final class SgJson {
  private final String s;
  private int i;

  private SgJson(String s) { this.s = s; }

  public static Object parse(String text) {
    SgJson p = new SgJson(text);
    p.ws();
    Object v = p.value();
    p.ws();
    if (p.i != p.s.length()) throw new IllegalArgumentException("JSON: лишнее в позиции " + p.i);
    return v;
  }

  @SuppressWarnings("unchecked")
  public static Map<String, Object> obj(String text) {
    Object o = parse(text);
    if (!(o instanceof Map)) throw new IllegalArgumentException("JSON: ждали объект");
    return (Map<String, Object>) o;
  }

  private void ws() {
    while (i < s.length()) {
      char c = s.charAt(i);
      if (c == ' ' || c == '\n' || c == '\r' || c == '\t') i++;
      else break;
    }
  }

  private Object value() {
    if (i >= s.length()) throw new IllegalArgumentException("JSON: конец текста");
    char c = s.charAt(i);
    if (c == '{') return object();
    if (c == '[') return array();
    if (c == '"') return string();
    if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
    if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
    if (s.startsWith("null", i)) { i += 4; return null; }
    return number();
  }

  private Map<String, Object> object() {
    Map<String, Object> m = new LinkedHashMap<>();
    i++;
    ws();
    if (s.charAt(i) == '}') { i++; return m; }
    while (true) {
      ws();
      String k = string();
      ws();
      if (s.charAt(i) != ':') throw new IllegalArgumentException("JSON: ждали ':' в " + i);
      i++;
      ws();
      m.put(k, value());
      ws();
      char c = s.charAt(i++);
      if (c == '}') return m;
      if (c != ',') throw new IllegalArgumentException("JSON: ждали ',' в " + (i - 1));
    }
  }

  private List<Object> array() {
    List<Object> a = new ArrayList<>();
    i++;
    ws();
    if (s.charAt(i) == ']') { i++; return a; }
    while (true) {
      ws();
      a.add(value());
      ws();
      char c = s.charAt(i++);
      if (c == ']') return a;
      if (c != ',') throw new IllegalArgumentException("JSON: ждали ',' в " + (i - 1));
    }
  }

  private String string() {
    if (s.charAt(i) != '"') throw new IllegalArgumentException("JSON: ждали строку в " + i);
    i++;
    StringBuilder b = new StringBuilder();
    while (true) {
      char c = s.charAt(i++);
      if (c == '"') return b.toString();
      if (c != '\\') { b.append(c); continue; }
      char e = s.charAt(i++);
      switch (e) {
        case 'n': b.append('\n'); break;
        case 'r': b.append('\r'); break;
        case 't': b.append('\t'); break;
        case 'b': b.append('\b'); break;
        case 'f': b.append('\f'); break;
        case 'u': b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break;
        default: b.append(e);
      }
    }
  }

  private Object number() {
    int st = i;
    boolean real = false;
    while (i < s.length()) {
      char c = s.charAt(i);
      if ((c >= '0' && c <= '9') || c == '-' || c == '+') i++;
      else if (c == '.' || c == 'e' || c == 'E') { real = true; i++; }
      else break;
    }
    String t = s.substring(st, i);
    if (t.isEmpty()) throw new IllegalArgumentException("JSON: непонятный символ в " + st);
    if (!real) {
      try { return Long.parseLong(t); } catch (NumberFormatException ignored) { /* большое число */ }
    }
    return Double.parseDouble(t);
  }

  /* ---------- запись ---------- */
  public static String str(Object v) {
    StringBuilder b = new StringBuilder();
    write(b, v);
    return b.toString();
  }

  @SuppressWarnings("unchecked")
  private static void write(StringBuilder b, Object v) {
    if (v == null) b.append("null");
    else if (v instanceof String) quote(b, (String) v);
    else if (v instanceof Boolean) b.append(v.toString());
    else if (v instanceof Double || v instanceof Float) {
      double d = ((Number) v).doubleValue();
      if (Double.isNaN(d) || Double.isInfinite(d)) b.append("null");
      else if (d == Math.rint(d) && Math.abs(d) < 9e15) b.append((long) d);
      else b.append(d);
    } else if (v instanceof Number) b.append(((Number) v).longValue());
    else if (v instanceof Map) {
      b.append('{');
      boolean first = true;
      for (Map.Entry<String, Object> e : ((Map<String, Object>) v).entrySet()) {
        if (!first) b.append(',');
        first = false;
        quote(b, e.getKey());
        b.append(':');
        write(b, e.getValue());
      }
      b.append('}');
    } else if (v instanceof List) {
      b.append('[');
      boolean first = true;
      for (Object o : (List<Object>) v) {
        if (!first) b.append(',');
        first = false;
        write(b, o);
      }
      b.append(']');
    } else quote(b, v.toString());
  }

  private static void quote(StringBuilder b, String s) {
    b.append('"');
    for (int k = 0; k < s.length(); k++) {
      char c = s.charAt(k);
      switch (c) {
        case '"': b.append("\\\""); break;
        case '\\': b.append("\\\\"); break;
        case '\n': b.append("\\n"); break;
        case '\r': b.append("\\r"); break;
        case '\t': b.append("\\t"); break;
        default:
          if (c < 0x20 || c == 0x2028 || c == 0x2029) b.append(String.format("\\u%04x", (int) c));
          else b.append(c);
      }
    }
    b.append('"');
  }

  /* ---------- удобства ---------- */
  public static Map<String, Object> map(Object... kv) {
    Map<String, Object> m = new LinkedHashMap<>();
    for (int k = 0; k + 1 < kv.length; k += 2) m.put((String) kv[k], kv[k + 1]);
    return m;
  }

  public static String s(Map<String, Object> m, String k) {
    Object v = m == null ? null : m.get(k);
    return v == null ? null : v.toString();
  }

  public static long l(Map<String, Object> m, String k, long def) {
    Object v = m == null ? null : m.get(k);
    if (v instanceof Number) return ((Number) v).longValue();
    if (v instanceof String) try { return Long.parseLong((String) v); } catch (NumberFormatException e) { return def; }
    return def;
  }

  public static boolean b(Map<String, Object> m, String k) {
    Object v = m == null ? null : m.get(k);
    return v instanceof Boolean ? (Boolean) v : v != null && !"".equals(v) && !Long.valueOf(0).equals(v);
  }

  @SuppressWarnings("unchecked")
  public static Map<String, Object> m(Object v) { return v instanceof Map ? (Map<String, Object>) v : null; }

  @SuppressWarnings("unchecked")
  public static List<Object> a(Object v) { return v instanceof List ? (List<Object>) v : new ArrayList<>(); }

  /** Глубокая копия (для шаблонов правил). */
  @SuppressWarnings("unchecked")
  public static Object copy(Object v) {
    if (v instanceof Map) {
      Map<String, Object> m = new LinkedHashMap<>();
      for (Map.Entry<String, Object> e : ((Map<String, Object>) v).entrySet()) m.put(e.getKey(), copy(e.getValue()));
      return m;
    }
    if (v instanceof List) {
      List<Object> a = new ArrayList<>();
      for (Object o : (List<Object>) v) a.add(copy(o));
      return a;
    }
    return v;
  }
}
