import { getDb } from "../src/lib/db";

const db = getDb();

console.log("=== Mixup: Sletter demodata ===");

db.transaction(() => {
  db.prepare("DELETE FROM concert_attendance").run();
  db.prepare("DELETE FROM scenes").run();
  db.prepare("DELETE FROM concerts").run();
  db.prepare("DELETE FROM singers").run();
})();

console.log("✔ Slettet alle sangere, konserter og scener.");
console.log("✔ Stemmegrupper, lokasjoner og passord/tilganger er beholdt.");
console.log("Appen er nå 100 % klar for å importere ditt eget kor!");
