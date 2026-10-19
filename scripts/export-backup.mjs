import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbFile = process.argv[2] || process.env.DATABASE_PATH || "/app/data/mixup.db";
const outDir = process.argv[3] || "/tmp/mixup-backup";

if (!fs.existsSync(dbFile)) {
  console.error(`Feil: Fant ikke databasefilen '${dbFile}'`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const db = new Database(dbFile, { readonly: true });
db.pragma("busy_timeout = 5000");

async function run() {
  console.log(`[1/3] Koblet til database: ${dbFile}`);

  // 1. Utfør 100% konsistent SQLite-snapshot med online backup API
  const sqliteOut = path.join(outDir, "mixup.sqlite");
  await db.backup(sqliteOut);
  console.log(`[2/3] Konsistent SQLite-kopi skrevet til: ${sqliteOut}`);

  // 2. Ekstraher portabel JSON-sikkerhetskopi (samme format som /admin-eksport)
  const isTable = (name) =>
    !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);

  const voiceGroups = isTable("voice_groups")
    ? db.prepare("SELECT id, name, abbr, color, sort_order AS sortOrder FROM voice_groups ORDER BY sort_order ASC, id ASC").all()
    : [];

  const singers = isTable("singers")
    ? db.prepare("SELECT id, full_name AS fullName, nickname, voice_group_id AS voiceGroupId, height, is_active AS isActive FROM singers ORDER BY id ASC").all().map(s => ({ ...s, isActive: !!s.isActive }))
    : [];

  const venues = isTable("venues")
    ? db.prepare("SELECT id, name, width_m AS widthM, depth_m AS depthM FROM venues ORDER BY id ASC").all()
    : [];

  const concerts = isTable("concerts")
    ? db.prepare("SELECT id, name, date, venue_id AS venueId, stage_width AS stageWidth, stage_depth AS stageDepth FROM concerts ORDER BY id ASC").all()
    : [];

  const attendance = isTable("concert_attendance")
    ? db.prepare("SELECT concert_id AS concertId, singer_id AS singerId, attending FROM concert_attendance").all().map(a => ({ ...a, attending: !!a.attending }))
    : [];

  const scenes = isTable("scenes")
    ? db.prepare("SELECT id, concert_id AS concertId, position, title, settings, placements, updated_at AS updatedAt FROM scenes ORDER BY concert_id ASC, position ASC").all().map(sc => ({
        ...sc,
        settings: typeof sc.settings === "string" ? JSON.parse(sc.settings) : sc.settings,
        placements: typeof sc.placements === "string" ? JSON.parse(sc.placements) : sc.placements,
      }))
    : [];

  const templates = isTable("templates")
    ? db.prepare("SELECT id, name, settings, placements, created_at AS createdAt FROM templates ORDER BY id ASC").all().map(t => ({
        ...t,
        settings: typeof t.settings === "string" ? JSON.parse(t.settings) : t.settings,
        placements: typeof t.placements === "string" ? JSON.parse(t.placements) : t.placements,
      }))
    : [];

  const backupData = {
    app: "mixup",
    version: 1,
    exportedAt: new Date().toISOString(),
    voiceGroups,
    singers,
    venues,
    concerts,
    attendance,
    scenes,
    templates,
  };

  const jsonOut = path.join(outDir, "mixup-backup.json");
  fs.writeFileSync(jsonOut, JSON.stringify(backupData, null, 2), "utf-8");
  console.log(`[3/3] Portabel JSON-sikkerhetskopi skrevet til: ${jsonOut}`);

  // Skriv et lite metadata-sammendrag
  const meta = {
    exportedAt: backupData.exportedAt,
    counts: {
      singers: singers.length,
      concerts: concerts.length,
      venues: venues.length,
      voiceGroups: voiceGroups.length,
      scenes: scenes.length,
      templates: templates.length,
    }
  };
  fs.writeFileSync(path.join(outDir, "backup-meta.json"), JSON.stringify(meta, null, 2), "utf-8");
  console.log("Fullført! Metadata:", JSON.stringify(meta.counts));
}

run()
  .then(() => {
    db.close();
    process.exit(0);
  })
  .catch((err) => {
    console.error("Feil under eksport:", err);
    try { db.close(); } catch {}
    process.exit(1);
  });
