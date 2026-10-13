/**
 * Røyktest mot en kjørende server:  BASE=http://localhost:3100 node scripts/smoke.mjs
 * Forutsetter en nyseedet database og ADMIN_PIN=1234.
 */
import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PIN = process.env.ADMIN_PIN ?? "1234";
let cookie = "";

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}

let n = 0;
async function step(name, fn) {
  try {
    await fn();
    n++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name}`);
    throw e;
  }
}

console.log(`Røyktest mot ${BASE}`);

await step("sider svarer", async () => {
  for (const p of ["/", "/admin", "/manifest.webmanifest", "/sw.js", "/pwa-icon/192"]) {
    const r = await fetch(BASE + p);
    assert.equal(r.status, 200, p);
  }
});

let boot;
await step("bootstrap gir seed-data", async () => {
  const r = await call("GET", "/api/bootstrap");
  assert.equal(r.status, 200);
  boot = r.json;
  assert.equal(boot.admin, false);
  assert.ok(boot.groups.length >= 4);
  assert.ok(boot.singers.length >= 32);
  assert.ok(boot.venues.length >= 3);
  assert.ok(boot.concerts.length >= 1);
});

await step("skriving krever PIN", async () => {
  assert.equal((await call("POST", "/api/groups", { name: "X", abbr: "X", color: "#ffffff" })).status, 401);
  assert.equal((await call("GET", "/api/backup")).status, 401);
  assert.equal((await call("POST", "/api/auth", { pin: "feil" })).status, 401);
});

await step("innlogging med riktig PIN", async () => {
  const r = await call("POST", "/api/auth", { pin: PIN });
  assert.equal(r.status, 200);
  assert.ok(cookie.startsWith("mixup_admin="));
  assert.equal((await call("GET", "/api/auth")).json.admin, true);
});

const concertId = () => boot.concerts[0].id;

await step("konsert og sanger kan leses", async () => {
  const r = await call("GET", `/api/concerts/${concertId()}`);
  assert.equal(r.status, 200);
  assert.equal(r.json.scenes.length, 3);
  assert.equal(r.json.attendingIds.length, 32);
});

await step("stemmegruppe: opprett, endre farge, slett", async () => {
  let r = await call("POST", "/api/groups", { name: "Testgruppe", abbr: "TG", color: "#123456" });
  assert.equal(r.status, 201);
  const g = r.json.groups.find((x) => x.abbr === "TG");
  r = await call("PUT", `/api/groups/${g.id}`, { name: "Testgruppe", abbr: "TG", color: "#abcdef" });
  assert.equal(r.json.groups.find((x) => x.abbr === "TG").color, "#abcdef");
  assert.equal((await call("POST", "/api/groups", { name: "Dårlig", abbr: "D", color: "rød" })).status, 400);
  r = await call("DELETE", `/api/groups/${g.id}`);
  assert.equal(r.status, 200);
  const first = boot.groups[0];
  assert.equal((await call("DELETE", `/api/groups/${first.id}`)).status, 409);
});

await step("sanger: opprett, importer, rediger, slett", async () => {
  const gid = boot.groups[0].id;
  let r = await call("POST", "/api/singers", { fullName: "Test Sanger", nickname: "Tester", voiceGroupId: gid, height: 170 });
  assert.equal(r.status, 201);
  const s = r.json.singers.find((x) => x.fullName === "Test Sanger");
  r = await call("PUT", `/api/singers/${s.id}`, { fullName: "Test Sanger", nickname: "Tess", voiceGroupId: gid, height: 171, isActive: false });
  assert.equal(r.json.singers.find((x) => x.id === s.id).nickname, "Tess");
  r = await call("POST", "/api/singers/import", { text: "Navn;Kallenavn;Stemme;Høyde\nImp Ortert;Imp;S;175\nFeil Gruppe;;Q;170" });
  assert.equal(r.json.added, 1);
  assert.equal(r.json.skipped.length, 1);
  for (const name of ["Test Sanger", "Imp Ortert"]) {
    const id = r.json.singers.find((x) => x.fullName === name).id;
    assert.equal((await call("DELETE", `/api/singers/${id}`)).status, 200);
  }
});

let newConcertId;
await step("konsert: opprett (alle aktive deltar), oppmøte, scener", async () => {
  const v = boot.venues[0];
  let r = await call("POST", "/api/concerts", { name: "Testkonsert", date: "2027-01-01", venueId: v.id, stageWidth: v.widthM, stageDepth: v.depthM });
  assert.equal(r.status, 201);
  newConcertId = r.json.id;
  r = await call("GET", `/api/concerts/${newConcertId}`);
  assert.equal(r.json.attendingIds.length, 32);
  assert.equal(r.json.scenes.length, 1);
  assert.equal(r.json.scenes[0].placements.length, 32);

  const absent = r.json.attendingIds[0];
  r = await call("PUT", `/api/concerts/${newConcertId}/attendance`, { singerId: absent, attending: false });
  assert.equal(r.json.attendingIds.length, 31);
  assert.ok(!r.json.scenes[0].placements.some((p) => p.singerId === absent));
  r = await call("PUT", `/api/concerts/${newConcertId}/attendance`, { singerId: absent, attending: true });
  assert.equal(r.json.scenes[0].placements.length, 32);

  r = await call("POST", `/api/concerts/${newConcertId}/scenes`, { title: "Sang 2", copy: true });
  assert.equal(r.status, 201);
  assert.equal(r.json.scenes.length, 2);
  const sceneId = r.json.sceneId;
  const scene = r.json.scene;
  const placements = scene.placements.map((p, i) => (i === 0 ? { ...p, status: "solo" } : p));
  r = await call("PUT", `/api/scenes/${sceneId}`, { title: "Sang 2b", settings: { ...scene.settings, choirWidthPct: 70, shape: "arc", arc: 60, singerSpacing: 80 }, placements });
  assert.equal(r.json.scene.title, "Sang 2b");
  assert.equal(r.json.scene.settings.choirWidthPct, 70);
  assert.equal(r.json.scene.placements[0].status, "solo");
  r = await call("POST", "/api/templates", { name: "Testmal", sceneId });
  assert.equal(r.status, 201);
  const tpl = r.json.templates.find((t) => t.name === "Testmal");
  assert.ok(tpl);
  assert.equal((await call("DELETE", `/api/templates/${tpl.id}`)).status, 200);
  r = await call("DELETE", `/api/scenes/${sceneId}`);
  assert.equal(r.json.scenes.length, 1);
  r = await call("DELETE", `/api/scenes/${r.json.scenes[0].id}`);
  assert.equal(r.status, 409);
});

await step("backup → endre → gjenopprett", async () => {
  const b = await call("GET", "/api/backup");
  assert.equal(b.status, 200);
  const backup = JSON.parse(b.text);
  assert.equal(backup.app, "mixup");
  assert.ok(backup.concerts.some((c) => c.name === "Testkonsert"));
  assert.equal((await call("DELETE", `/api/concerts/${newConcertId}`)).status, 200);
  assert.ok(!(await call("GET", "/api/bootstrap")).json.concerts.some((c) => c.name === "Testkonsert"));
  assert.equal((await call("POST", "/api/restore", backup)).status, 200);
  assert.ok((await call("GET", "/api/bootstrap")).json.concerts.some((c) => c.name === "Testkonsert"));
  assert.equal((await call("POST", "/api/restore", { app: "annet" })).status, 400);
  // rydd opp
  const after = (await call("GET", "/api/bootstrap")).json.concerts.find((c) => c.name === "Testkonsert");
  await call("DELETE", `/api/concerts/${after.id}`);
});

await step("utlogging", async () => {
  const r = await call("DELETE", "/api/auth");
  assert.equal(r.status, 200);
  cookie = "";
  assert.equal((await call("GET", "/api/auth")).json.admin, false);
});

console.log(`\n${n} steg OK`);
