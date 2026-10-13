import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, dateOrNull, numIn, ok, readBody, str } from "@/lib/http";
import { insertScene, listConcerts, listGroups, listSingers, listVenues } from "@/lib/repo";
import { createInitialState } from "@/lib/placement";
import { DEFAULT_SETTINGS } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const b = await readBody(req);
  const name = str(b.name, 100);
  const date = dateOrNull(b.date);
  const venueId = typeof b.venueId === "number" ? b.venueId : null;
  const w = numIn(b.stageWidth, 2, 80);
  const d = numIn(b.stageDepth, 2, 60);
  if (!name || w === null || d === null) return bad("Navn og scenemål kreves");
  const db = getDb();
  if (venueId !== null && !listVenues(db).some((v) => v.id === venueId)) {
    return bad("Ukjent lokasjon");
  }

  const id = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO concerts (name, date, venue_id, stage_width, stage_depth)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(name, date, venueId, w, d);
    const concertId = Number(info.lastInsertRowid);
    const singers = listSingers(db);
    const active = singers.filter((s) => s.isActive);
    const add = db.prepare(
      "INSERT INTO concert_attendance (concert_id, singer_id, attending) VALUES (?, ?, 1)",
    );
    for (const s of active) add.run(concertId, s.id);
    const state = createInitialState(
      active.map((s) => s.id),
      DEFAULT_SETTINGS,
      { singers, groups: listGroups(db), stageW: w, stageD: d },
    );
    insertScene(db, concertId, "Første sang", state.settings, state.placements, 1);
    return concertId;
  })();
  return ok({ id, concerts: listConcerts(db) }, 201);
}
