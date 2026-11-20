import java.io.File;

import ru.signaly.net.SgLink;
import ru.signaly.net.SgReplica;

/** П17, для net-e2e: «телефон» с копией состояния центра (как служба Android). java ReplicaPhone ws://… файл.
 *  Раз в секунду пишет копию в файл и печатает «UPTO n MSGS m». */
public class ReplicaPhone {
  public static void main(String[] a) throws Exception {
    SgReplica r = new SgReplica(new File(a[1]));
    SgLink link = new SgLink(new SgLink.Listener() {
      public void onText(String t) { }
      public void onStatus(boolean c, String info) { }
    });
    link.replica = r;
    link.start(a[0], "{\"t\":\"hello\",\"role\":\"phone\",\"dev\":\"dRep\",\"acc\":null,\"name\":\"копия\"}");
    while (true) {
      Thread.sleep(1000);
      r.save();
      System.out.println("UPTO " + r.upto() + " MSGS " + r.size() + " GEN " + r.gen());
      System.out.flush();
    }
  }
}
