import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, numIn, ok, parseId, readBody, str } from "@/lib/http";
import { listVenues } from "@/lib/repo";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (!id) return bad("Ugyldig id");
  const b = await readBody(req);
  const name = str(b.name, 100);
  const w = numIn(b.widthM, 2, 80);
  const d = numIn(b.depthM, 2, 60);
  if (!name || w === null || d === null) return bad("Navn, bredde (2-80 m) og dybde (2-60 m) kreves");
  const db = getDb();
  const info = db
    .prepare("UPDATE venues SET name = ?, width_m = ?, depth_m = ? WHERE id = ?")
    .run(name, w, d, id);
  if (!info.changes) return bad("Fant ikke lokasjonen", 404);
  return ok({ venues: listVenues(db) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (!id) return bad("Ugyldig id");
  const db = getDb();
  db.prepare("DELETE FROM venues WHERE id = ?").run(id);
  return ok({ venues: listVenues(db) });
}
