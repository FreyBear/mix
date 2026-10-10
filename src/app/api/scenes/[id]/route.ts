import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, ok, parseId, readBody, str } from "@/lib/http";
import { getScene, listScenes, updateScene } from "@/lib/repo";
import { sanitizePlacements, sanitizeSettings } from "@/lib/types";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (!id) return bad("Ugyldig id");
  const b = await readBody(req);
  const db = getDb();
  if (!getScene(db, id)) return bad("Fant ikke sangen", 404);
  const scene = updateScene(db, id, {
    title: b.title !== undefined ? (str(b.title, 100) ?? undefined) : undefined,
    settings: b.settings !== undefined ? sanitizeSettings(b.settings) : undefined,
    placements: b.placements !== undefined ? sanitizePlacements(b.placements) : undefined,
  });
  return ok({ scene });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (!id) return bad("Ugyldig id");
  const db = getDb();
  const scene = getScene(db, id);
  if (!scene) return bad("Fant ikke sangen", 404);
  if (listScenes(db, scene.concertId).length <= 1) {
    return bad("En konsert må ha minst én sang", 409);
  }
  db.prepare("DELETE FROM scenes WHERE id = ?").run(id);
  return ok({ scenes: listScenes(db, scene.concertId) });
}
