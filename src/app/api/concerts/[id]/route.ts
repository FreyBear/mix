import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, dateOrNull, numIn, ok, parseId, readBody, str } from "@/lib/http";
import { attendingIds, getConcert, listConcerts, listScenes } from "@/lib/repo";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const id = parseId((await params).id);
  if (!id) return bad("Ugyldig id");
  const db = getDb();
  const concert = getConcert(db, id);
  if (!concert) return bad("Fant ikke konserten", 404);
  return ok({
    concert,
    attendingIds: attendingIds(db, id),
    scenes: listScenes(db, id),
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (!id) return bad("Ugyldig id");
  const b = await readBody(req);
  const name = str(b.name, 100);
  const date = dateOrNull(b.date);
  const venueId = typeof b.venueId === "number" ? b.venueId : null;
  const w = numIn(b.stageWidth, 2, 80);
  const d = numIn(b.stageDepth, 2, 60);
  if (!name || w === null || d === null) return bad("Navn og scenemål kreves");
  const db = getDb();
  const info = db
    .prepare(
      `UPDATE concerts SET name = ?, date = ?, venue_id = ?, stage_width = ?, stage_depth = ?
       WHERE id = ?`,
    )
    .run(name, date, venueId, w, d, id);
  if (!info.changes) return bad("Fant ikke konserten", 404);
  return ok({ concerts: listConcerts(db) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (!id) return bad("Ugyldig id");
  const db = getDb();
  db.prepare("DELETE FROM concerts WHERE id = ?").run(id);
  return ok({ concerts: listConcerts(db) });
}
