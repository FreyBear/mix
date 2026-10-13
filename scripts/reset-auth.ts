import { ensureAuthConfig, resetAdminPassword, resetConductorPassword } from "../src/lib/auth";
import { getDb } from "../src/lib/db";

const args = process.argv.slice(2);
const resetConductorOnly = args.includes("--conductor");
const resetAdminOnly = args.includes("--admin");
const resetBoth = args.includes("--both") || (!resetConductorOnly && !resetAdminOnly);

const db = getDb();
ensureAuthConfig(db);

console.log("=== Mixup Autentisering: Tilbakestilling av passord ===");

if (resetConductorOnly || resetBoth) {
  resetConductorPassword();
  console.log("✔ Dirigentpassord er tilbakestilt til: 1234");
  console.log("  Dirigenten vil bli pålagt å opprette et nytt passord ved neste innlogging.");
}

if (resetAdminOnly || resetBoth) {
  resetAdminPassword();
  console.log("✔ Adminpassord er tilbakestilt til: 987654321");
  console.log("  Admin vil bli pålagt å opprette et nytt passord ved neste innlogging.");
}

console.log("Alle aktive økter er automatisk ugyldiggjort.");
console.log("Ferdig!");
