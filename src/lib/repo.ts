import type Database from "better-sqlite3";
import {
  sanitizePlacements,
  sanitizeSettings,
  type Concert,
  type Placement,
  type PlacementPreset,
  type Scene,
  type SceneSettings,
  type Singer,
  type Template,
  type Venue,
  type VoiceGroup,
} from "./types";
import { getBuiltInPresets, reconcile, type PlacementCtx } from "./placement";

type Db = Database.Database;

interface GroupRow {
  id: number;
  name: string;
  abbr: string;
  color: string;
  sort_order: number;
}
interface SingerRow {
  id: number;
  full_name: string;
  nickname: string;
  voice_group_id: number;
  height: number;
  is_active: number;
}
interface VenueRow {
  id: number;
  name: string;
  width_m: number;
  depth_m: number;
}
interface ConcertRow {
  id: number;
  name: string;
  date: string | null;
  venue_id: number | null;
  stage_width: number;
  stage_depth: number;
}
interface SceneRow {
  id: number;
  concert_id: number;
  position: number;
  title: string;
  settings: string;
  placements: string;
  updated_at: string;
}
interface TemplateRow {
  id: number;
  name: string;
  settings: string;
  placements: string;
  created_at: string;
}

export const toGroup = (r: GroupRow): VoiceGroup => ({
  id: r.id,
  name: r.name,
  abbr: r.abbr,
  color: r.color,
  sortOrder: r.sort_order,
});
export const toSinger = (r: SingerRow): Singer => ({
  id: r.id,
  fullName: r.full_name,
  nickname: r.nickname,
  voiceGroupId: r.voice_group_id,
  height: r.height,
  isActive: !!r.is_active,
});
export const toVenue = (r: VenueRow): Venue => ({
  id: r.id,
  name: r.name,
  widthM: r.width_m,
  depthM: r.depth_m,
});
export const toConcert = (r: ConcertRow): Concert => ({
  id: r.id,
  name: r.name,
  date: r.date,
  venueId: r.venue_id,
  stageWidth: r.stage_width,
  stageDepth: r.stage_depth,
});
const parseJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};
export const toScene = (r: SceneRow): Scene => ({
  id: r.id,
  concertId: r.concert_id,
  position: r.position,
  title: r.title,
  settings: sanitizeSettings(parseJson(r.settings)),
  placements: sanitizePlacements(parseJson(r.placements)),
  updatedAt: r.updated_at,
});
export const toTemplate = (r: TemplateRow): Template => ({
  id: r.id,
  name: r.name,
  settings: sanitizeSettings(parseJson(r.settings)),
  placements: sanitizePlacements(parseJson(r.placements)),
  createdAt: r.created_at,
});

export function listGroups(db: Db): VoiceGroup[] {
  return (db.prepare("SELECT * FROM voice_groups ORDER BY sort_order, id").all() as GroupRow[]).map(
    toGroup,
  );
}
export function listSingers(db: Db): Singer[] {
  return (
    db.prepare("SELECT * FROM singers ORDER BY full_name COLLATE NOCASE").all() as SingerRow[]
  ).map(toSinger);
}
export function listVenues(db: Db): Venue[] {
  return (db.prepare("SELECT * FROM venues ORDER BY name COLLATE NOCASE").all() as VenueRow[]).map(
    toVenue,
  );
}
export function listConcerts(db: Db): Concert[] {
  return (
    db
      .prepare("SELECT * FROM concerts ORDER BY COALESCE(date, '9999') DESC, id DESC")
      .all() as ConcertRow[]
  ).map(toConcert);
}
export function listTemplates(db: Db): Template[] {
  return (db.prepare("SELECT * FROM templates ORDER BY id DESC").all() as TemplateRow[]).map(
    toTemplate,
  );
}
export function getConcert(db: Db, id: number): Concert | null {
  const r = db.prepare("SELECT * FROM concerts WHERE id = ?").get(id) as ConcertRow | undefined;
  return r ? toConcert(r) : null;
}
export function listScenes(db: Db, concertId: number): Scene[] {
  return (
    db
      .prepare("SELECT * FROM scenes WHERE concert_id = ? ORDER BY position, id")
      .all(concertId) as SceneRow[]
  ).map(toScene);
}
export function getScene(db: Db, id: number): Scene | null {
  const r = db.prepare("SELECT * FROM scenes WHERE id = ?").get(id) as SceneRow | undefined;
  return r ? toScene(r) : null;
}
export function attendingIds(db: Db, concertId: number): number[] {
  return (
    db
      .prepare(
        `SELECT singer_id FROM concert_attendance WHERE concert_id = ? AND attending = 1
         ORDER BY singer_id`,
      )
      .all(concertId) as { singer_id: number }[]
  ).map((r) => r.singer_id);
}

let lastStamp = 0;
/** Strengt økende tidsstempel (ISO) slik at endringer alltid kan sammenlignes. */
export function stamp(): string {
  const now = Date.now();
  lastStamp = now > lastStamp ? now : lastStamp + 1;
  return new Date(lastStamp).toISOString();
}

export function insertScene(
  db: Db,
  concertId: number,
  title: string,
  settings: SceneSettings,
  placements: Placement[],
  position?: number,
): number {
  const pos =
    position ??
    ((
      db
        .prepare("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM scenes WHERE concert_id = ?")
        .get(concertId) as { p: number }
    ).p);
  const info = db
    .prepare(
      `INSERT INTO scenes (concert_id, position, title, settings, placements, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(concertId, pos, title, JSON.stringify(settings), JSON.stringify(placements), stamp());
  return Number(info.lastInsertRowid);
}

export function updateScene(
  db: Db,
  id: number,
  patch: { title?: string; settings?: SceneSettings; placements?: Placement[] },
) {
  const cur = getScene(db, id);
  if (!cur) return null;
  db.prepare(
    "UPDATE scenes SET title = ?, settings = ?, placements = ?, updated_at = ? WHERE id = ?",
  ).run(
    patch.title ?? cur.title,
    JSON.stringify(patch.settings ?? cur.settings),
    JSON.stringify(patch.placements ?? cur.placements),
    stamp(),
    id,
  );
  return getScene(db, id);
}

export function placementCtx(db: Db, stageW: number, stageD: number): PlacementCtx {
  return { singers: listSingers(db), groups: listGroups(db), stageW, stageD };
}

/** Oppdaterer alle scener i en konsert etter endring i oppmøte. */
export function reconcileConcertScenes(db: Db, concertId: number) {
  const concert = getConcert(db, concertId);
  if (!concert) return;
  const ctx = placementCtx(db, concert.stageWidth, concert.stageDepth);
  const attending = new Set(attendingIds(db, concertId));
  for (const scene of listScenes(db, concertId)) {
    const next = reconcile({ placements: scene.placements, settings: scene.settings }, attending, ctx);
    updateScene(db, scene.id, { settings: next.settings, placements: next.placements });
  }
}

/** Fjerner en sanger fra alle sceners plasseringer (ved sletting). */
export function scrubSingerFromScenes(db: Db, singerId: number) {
  const rows = db.prepare("SELECT id FROM scenes").all() as { id: number }[];
  for (const { id } of rows) {
    const scene = getScene(db, id);
    if (!scene) continue;
    if (scene.placements.some((p) => p.singerId === singerId)) {
      updateScene(db, id, { placements: scene.placements.filter((p) => p.singerId !== singerId) });
    }
  }
}

/** Nuller ut midlertidig gruppe i scener når en stemmegruppe slettes. */
export function scrubGroupFromScenes(db: Db, groupId: number) {
  const rows = db.prepare("SELECT id FROM scenes").all() as { id: number }[];
  for (const { id } of rows) {
    const scene = getScene(db, id);
    if (!scene) continue;
    if (scene.placements.some((p) => p.overrideGroupId === groupId)) {
      updateScene(db, id, {
        placements: scene.placements.map((p) =>
          p.overrideGroupId === groupId ? { ...p, overrideGroupId: null } : p,
        ),
      });
    }
  }
}

export function listCustomPresets(db: Db): PlacementPreset[] {
  const row = db.prepare("SELECT value FROM app_config WHERE key = 'placement_presets'").get() as
    | { value: string }
    | undefined;
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomPreset(
  db: Db,
  preset: Omit<PlacementPreset, "builtIn">,
): PlacementPreset {
  const custom = listCustomPresets(db);
  const clean: PlacementPreset = {
    id: preset.id || `custom-${Date.now()}`,
    name: preset.name.trim(),
    type: preset.type || "blocks",
    groupOrder: preset.groupOrder || [],
    builtIn: false,
  };
  const idx = custom.findIndex((p) => p.id === clean.id);
  if (idx >= 0) {
    custom[idx] = clean;
  } else {
    custom.push(clean);
  }
  db.prepare(
    "INSERT INTO app_config (key, value) VALUES ('placement_presets', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(JSON.stringify(custom));
  return clean;
}

export function deleteCustomPreset(db: Db, id: string): void {
  const custom = listCustomPresets(db).filter((p) => p.id !== id);
  db.prepare(
    "INSERT INTO app_config (key, value) VALUES ('placement_presets', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(JSON.stringify(custom));
}

export function listAllPresets(db: Db): PlacementPreset[] {
  const groups = listGroups(db);
  const builtIn = getBuiltInPresets(groups);
  const custom = listCustomPresets(db);
  return [...builtIn, ...custom];
}

