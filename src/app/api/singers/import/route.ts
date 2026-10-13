import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, ok, readBody } from "@/lib/http";
import { listGroups, listSingers } from "@/lib/repo";
import { parseSingerImport } from "@/lib/singer-import";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const b = await readBody(req);
  const text = typeof b.text === "string" ? b.text : "";
  const replaceExisting = b.replaceExisting === true;
  if (!text.trim()) return bad("Ingen tekst å importere");
  if (text.length > 500_000) return bad("Filen er for stor");
  const db = getDb();
  const parsed = parseSingerImport(text, listGroups(db));
  const add = db.prepare(
    `INSERT INTO singers (full_name, nickname, voice_group_id, height, is_active)
     VALUES (?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    if (replaceExisting) {
      db.prepare("DELETE FROM concert_attendance").run();
      db.prepare("DELETE FROM singers").run();
    }
    for (const r of parsed.rows) {
      add.run(r.fullName, r.nickname, r.voiceGroupId, r.height, r.isActive ? 1 : 0);
    }
  })();
  return ok({
    added: parsed.rows.length,
    skipped: parsed.skipped,
    singers: listSingers(db),
  });
}
