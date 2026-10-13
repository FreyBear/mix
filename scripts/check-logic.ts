/**
 * Enkel logikktest uten testrammeverk: kjør `npm test`.
 * Tester geometri, auto-sortering, redigeringsoperasjoner, backup/restore og import.
 */
import assert from "node:assert/strict";
import { openDb } from "../src/lib/db";
import { seedDatabase } from "../src/lib/seed";
import { computeLayout } from "../src/lib/layout";
import {
  autoSort,
  effectiveGroupId,
  moveSinger,
  reconcile,
  setOverride,
  toggleBench,
  toggleSolo,
  type PlacementCtx,
} from "../src/lib/placement";
import {
  attendingIds,
  listConcerts,
  listGroups,
  listScenes,
  listSingers,
  reconcileConcertScenes,
} from "../src/lib/repo";
import { createBackup, restoreBackup } from "../src/lib/backup";
import { parseSingerImport } from "../src/lib/singer-import";
import { DEFAULT_SETTINGS, type SceneSettings } from "../src/lib/types";
import { VOICE_PROFILES } from "../src/lib/profiles";
import {
  changePassword,
  ensureAuthConfig,
  makeSessionToken,
  parseSessionToken,
  resetAdminPassword,
  resetConductorPassword,
  verifyLogin,
} from "../src/lib/auth";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name}`);
    throw e;
  }
}

const db = openDb(":memory:");
(globalThis as unknown as { __mixupDb?: typeof db }).__mixupDb = db;
seedDatabase(db);
const groups = listGroups(db);
const singers = listSingers(db);
const concert = listConcerts(db)[0];
const ctx: PlacementCtx = { singers, groups, stageW: concert.stageWidth, stageD: concert.stageDepth };
const sMap = new Map(singers.map((s) => [s.id, s]));
const [s1, s2, s3] = listScenes(db, concert.id);

const items = (sc: typeof s1) =>
  sc.placements.map((p) => ({ singerId: p.singerId, row: p.row, slot: p.slot, status: p.status }));

console.log("Logikktester");

test("seed gir 32 aktive sangere og 3 sanger", () => {
  assert.equal(singers.filter((s) => s.isActive).length, 32);
  assert.equal(listScenes(db, concert.id).length, 3);
  assert.equal(attendingIds(db, concert.id).length, 32);
});

test("auto-sortering gir unike plasser og ingen kollisjoner", () => {
  const keys = s1.placements.map((p) => `${p.row}:${p.slot}`);
  assert.equal(new Set(keys).size, keys.length);
  const layout = computeLayout(12, 7, s1.settings, items(s1));
  assert.equal(layout.collisionIds.size, 0, "kollisjoner");
  assert.equal(layout.outsideIds.size, 0, "utenfor scenen");
  assert.equal(layout.nodes.length, 32);
});

test("høyeste sanger i hver gruppe står bakerst", () => {
  const byGroup = new Map<number, { row: number; h: number }[]>();
  for (const p of s1.placements) {
    const s = sMap.get(p.singerId)!;
    const g = effectiveGroupId(p, s);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push({ row: p.row, h: s.height });
  }
  for (const list of byGroup.values()) {
    const maxRow = Math.max(...list.map((x) => x.row));
    const back = list.filter((x) => x.row === maxRow).map((x) => x.h);
    const front = list.filter((x) => x.row === 0).map((x) => x.h);
    assert.ok(Math.min(...back) >= Math.max(...front) - 1, "bak >= foran");
  }
});

test("stemmegrupper står i sammenhengende blokker fra venstre", () => {
  const order = groups.map((g) => g.id);
  const avg = (gid: number) => {
    const xs = s1.placements
      .filter((p) => effectiveGroupId(p, sMap.get(p.singerId)!) === gid)
      .map((p) => p.slot);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  const avgs = order.map(avg);
  assert.deepEqual([...avgs].sort((a, b) => a - b), avgs);
});

test("korbredde-slider begrenser bredden", () => {
  const narrow = computeLayout(12, 7, { ...s1.settings, choirWidthPct: 50 }, items(s1));
  const wide = computeLayout(12, 7, { ...s1.settings, choirWidthPct: 100 }, items(s1));
  const span = (l: typeof narrow) =>
    Math.max(...l.nodes.map((n) => n.x)) - Math.min(...l.nodes.map((n) => n.x));
  assert.ok(span(narrow) <= 6.01, `smal ${span(narrow)}`);
  assert.ok(span(wide) > span(narrow));
  const centered = (Math.max(...narrow.nodes.map((n) => n.x)) + Math.min(...narrow.nodes.map((n) => n.x))) / 2;
  assert.ok(Math.abs(centered - 6) < 0.8, "sentrert");
});

test("amfi bøyer rader fremover i endene", () => {
  const straight = computeLayout(12, 7, { ...s1.settings, arc: 0 }, items(s1));
  const arc = computeLayout(12, 7, { ...s1.settings, arc: 80 }, items(s1));
  const rowY = (l: typeof arc, r: number, pick: "min" | "max") => {
    const xs = l.nodes.filter((n) => n.row === r).sort((a, b) => a.x - b.x);
    return pick === "min" ? xs[0].y : xs[Math.floor(xs.length / 2)].y;
  };
  assert.ok(Math.abs(rowY(straight, 0, "min") - rowY(straight, 0, "max")) < 1e-6);
  assert.ok(rowY(arc, 0, "min") > rowY(arc, 0, "max") + 0.3, "kanten er foran midten (nærmere publikum)");
});

test("sangeravstand styrer avstanden mellom korister", () => {
  const tight = computeLayout(12, 7, { ...s1.settings, singerSpacing: 60 }, items(s1));
  const loose = computeLayout(12, 7, { ...s1.settings, singerSpacing: 100 }, items(s1));
  const span = (l: typeof tight) =>
    Math.max(...l.nodes.map((n) => n.x)) - Math.min(...l.nodes.map((n) => n.x));
  assert.ok(span(tight) < span(loose), "større sangeravstand gir bredere oppstilling");
});

/** Avstanden mellom naboer i en rad (langs raden) skal være lik overalt (ingen hull). */
function assertNoHoles(l: ReturnType<typeof computeLayout>, label: string) {
  for (let r = 0; r < l.rows; r++) {
    const ns = l.nodes
      .filter((nd) => nd.zone === "choir" && nd.row === r)
      .sort((a, b) => a.x - b.x);
    if (ns.length < 3) continue;
    const gaps = ns.slice(1).map((n, i) => Math.hypot(n.x - ns[i].x, n.y - ns[i].y));
    assert.ok(Math.max(...gaps) - Math.min(...gaps) < 1e-6, `${label}: hull i rad ${r + 1}`);
  }
}

test("bue: lik avstand langs kurven, også i endene, og bredden holdes", () => {
  const rowsOf = (l: ReturnType<typeof computeLayout>, r: number) =>
    l.nodes.filter((n) => n.row === r).sort((a, b) => a.x - b.x);
  for (const arc of [20, 60, 100]) {
    const l = computeLayout(12, 7, { ...s1.settings, arc, choirWidthPct: 90 }, items(s1));
    for (let r = 0; r < l.rows; r++) {
      const ns = rowsOf(l, r);
      const d = ns.slice(1).map((n, i) => Math.hypot(n.x - ns[i].x, n.y - ns[i].y));
      assert.ok(Math.max(...d) - Math.min(...d) < 1e-6, `jevn avstand arc=${arc} rad ${r + 1}`);
    }
    const xs = l.nodes.map((n) => n.x);
    assert.ok(Math.max(...xs) - Math.min(...xs) <= 12 * 0.9 + 1e-6, `bredde arc=${arc}`);
  }
  // Maks bue er en halvsirkel: endene ligger på samme høyde som sirkelens midtpunkt.
  const full = computeLayout(12, 7, { ...s1.settings, arc: 100 }, items(s1));
  const back = full.nodes.filter((n) => n.row === full.rows - 1).sort((a, b) => a.x - b.x);
  const mid = back[Math.floor(back.length / 2)];
  assert.ok(back[0].y - mid.y > 3, "endene er langt foran midten ved maks bue");
});

test("ingen hull i oppstillingene (seed, alle bredder og former)", () => {
  for (const sc of [s1, s2, s3]) {
    for (const w of [40, 70, 90, 100]) {
      for (const shape of ["rows", "arc"] as const) {
        const l = computeLayout(12, 7, { ...sc.settings, soloKeepGap: false, choirWidthPct: w, arc: shape === "arc" ? 60 : 0 }, items(sc));
        assertNoHoles(l, `${sc.title} ${w}% ${shape}`);
      }
    }
  }
});

test("auto-sortering gir jevnt fylte rader uten hull for alle koretørrelser", () => {
  for (let n = 1; n <= 60; n++) {
    const ids = singers.filter((s) => s.isActive).slice(0, Math.min(n, 32)).map((s) => s.id);
    const extra = n > 32 ? singers.slice(0, n - 32).map((s) => s.id) : [];
    const state = autoSort(
      [...new Set([...ids, ...extra])].map((id) => ({
        singerId: id,
        row: -1,
        slot: -1,
        status: "choir" as const,
        pinned: false,
        overrideGroupId: null,
      })),
      DEFAULT_SETTINGS,
      ctx,
    );
    const perRow = new Map<number, number[]>();
    for (const p of state.placements) {
      if (!perRow.has(p.row)) perRow.set(p.row, []);
      perRow.get(p.row)!.push(p.slot);
    }
    const sizes = [...perRow.values()].map((v) => v.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `jevne rader for ${n}: ${sizes}`);
    for (const slots of perRow.values()) {
      const sorted = [...slots].sort((a, b) => a - b);
      assert.deepEqual(sorted, sorted.map((_, i) => i), `tette plasser for ${n}`);
    }
    assertNoHoles(computeLayout(12, 7, state.settings, state.placements), `n=${n}`);
  }
});

test("auto-sortering med bue gir flere korister på bakerste enn forreste rad", () => {
  const arcSettings = {
    ...DEFAULT_SETTINGS,
    shape: "arc" as const,
    arc: 80,
    rowsAuto: false,
    rows: 3,
  };
  const state = autoSort(s1.placements, arcSettings, ctx);
  const perRow = new Map<number, number[]>();
  for (const p of state.placements) {
    if (!perRow.has(p.row)) perRow.set(p.row, []);
    perRow.get(p.row)!.push(p.slot);
  }
  const sizes = [0, 1, 2].map((r) => perRow.get(r)?.length ?? 0);
  assert.ok(
    sizes[2] > sizes[0],
    `bakerste rad (${sizes[2]}) skal ha flere enn forreste (${sizes[0]}) ved arc=80`,
  );
  assert.equal(sizes.reduce((a, b) => a + b, 0), 32);
  const layout = computeLayout(12, 7, state.settings, state.placements);
  assert.equal(layout.collisionIds.size, 0, "ingen kollisjoner med bue-autosort");
  assert.equal(layout.outsideIds.size, 0, "ingen utenfor scenen");
  assertNoHoles(layout, "arc=80 autosort");
});

test("hull oppstår ikke etter benk, fravær, stemmebytte og tilbakeføring", () => {
  let state = { placements: s1.placements, settings: s1.settings };
  const ids = state.placements.map((p) => p.singerId);
  for (const id of [ids[3], ids[10], ids[17], ids[24]]) state = toggleBench(state, id, ctx).state;
  assertNoHoles(computeLayout(12, 7, state.settings, state.placements), "etter benk");
  for (const id of [ids[10], ids[3]]) state = toggleBench(state, id, ctx).state;
  assertNoHoles(computeLayout(12, 7, state.settings, state.placements), "etter retur fra benk");
  const tenor = groups.find((g) => g.abbr === "T")!;
  const bass = groups.find((g) => g.abbr === "B")!;
  const someBass = singers.find((s) => s.voiceGroupId === bass.id)!;
  state = setOverride(state, someBass.id, tenor.id, ctx).state;
  assertNoHoles(computeLayout(12, 7, state.settings, state.placements), "etter stemmebytte");
  const attending = new Set(ids.filter((_, i) => i % 5 !== 0));
  state = reconcile(state, attending, ctx);
  assertNoHoles(computeLayout(12, 7, state.settings, state.placements), "etter fravær");
  const back = reconcile(state, new Set(ids), ctx);
  assertNoHoles(computeLayout(12, 7, back.settings, back.placements), "etter at alle er tilbake");
});


test("låste sangere følger forreste/bakerste rad når antall rader endres; midtrad mister låsen", () => {
  let st = autoSort(s1.placements, { ...s1.settings, rowsAuto: false, rows: 3 }, ctx, 3);
  const rowOf = (state: typeof st, id: number) => state.placements.find((p) => p.singerId === id)!;
  const pick = (row: number) => st.placements.find((p) => p.row === row)!.singerId;
  const front = pick(0), mid = pick(1), back = pick(2);
  st = {
    ...st,
    placements: st.placements.map((p) =>
      [front, mid, back].includes(p.singerId) ? { ...p, pinned: true } : p,
    ),
  };
  const sort = (rows: number, prev: number) =>
    autoSort(st.placements, { ...st.settings, rowsAuto: false, rows }, ctx, prev);
  for (const rows of [2, 5, 1, 4]) {
    const r = sort(rows, 3);
    assert.equal(rowOf(r, front).row, 0, `forrest forblir forrest (${rows} rader)`);
    assert.equal(rowOf(r, front).pinned, true);
    assert.equal(rowOf(r, back).row, rows - 1, `bakerst forblir bakerst (${rows} rader)`);
    assert.equal(rowOf(r, back).pinned, true);
    assert.equal(rowOf(r, mid).pinned, false, `midtrad mister låsen (${rows} rader)`);
    assertNoHoles(computeLayout(12, 7, r.settings, r.placements), `${rows} rader`);
  }
  // Uendret antall rader: alle låser består.
  const same = sort(3, 3);
  assert.ok([front, mid, back].every((id) => rowOf(same, id).pinned));
  assert.equal(rowOf(same, mid).row, 1);
});

test("kollisjon oppdages når sangere står for tett", () => {
  const dense = computeLayout(
    12,
    7,
    { ...s1.settings, choirWidthPct: 30 },
    items(s1),
  );
  assert.ok(dense.collisionIds.size > 0);
  assert.ok(dense.warnings.some((w) => w.kind === "collision"));
});

test("solist plasseres foran koret; sporet beholdes eller trekkes sammen", () => {
  const ingrid = singers.find((s) => s.nickname === "Ingrid")!;
  const solo = s2.placements.find((p) => p.singerId === ingrid.id)!;
  assert.equal(solo.status, "solo");
  const keep = computeLayout(12, 7, { ...s2.settings, soloKeepGap: true }, items(s2));
  const close = computeLayout(12, 7, { ...s2.settings, soloKeepGap: false }, items(s2));
  const soloNode = keep.nodes.find((n) => n.singerId === ingrid.id)!;
  const choirMaxY = Math.max(...keep.nodes.filter((n) => n.zone === "choir").map((n) => n.y));
  assert.ok(soloNode.y > choirMaxY, "solist foran");
  assert.equal(keep.gridSlots.filter((g) => g.reserved).length, 1);
  const rowMates = (l: typeof keep) =>
    l.nodes.filter((n) => n.zone === "choir" && n.row === solo.row).sort((a, b) => a.x - b.x);
  const gaps = (l: typeof keep) => {
    const r = rowMates(l);
    return Math.max(...r.slice(1).map((n, i) => n.x - r[i].x));
  };
  assert.ok(gaps(close) <= gaps(keep) + 1e-9, "sporet trekkes sammen");
  for (const layout of ["center", "spread", "pairs"] as const) {
    const l = computeLayout(12, 7, { ...s2.settings, soloLayout: layout }, items(s2));
    assert.ok(l.nodes.some((n) => n.zone === "solo"));
  }
});

test("midlertidig stemmegruppe: beholder fargen, står hos ny gruppe", () => {
  const ola = singers.find((s) => s.nickname === "Ola")!;
  const bass = groups.find((g) => g.abbr === "B")!;
  const p = s3.placements.find((q) => q.singerId === ola.id)!;
  assert.equal(p.overrideGroupId, bass.id);
  assert.notEqual(ola.voiceGroupId, bass.id);
  const bassSlots = s3.placements
    .filter((q) => q.singerId !== ola.id && effectiveGroupId(q, sMap.get(q.singerId)!) === bass.id)
    .map((q) => q.slot);
  const minB = Math.min(...bassSlots);
  const maxB = Math.max(...bassSlots);
  assert.ok(p.slot >= minB - 2 && p.slot <= maxB + 2, `Ola slot ${p.slot} ikke nær B ${minB}-${maxB}`);
});

test("redigering: bytte, flytte til tom plass, benk og lås", () => {
  const base = { placements: s1.placements, settings: s1.settings };
  const [a, b] = base.placements;
  const swapped = moveSinger(base, a.singerId, { type: "singer", id: b.singerId }, ctx).state;
  const na = swapped.placements.find((p) => p.singerId === a.singerId)!;
  assert.equal(na.row, b.row);
  assert.equal(na.slot, b.slot);

  const benched = toggleBench(base, a.singerId, ctx).state;
  assert.equal(benched.placements.find((p) => p.singerId === a.singerId)!.status, "bench");
  const back = toggleBench(benched, a.singerId, ctx).state;
  const pa = back.placements.find((p) => p.singerId === a.singerId)!;
  assert.equal(pa.status, "choir");
  assert.equal(pa.row, a.row);
  assert.equal(pa.slot, a.slot);

  const locked = {
    ...base,
    placements: base.placements.map((p) => (p.singerId === a.singerId ? { ...p, pinned: true } : p)),
  };
  const res = moveSinger(locked, a.singerId, { type: "singer", id: b.singerId }, ctx);
  assert.ok(res.error);

  const sorted = autoSort(locked.placements, locked.settings, ctx);
  const pinnedAfter = sorted.placements.find((p) => p.singerId === a.singerId)!;
  assert.equal(pinnedAfter.row, a.row);
  assert.equal(pinnedAfter.slot, a.slot);
});

test("redigering: sette inn sanger mellom to sangere i en annen rekke", () => {
  const base = { placements: s1.placements, settings: s1.settings };
  const r0Singers = base.placements.filter((p) => p.status === "choir" && p.row === 0).sort((a, b) => a.slot - b.slot);
  const r1Singers = base.placements.filter((p) => p.status === "choir" && p.row === 1).sort((a, b) => a.slot - b.slot);
  const initialR0Count = r0Singers.length;
  const initialR1Count = r1Singers.length;

  const movedSingerId = r0Singers[1].singerId;
  const insertIndex = 2;

  const res = moveSinger(base, movedSingerId, { type: "insert", row: 1, index: insertIndex }, ctx);
  assert.ok(!res.error);

  const nextR0 = res.state.placements.filter((p) => p.status === "choir" && p.row === 0).sort((a, b) => a.slot - b.slot);
  const nextR1 = res.state.placements.filter((p) => p.status === "choir" && p.row === 1).sort((a, b) => a.slot - b.slot);

  // Kilderaden skal ha én færre sanger
  assert.equal(nextR0.length, initialR0Count - 1);
  // Målraden skal ha én flere sanger
  assert.equal(nextR1.length, initialR1Count + 1);

  // Sangeren skal stå på den spesifiserte indeksen i målraden
  assert.equal(nextR1[insertIndex].singerId, movedSingerId);

  // Begge radene skal være tett nummerert (slot 0..n-1 uten hull)
  nextR0.forEach((p, i) => assert.equal(p.slot, i));
  nextR1.forEach((p, i) => assert.equal(p.slot, i));

  // Layout skal beregnes gyldig og uten feil
  const l = computeLayout(concert.stageWidth, concert.stageDepth, res.state.settings, res.state.placements);
  assert.ok(l.nodes.length > 0);
  assert.ok(l.nodes.some((n) => n.singerId === movedSingerId && n.row === 1));
});

test("solist-veksling og override via operasjoner", () => {
  const base = { placements: s1.placements, settings: s1.settings };
  const x = base.placements[3].singerId;
  const solo = toggleSolo(base, x, ctx).state;
  assert.equal(solo.placements.find((p) => p.singerId === x)!.status, "solo");
  const bass = groups.find((g) => g.abbr === "B")!;
  const sop = singers.find((s) => s.voiceGroupId === groups[0].id)!;
  const lent = setOverride(base, sop.id, bass.id, ctx).state;
  assert.equal(lent.placements.find((p) => p.singerId === sop.id)!.overrideGroupId, bass.id);
  const reset = setOverride(lent, sop.id, null, ctx).state;
  assert.equal(reset.placements.find((p) => p.singerId === sop.id)!.overrideGroupId, null);
});

test("oppmøte: borte-merkede forsvinner, tilbakemeldte kommer tilbake", () => {
  const absent = singers[0];
  db.prepare("UPDATE concert_attendance SET attending = 0 WHERE concert_id = ? AND singer_id = ?").run(
    concert.id,
    absent.id,
  );
  reconcileConcertScenes(db, concert.id);
  for (const sc of listScenes(db, concert.id)) {
    assert.ok(!sc.placements.some((p) => p.singerId === absent.id));
    assert.equal(sc.placements.length, 31);
  }
  db.prepare("UPDATE concert_attendance SET attending = 1 WHERE concert_id = ? AND singer_id = ?").run(
    concert.id,
    absent.id,
  );
  reconcileConcertScenes(db, concert.id);
  for (const sc of listScenes(db, concert.id)) {
    assert.equal(sc.placements.length, 32);
    const keys = sc.placements.filter((p) => p.status !== "bench").map((p) => `${p.row}:${p.slot}`);
    assert.equal(new Set(keys).size, keys.length, "unike plasser");
  }
  const direct = reconcile({ placements: s1.placements, settings: s1.settings }, new Set([singers[0].id]), ctx);
  assert.equal(direct.placements.length, 1);
});

test("backup og gjenoppretting gir identiske data", () => {
  const before = JSON.stringify({ ...createBackup(db), exportedAt: "" });
  const copy = JSON.parse(JSON.stringify(createBackup(db)));
  const other = openDb(":memory:");
  restoreBackup(other, copy);
  const after = JSON.stringify({ ...createBackup(other), exportedAt: "" });
  assert.equal(after, before);
  assert.throws(() => restoreBackup(other, { app: "annet" }));
});

test("import: delte stemmegrupper S1 S2 A1 A2 T1 T2 B1 B2", () => {
  const eight = VOICE_PROFILES.SSAATTBB.groups.map((g, i) => ({ id: 100 + i, name: g.name, abbr: g.abbr, color: g.color, sortOrder: i }));
  const text = [
    "Navn;Kallenavn;Stemmegruppe;Høyde",
    "Anne Berg;Anne;S1;165",
    "Bodil Vik;Bodil;s 2;160",
    "Cecilie Dahl;Cecilie;Alt 1;168",
    "Dina Moe;Dina;A-2;170",
    "Egil Ness;Egil;T1;180",
    "Frode Lie;Frode;Tenor 2;182",
    "Geir Ro;Geir;b1;185",
    "Hans Ås;Hans;Bass2;190",
    "Ida Fjell;Ida;S3;160",
  ].join("\n");
  const r = parseSingerImport(text, eight);
  assert.equal(r.rows.length, 8);
  assert.deepEqual(r.rows.map((x) => x.voiceGroupId), [100, 101, 102, 103, 104, 105, 106, 107]);
  assert.equal(r.skipped.length, 1);
});

test("import: CSV med overskrift og ren tekst", () => {
  const csv = "Navn;Kallenavn;Stemme;Høyde\nNils Hansen;Nisse;T;182\nKari Test;;S;165\nUkjent Person;;X;170";
  const r = parseSingerImport(csv, groups);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[1].nickname, "Kari");
  assert.equal(r.skipped.length, 1);
  const plain = parseSingerImport("Ola Nordmann, Ola, Bass, 185\nPer Spelemann, Per, A, 178", groups);
  assert.equal(plain.rows.length, 2);
  assert.equal(plain.rows[0].voiceGroupId, groups.find((g) => g.abbr === "B")!.id);
});

test("individuell radjustering: forskyving og utstrekning fungerer, og nullstilles ved auto-sortering", () => {
  const base = computeLayout(12, 7, s1.settings, items(s1));
  const r1Base = base.nodes.filter((n) => n.row === 1).sort((a, b) => a.x - b.x);
  const r1SpanBase = r1Base[r1Base.length - 1].x - r1Base[0].x;
  const r1MidBase = (r1Base[0].x + r1Base[r1Base.length - 1].x) / 2;

  // 1. Forskyv rad 1 med 0.4 meter til høyre
  const shiftedSettings: SceneSettings = {
    ...s1.settings,
    rowAdjustments: { 1: { shift: 0.4, spread: 100 } },
  };
  const shifted = computeLayout(12, 7, shiftedSettings, items(s1));
  const r1Shifted = shifted.nodes.filter((n) => n.row === 1).sort((a, b) => a.x - b.x);
  const r1MidShifted = (r1Shifted[0].x + r1Shifted[r1Shifted.length - 1].x) / 2;
  assert.ok(Math.abs(r1MidShifted - (r1MidBase + 0.4)) < 1e-4, "rad 1 er forskjøvet 0.4m til høyre");

  // 2. Strekk rad 1 med spread = 120 (20% bredere)
  const spreadSettings: SceneSettings = {
    ...s1.settings,
    rowAdjustments: { 1: { shift: 0, spread: 120 } },
  };
  const spread = computeLayout(12, 7, spreadSettings, items(s1));
  const r1Spread = spread.nodes.filter((n) => n.row === 1).sort((a, b) => a.x - b.x);
  const r1SpanSpread = r1Spread[r1Spread.length - 1].x - r1Spread[0].x;
  assert.ok(Math.abs(r1SpanSpread - r1SpanBase * 1.2) < 1e-4, "rad 1 er strukket med 20%");

  // 3. Auto-sortering skal nullstille radjusteringer
  const sorted = autoSort(s1.placements, shiftedSettings, ctx);
  assert.equal(sorted.settings.rowAdjustments, undefined, "rowAdjustments er nullstilt etter autoSort");
});

test("alle solo-oppsett og rader/amfi-kombinasjoner gir gyldig layout", () => {
  for (const shape of ["rows", "arc"] as const) {
    for (const spacing of [60, 75, 95]) {
      for (const pct of [30, 50, 90]) {
        for (const rows of [1, 3, 6]) {
          const l = computeLayout(8, 5, { ...DEFAULT_SETTINGS, rowsAuto: false, rows, singerSpacing: spacing, choirWidthPct: pct, arc: shape === "arc" ? 100 : 0 }, items(s1));
          assert.equal(l.nodes.length, 32);
          assert.ok(l.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
        }
      }
    }
  }
});

test("autentisering: standardpassord for dirigent (1234) og admin (987654321) krever passordbytte", () => {
  ensureAuthConfig(db);

  const c = verifyLogin("1234");
  assert.equal(c.success, true);
  assert.equal(c.role, "conductor");
  assert.equal(c.mustChangePassword, true);

  const a = verifyLogin("987654321");
  assert.equal(a.success, true);
  assert.equal(a.role, "superadmin");
  assert.equal(a.mustChangePassword, true);

  const fail = verifyLogin("helt-feil-kode");
  assert.equal(fail.success, false);
});

test("autentisering: passordbytte fjerner mustChangePassword og ugyldiggjør gamle økter", () => {
  const oldConductorToken = makeSessionToken("conductor");
  assert.ok(parseSessionToken(oldConductorToken) !== null, "gammel token er gyldig før bytte");

  changePassword("conductor", "ny-dirigent-kode-2026");
  const c = verifyLogin("ny-dirigent-kode-2026");
  assert.equal(c.success, true);
  assert.equal(c.role, "conductor");
  assert.equal(c.mustChangePassword, false);
  assert.equal(verifyLogin("1234").success, false, "gammel standardkode fungerer ikke lenger");

  // Gammel økttype skal være ugyldiggjort fordi passord-hashen endret seg
  assert.equal(parseSessionToken(oldConductorToken), null, "gammel økt er ugyldig etter passordbytte");

  const newConductorToken = makeSessionToken("conductor");
  assert.ok(parseSessionToken(newConductorToken) !== null, "ny token er gyldig");

  // Admin bytte
  changePassword("superadmin", "ny-admin-kode-2026");
  const a = verifyLogin("ny-admin-kode-2026");
  assert.equal(a.success, true);
  assert.equal(a.role, "superadmin");
  assert.equal(a.mustChangePassword, false);
  assert.equal(verifyLogin("987654321").success, false, "gammel adminkode fungerer ikke lenger");
});

test("autentisering: admin kan tilbakestille dirigentpassord til 1234 med krav om bytte", () => {
  // Dirigent har for øyeblikket "ny-dirigent-kode-2026"
  assert.equal(verifyLogin("ny-dirigent-kode-2026").success, true);

  // Admin tilbakestiller dirigent
  resetConductorPassword();

  // Nå skal dirigenten være tilbake på 1234 med krav om bytte
  const c = verifyLogin("1234");
  assert.equal(c.success, true);
  assert.equal(c.role, "conductor");
  assert.equal(c.mustChangePassword, true);
  assert.equal(verifyLogin("ny-dirigent-kode-2026").success, false, "tidligere passord er ugyldiggjort");

  // Adminpassordet ("ny-admin-kode-2026") skal være uberørt
  const a = verifyLogin("ny-admin-kode-2026");
  assert.equal(a.success, true);
  assert.equal(a.role, "superadmin");
  assert.equal(a.mustChangePassword, false);

  // Tilbakestill admin via hjelpefunksjon
  resetAdminPassword();
  const aReset = verifyLogin("987654321");
  assert.equal(aReset.success, true);
  assert.equal(aReset.role, "superadmin");
  assert.equal(aReset.mustChangePassword, true);
});

test("import: replaceExisting erstatter eksisterende sangere og sletter demodata", () => {
  const testDb = openDb(":memory:");
  seedDatabase(testDb);
  assert.ok(listSingers(testDb).length >= 32, "demodata har minst 32 sangere");

  const groups = listGroups(testDb);
  const csv = "Navn;Kallenavn;Stemmegruppe;Høyde;Aktiv\nNy Sanger 1;S1;S;165;Ja\nNy Sanger 2;S2;A;170;Ja\nNy Sanger 3;S3;T;180;Ja\nNy Sanger 4;S4;B;185;Ja";
  const parsed = parseSingerImport(csv, groups);
  assert.equal(parsed.rows.length, 4);

  // Simuler import med replaceExisting
  testDb.transaction(() => {
    testDb.prepare("DELETE FROM concert_attendance").run();
    testDb.prepare("DELETE FROM singers").run();
    const add = testDb.prepare(
      `INSERT INTO singers (full_name, nickname, voice_group_id, height, is_active)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const r of parsed.rows) {
      add.run(r.fullName, r.nickname, r.voiceGroupId, r.height, r.isActive ? 1 : 0);
    }
  })();

  const newSingers = listSingers(testDb);
  assert.equal(newSingers.length, 4, "kun de 4 nye sangerne finnes nå i databasen");
  assert.equal(newSingers[0].fullName, "Ny Sanger 1");
  assert.equal(newSingers[3].fullName, "Ny Sanger 4");
});

console.log(`\n${passed} tester OK`);
