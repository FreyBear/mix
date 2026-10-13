import type Database from "better-sqlite3";
import { VOICE_PROFILES } from "./profiles";
import { insertScene, listGroups, listSingers } from "./repo";
import {
  createInitialState,
  setOverride,
  toggleBench,
  toggleSolo,
  type PlacementCtx,
  type PlacementState,
} from "./placement";
import { DEFAULT_SETTINGS } from "./types";

type Db = Database.Database;

// [fullName, nickname, group abbr, height cm]
const CHOIR: [string, string, string, number][] = [
  ["Ingrid Haugen", "Ingrid", "S", 168],
  ["Marte Solberg", "Marte", "S", 162],
  ["Silje Berg", "Silje", "S", 171],
  ["Hanne Larsen", "Hanne", "S", 158],
  ["Kari Nilsen", "Kari", "S", 165],
  ["Ida Johansen", "Ida", "S", 174],
  ["Eva Pedersen", "Eva", "S", 160],
  ["Nora Andersen", "Nora", "S", 169],
  ["Tuva Kristiansen", "Tuva", "S", 176],
  ["Liv Olsen", "Liv", "A", 164],
  ["Randi Hansen", "Randi", "A", 159],
  ["Astrid Dahl", "Astrid", "A", 172],
  ["Camilla Moen", "Camilla", "A", 167],
  ["Sofie Lund", "Sofie", "A", 175],
  ["Gunn Strand", "Gunn", "A", 161],
  ["Maren Eide", "Maren", "A", 170],
  ["Hilde Vik", "Hilde", "A", 166],
  ["Ola Nordmann", "Ola", "T", 181],
  ["Per Aasen", "Per", "T", 176],
  ["Jon Bakke", "Jon", "T", 188],
  ["Erik Holm", "Erik", "T", 179],
  ["Lars Myhre", "Lars", "T", 184],
  ["Anders Foss", "Anders", "T", 173],
  ["Tor Brekke", "Tor", "T", 190],
  ["Knut Sæther", "Knut", "B", 183],
  ["Bjørn Rønning", "Bjørn", "B", 187],
  ["Magnus Aas", "Magnus", "B", 178],
  ["Henrik Vang", "Henrik", "B", 192],
  ["Svein Tveit", "Svein", "B", 175],
  ["Odd Lie", "Odd", "B", 181],
  ["Trond Fjeld", "Trond", "B", 185],
  ["Arne Sand", "Arne", "B", 180],
];

/** Fyller en tom database med blandakor, lokasjoner og en demokonsert. */
export function seedDatabase(db: Db) {
  db.transaction(() => {
    const addGroup = db.prepare(
      "INSERT INTO voice_groups (name, abbr, color, sort_order) VALUES (?, ?, ?, ?)",
    );
    VOICE_PROFILES.SATB.groups.forEach((g, i) => addGroup.run(g.name, g.abbr, g.color, i));

    const groupByAbbr = new Map(listGroups(db).map((g) => [g.abbr, g.id]));
    const addSinger = db.prepare(
      `INSERT INTO singers (full_name, nickname, voice_group_id, height, is_active)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const [full, nick, abbr, h] of CHOIR) {
      addSinger.run(full, nick, groupByAbbr.get(abbr)!, h, 1);
    }
    addSinger.run("Berit Lie", "Berit", groupByAbbr.get("A")!, 163, 0);

    const addVenue = db.prepare("INSERT INTO venues (name, width_m, depth_m) VALUES (?, ?, ?)");
    const kultur = Number(addVenue.run("Kulturhuset - Hovedscene", 12, 7).lastInsertRowid);
    addVenue.run("Domkirken", 8, 5);
    addVenue.run("Øvingslokalet", 9, 6);

    const concertId = Number(
      db
        .prepare(
          `INSERT INTO concerts (name, date, venue_id, stage_width, stage_depth)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("Vårkonsert", "2026-11-14", kultur, 12, 7).lastInsertRowid,
    );
    const singers = listSingers(db);
    const active = singers.filter((s) => s.isActive);
    const addAtt = db.prepare(
      "INSERT INTO concert_attendance (concert_id, singer_id, attending) VALUES (?, ?, 1)",
    );
    for (const s of active) addAtt.run(concertId, s.id);

    const ctx: PlacementCtx = {
      singers,
      groups: listGroups(db),
      stageW: 12,
      stageD: 7,
    };
    const byNick = (n: string) => singers.find((s) => s.nickname === n)!.id;

    const first = createInitialState(
      active.map((s) => s.id),
      DEFAULT_SETTINGS,
      ctx,
    );
    insertScene(db, concertId, "Introitus", first.settings, first.placements);

    // Sang 2: solist foran koret og to på reservebenken.
    let second: PlacementState = first;
    second = toggleSolo(second, byNick("Ingrid"), ctx).state;
    second = toggleBench(second, byNick("Tor"), ctx).state;
    second = toggleBench(second, byNick("Odd"), ctx).state;
    insertScene(db, concertId, "Solo-ballade", second.settings, second.placements);

    // Sang 3: amfi og en tenor som låner bass.
    let third: PlacementState = {
      placements: first.placements,
      settings: { ...first.settings, shape: "arc", arc: 45, singerSpacing: 80 },
    };
    third = setOverride(third, byNick("Ola"), groupByAbbr.get("B")!, ctx).state;
    insertScene(db, concertId, "Finale", third.settings, third.placements);
  })();
}
