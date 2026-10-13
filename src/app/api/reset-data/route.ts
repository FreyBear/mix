import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok } from "@/lib/http";
import { listConcerts, listGroups, listSingers } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM concert_attendance").run();
    db.prepare("DELETE FROM scenes").run();
    db.prepare("DELETE FROM concerts").run();
    db.prepare("DELETE FROM singers").run();
  })();
  return ok({
    ok: true,
    message: "Demodata er slettet (alle sangere, konserter og scener). Appen er nå klar for ditt eget kor!",
    singers: listSingers(db),
    concerts: listConcerts(db),
    groups: listGroups(db),
  });
}
