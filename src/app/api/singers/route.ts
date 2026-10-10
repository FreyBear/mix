import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, numIn, ok, readBody, str } from "@/lib/http";
import { listGroups, listSingers } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const b = await readBody(req);
  const fullName = str(b.fullName, 100);
  const nickname = str(b.nickname, 30) ?? (fullName ? fullName.split(/\s+/)[0] : null);
  const height = numIn(b.height, 100, 250) ?? 170;
  const groupId = typeof b.voiceGroupId === "number" ? b.voiceGroupId : null;
  if (!fullName || !nickname || !groupId) return bad("Navn og stemmegruppe kreves");
  const db = getDb();
  if (!listGroups(db).some((g) => g.id === groupId)) return bad("Ukjent stemmegruppe");
  db.prepare(
    `INSERT INTO singers (full_name, nickname, voice_group_id, height, is_active)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(fullName, nickname, groupId, Math.round(height), b.isActive === false ? 0 : 1);
  return ok({ singers: listSingers(db) }, 201);
}
