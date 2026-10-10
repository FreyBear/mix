import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, numIn, ok, parseId, readBody, str } from "@/lib/http";
import { listGroups, listSingers, scrubSingerFromScenes } from "@/lib/repo";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (!id) return bad("Ugyldig id");
  const b = await readBody(req);
  const fullName = str(b.fullName, 100);
  const nickname = str(b.nickname, 30);
  const height = numIn(b.height, 100, 250);
  const groupId = typeof b.voiceGroupId === "number" ? b.voiceGroupId : null;
  if (!fullName || !nickname || !groupId || height === null) {
    return bad("Navn, kallenavn, stemmegruppe og høyde (100-250 cm) kreves");
  }
  const db = getDb();
  if (!listGroups(db).some((g) => g.id === groupId)) return bad("Ukjent stemmegruppe");
  const info = db
    .prepare(
      `UPDATE singers SET full_name = ?, nickname = ?, voice_group_id = ?, height = ?, is_active = ?
       WHERE id = ?`,
    )
    .run(fullName, nickname, groupId, Math.round(height), b.isActive === false ? 0 : 1, id);
  if (!info.changes) return bad("Fant ikke sangeren", 404);
  return ok({ singers: listSingers(db) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (!id) return bad("Ugyldig id");
  const db = getDb();
  db.transaction(() => {
    scrubSingerFromScenes(db, id);
    db.prepare("DELETE FROM singers WHERE id = ?").run(id);
  })();
  return ok({ singers: listSingers(db) });
}
