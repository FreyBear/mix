import type Database from "better-sqlite3";
import {
  sanitizePlacements,
  sanitizeSettings,
  type Concert,
  type Scene,
  type Singer,
  type Template,
  type Venue,
  type VoiceGroup,
} from "./types";
import {
  listConcerts,
  listGroups,
  listScenes,
  listSingers,
  listTemplates,
  listVenues,
} from "./repo";

type Db = Database.Database;

export interface BackupFile {
  app: "mixup";
  version: 1;
  exportedAt: string;
  voiceGroups: VoiceGroup[];
  singers: Singer[];
  venues: Venue[];
  concerts: Concert[];
  attendance: { concertId: number; singerId: number; attending: boolean }[];
  scenes: Scene[];
  templates: Template[];
}

export function createBackup(db: Db): BackupFile {
  const concerts = listConcerts(db);
  const attendance = (
    db.prepare("SELECT concert_id, singer_id, attending FROM concert_attendance").all() as {
      concert_id: number;
      singer_id: number;
      attending: number;
    }[]
  ).map((r) => ({ concertId: r.concert_id, singerId: r.singer_id, attending: !!r.attending }));
  return {
    app: "mixup",
    version: 1,
    exportedAt: new Date().toISOString(),
    voiceGroups: listGroups(db),
    singers: listSingers(db),
    venues: listVenues(db),
    concerts,
    attendance,
    scenes: concerts.flatMap((c) => listScenes(db, c.id)),
    templates: listTemplates(db),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";
const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter(isObj) : [];
const s = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const n = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/** Erstatter all data med innholdet i en sikkerhetskopi. Kaster feil hvis filen er ugyldig. */
export function restoreBackup(db: Db, raw: unknown) {
  if (!isObj(raw) || raw.app !== "mixup") throw new Error("Filen er ikke en Mixup-sikkerhetskopi");
  const groups = arr(raw.voiceGroups);
  const singers = arr(raw.singers);
  const venues = arr(raw.venues);
  const concerts = arr(raw.concerts);
  const attendance = arr(raw.attendance);
  const scenes = arr(raw.scenes);
  const templates = arr(raw.templates);
  if (groups.length === 0) throw new Error("Sikkerhetskopien mangler stemmegrupper");

  db.transaction(() => {
    for (const t of [
      "scenes",
      "concert_attendance",
      "concerts",
      "templates",
      "singers",
      "venues",
      "voice_groups",
    ]) {
      db.exec(`DELETE FROM ${t}`);
    }
    db.exec("DELETE FROM sqlite_sequence");

    const insG = db.prepare(
      "INSERT INTO voice_groups (id, name, abbr, color, sort_order) VALUES (?, ?, ?, ?, ?)",
    );
    for (const g of groups) {
      insG.run(n(g.id, 0), s(g.name), s(g.abbr), s(g.color, "#888888"), n(g.sortOrder, 0));
    }
    const insS = db.prepare(
      `INSERT INTO singers (id, full_name, nickname, voice_group_id, height, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const x of singers) {
      insS.run(
        n(x.id, 0),
        s(x.fullName),
        s(x.nickname, s(x.fullName)),
        n(x.voiceGroupId, 0),
        n(x.height, 170),
        x.isActive === false ? 0 : 1,
      );
    }
    const insV = db.prepare("INSERT INTO venues (id, name, width_m, depth_m) VALUES (?, ?, ?, ?)");
    for (const v of venues) insV.run(n(v.id, 0), s(v.name), n(v.widthM, 10), n(v.depthM, 6));

    const insC = db.prepare(
      `INSERT INTO concerts (id, name, date, venue_id, stage_width, stage_depth)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const c of concerts) {
      insC.run(
        n(c.id, 0),
        s(c.name),
        typeof c.date === "string" ? c.date : null,
        typeof c.venueId === "number" ? c.venueId : null,
        n(c.stageWidth, 10),
        n(c.stageDepth, 6),
      );
    }
    const insA = db.prepare(
      "INSERT OR REPLACE INTO concert_attendance (concert_id, singer_id, attending) VALUES (?, ?, ?)",
    );
    for (const a of attendance) {
      insA.run(n(a.concertId, 0), n(a.singerId, 0), a.attending === false ? 0 : 1);
    }
    const insSc = db.prepare(
      `INSERT INTO scenes (id, concert_id, position, title, settings, placements, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const sc of scenes) {
      insSc.run(
        n(sc.id, 0),
        n(sc.concertId, 0),
        n(sc.position, 0),
        s(sc.title, "Sang"),
        JSON.stringify(sanitizeSettings(sc.settings)),
        JSON.stringify(sanitizePlacements(sc.placements)),
        s(sc.updatedAt, new Date().toISOString()),
      );
    }
    const insT = db.prepare(
      "INSERT INTO templates (id, name, settings, placements, created_at) VALUES (?, ?, ?, ?, ?)",
    );
    for (const t of templates) {
      insT.run(
        n(t.id, 0),
        s(t.name, "Mal"),
        JSON.stringify(sanitizeSettings(t.settings)),
        JSON.stringify(sanitizePlacements(t.placements)),
        s(t.createdAt, new Date().toISOString()),
      );
    }
  })();
}
