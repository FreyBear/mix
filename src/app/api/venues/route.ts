import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, numIn, ok, readBody, str } from "@/lib/http";
import { listVenues } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const b = await readBody(req);
  const name = str(b.name, 100);
  const w = numIn(b.widthM, 2, 80);
  const d = numIn(b.depthM, 2, 60);
  if (!name || w === null || d === null) return bad("Navn, bredde (2-80 m) og dybde (2-60 m) kreves");
  const db = getDb();
  db.prepare("INSERT INTO venues (name, width_m, depth_m) VALUES (?, ?, ?)").run(name, w, d);
  return ok({ venues: listVenues(db) }, 201);
}
