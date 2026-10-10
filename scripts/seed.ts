/**
 * Kjør: npm run db:seed          (fyller bare en tom database)
 *       npm run db:seed -- --reset  (sletter databasefilen og seeder på nytt)
 */
import fs from "node:fs";
import { dbPath, openDb } from "../src/lib/db";
import { seedDatabase } from "../src/lib/seed";

const reset = process.argv.includes("--reset");
const file = dbPath();

if (reset) {
  for (const suffix of ["", "-wal", "-shm"]) {
    if (fs.existsSync(file + suffix)) fs.rmSync(file + suffix);
  }
  console.log(`Slettet ${file}`);
}

const db = openDb(file);
const count = db.prepare("SELECT COUNT(*) AS n FROM voice_groups").get() as { n: number };
if (count.n > 0) {
  console.log("Databasen har allerede data. Bruk --reset for å starte på nytt.");
} else {
  seedDatabase(db);
  console.log(`Seedet ${file}`);
}
db.close();
