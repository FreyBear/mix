import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, ok, readBody } from "@/lib/http";
import { listGroups } from "@/lib/repo";
import { VOICE_PROFILES } from "@/lib/profiles";

export const dynamic = "force-dynamic";

/** Legger til stemmegruppene fra en standardprofil (eller endrer rekkefølge). */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const b = await readBody(req);
  const db = getDb();

  if (Array.isArray(b.order)) {
    const ids = b.order.filter((x): x is number => Number.isInteger(x));
    const upd = db.prepare("UPDATE voice_groups SET sort_order = ? WHERE id = ?");
    db.transaction(() => ids.forEach((id, i) => upd.run(i, id)))();
    return ok({ groups: listGroups(db) });
  }

  const profile = typeof b.profile === "string" ? VOICE_PROFILES[b.profile] : undefined;
  if (!profile) return bad("Ukjent profil");
  const existing = new Set(listGroups(db).map((g) => g.abbr.toLowerCase()));
  const add = db.prepare(
    "INSERT INTO voice_groups (name, abbr, color, sort_order) VALUES (?, ?, ?, ?)",
  );
  db.transaction(() => {
    let n = (
      db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM voice_groups").get() as {
        n: number;
      }
    ).n;
    for (const g of profile.groups) {
      if (existing.has(g.abbr.toLowerCase())) continue;
      add.run(g.name, g.abbr, g.color, n++);
    }
    // Profilens grupper først, i profilens rekkefølge; øvrige grupper beholder rekkefølgen etter dem.
    const all = listGroups(db);
    const rank = new Map(profile.groups.map((g, i) => [g.abbr.toLowerCase(), i]));
    const sorted = [...all].sort((a, c) => {
      const ra = rank.get(a.abbr.toLowerCase()) ?? Infinity;
      const rc = rank.get(c.abbr.toLowerCase()) ?? Infinity;
      if (ra !== rc) return ra - rc;
      return a.sortOrder - c.sortOrder || a.id - c.id;
    });
    const upd = db.prepare("UPDATE voice_groups SET sort_order = ? WHERE id = ?");
    sorted.forEach((g, i) => upd.run(i, g.id));
  })();
  return ok({ groups: listGroups(db) });
}
