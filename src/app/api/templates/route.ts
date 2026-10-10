import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, ok, readBody, str } from "@/lib/http";
import { getScene, listTemplates, stamp } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** Lagre en sangs oppstilling som gjenbrukbar mal. Body: { name, sceneId } */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const b = await readBody(req);
  const name = str(b.name, 100);
  const sceneId = typeof b.sceneId === "number" ? b.sceneId : null;
  if (!name || !sceneId) return bad("Navn og sang kreves");
  const db = getDb();
  const scene = getScene(db, sceneId);
  if (!scene) return bad("Fant ikke sangen", 404);
  db.prepare(
    "INSERT INTO templates (name, settings, placements, created_at) VALUES (?, ?, ?, ?)",
  ).run(name, JSON.stringify(scene.settings), JSON.stringify(scene.placements), stamp());
  return ok({ templates: listTemplates(db) }, 201);
}
