import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, hexColor, ok, parseId, readBody, str } from "@/lib/http";
import { listGroups, scrubGroupFromScenes } from "@/lib/repo";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (!id) return bad("Ugyldig id");
  const b = await readBody(req);
  const name = str(b.name, 60);
  const abbr = str(b.abbr, 8);
  const color = hexColor(b.color);
  if (!name || !abbr || !color) return bad("Navn, forkortelse og gyldig farge (#rrggbb) kreves");
  const db = getDb();
  const info = db
    .prepare("UPDATE voice_groups SET name = ?, abbr = ?, color = ? WHERE id = ?")
    .run(name, abbr, color, id);
  if (!info.changes) return bad("Fant ikke stemmegruppen", 404);
  return ok({ groups: listGroups(db) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (!id) return bad("Ugyldig id");
  const db = getDb();
  if (listGroups(db).length <= 1) {
    return bad("Koret må ha minst én stemmegruppe", 409);
  }
  const used = db.prepare("SELECT COUNT(*) AS n FROM singers WHERE voice_group_id = ?").get(id) as {
    n: number;
  };
  if (used.n > 0) {
    return bad(
      `Stemmegruppen har ${used.n} sanger(e). Flytt dem til en annen gruppe før du sletter.`,
      409,
    );
  }
  db.transaction(() => {
    scrubGroupFromScenes(db, id);
    db.prepare("DELETE FROM voice_groups WHERE id = ?").run(id);
  })();
  return ok({ groups: listGroups(db) });
}
