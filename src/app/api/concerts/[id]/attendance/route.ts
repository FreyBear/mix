import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, ok, parseId, readBody } from "@/lib/http";
import { attendingIds, getConcert, listScenes, listSingers, reconcileConcertScenes } from "@/lib/repo";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Setter oppmøte. Body: { attendingIds: number[] } eller { singerId, attending }. */
export async function PUT(req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (!id) return bad("Ugyldig id");
  const db = getDb();
  if (!getConcert(db, id)) return bad("Fant ikke konserten", 404);
  const b = await readBody(req);
  const singers = listSingers(db);
  const valid = new Set(singers.map((s) => s.id));

  db.transaction(() => {
    if (Array.isArray(b.attendingIds)) {
      const want = new Set(b.attendingIds.filter((x): x is number => valid.has(x as number)));
      db.prepare("DELETE FROM concert_attendance WHERE concert_id = ?").run(id);
      const ins = db.prepare(
        "INSERT INTO concert_attendance (concert_id, singer_id, attending) VALUES (?, ?, ?)",
      );
      for (const s of singers) ins.run(id, s.id, want.has(s.id) ? 1 : 0);
    } else if (typeof b.singerId === "number" && valid.has(b.singerId)) {
      db.prepare(
        `INSERT INTO concert_attendance (concert_id, singer_id, attending) VALUES (?, ?, ?)
         ON CONFLICT(concert_id, singer_id) DO UPDATE SET attending = excluded.attending`,
      ).run(id, b.singerId, b.attending === false ? 0 : 1);
    }
    reconcileConcertScenes(db, id);
  })();

  return ok({ attendingIds: attendingIds(db, id), scenes: listScenes(db, id) });
}
