import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, ok, parseId, readBody, str } from "@/lib/http";
import {
  attendingIds,
  getConcert,
  getScene,
  insertScene,
  listScenes,
  placementCtx,
} from "@/lib/repo";
import { createInitialState, reconcile } from "@/lib/placement";
import { DEFAULT_SETTINGS } from "@/lib/types";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Ny sang. Kopierer forrige sang som standard (copy: false gir ny auto-sortert oppstilling). */
export async function POST(req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (!id) return bad("Ugyldig id");
  const db = getDb();
  const concert = getConcert(db, id);
  if (!concert) return bad("Fant ikke konserten", 404);
  const b = await readBody(req);
  const title = str(b.title, 100) ?? "Ny sang";
  const ctx = placementCtx(db, concert.stageWidth, concert.stageDepth);
  const attending = new Set(attendingIds(db, id));
  const scenes = listScenes(db, id);
  const prev = scenes[scenes.length - 1];

  let state;
  if (b.copy !== false && prev) {
    state = reconcile({ placements: prev.placements, settings: prev.settings }, attending, ctx);
  } else {
    state = createInitialState([...attending], DEFAULT_SETTINGS, ctx);
  }
  const sceneId = insertScene(db, id, title, state.settings, state.placements);
  return ok({ sceneId, scene: getScene(db, sceneId), scenes: listScenes(db, id) }, 201);
}

/** Endrer rekkefølgen på sangene. Body: { order: number[] } */
export async function PUT(req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (!id) return bad("Ugyldig id");
  const db = getDb();
  const b = await readBody(req);
  const order = Array.isArray(b.order) ? b.order.filter((x): x is number => Number.isInteger(x)) : [];
  const existing = new Set(listScenes(db, id).map((s) => s.id));
  const upd = db.prepare("UPDATE scenes SET position = ? WHERE id = ? AND concert_id = ?");
  db.transaction(() => {
    order.filter((x) => existing.has(x)).forEach((sid, i) => upd.run(i + 1, sid, id));
  })();
  return ok({ scenes: listScenes(db, id) });
}
