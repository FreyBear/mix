import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, hexColor, ok, readBody, str } from "@/lib/http";
import { listGroups } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const b = await readBody(req);
  const name = str(b.name, 60);
  const abbr = str(b.abbr, 8);
  const color = hexColor(b.color);
  if (!name || !abbr || !color) return bad("Navn, forkortelse og gyldig farge (#rrggbb) kreves");
  const db = getDb();
  const next = (
    db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM voice_groups").get() as {
      n: number;
    }
  ).n;
  db.prepare("INSERT INTO voice_groups (name, abbr, color, sort_order) VALUES (?, ?, ?, ?)").run(
    name,
    abbr,
    color,
    next,
  );
  return ok({ groups: listGroups(db) }, 201);
}
