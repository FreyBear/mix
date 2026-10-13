import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "./db";
import type Database from "better-sqlite3";

export type AuthRole = "conductor" | "superadmin";

export const ADMIN_COOKIE = "mixup_admin";
const MAX_AGE_S = 60 * 60 * 12;

type Db = Database.Database;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, expectedHash] = parts;
  const actualHash = scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(actualHash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function ensureAuthConfig(db: Db) {
  const getVal = db.prepare("SELECT value FROM app_config WHERE key = ?");
  const setVal = db.prepare("INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)");
  db.transaction(() => {
    if (!getVal.get("auth_conductor_hash")) {
      const defaultPin = process.env.ADMIN_PIN ?? "1234";
      setVal.run("auth_conductor_hash", hashPassword(defaultPin));
      setVal.run("auth_conductor_must_change", defaultPin === "1234" ? "1" : "0");
    }
    if (!getVal.get("auth_admin_hash")) {
      setVal.run("auth_admin_hash", hashPassword("987654321"));
      setVal.run("auth_admin_must_change", "1");
    }
    if (!getVal.get("auth_secret")) {
      setVal.run("auth_secret", randomBytes(32).toString("hex"));
    }
  })();
}

function secret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try {
    const db = getDb();
    ensureAuthConfig(db);
    const row = db.prepare("SELECT value FROM app_config WHERE key = 'auth_secret'").get() as
      | { value: string }
      | undefined;
    if (row?.value) return row.value;
  } catch {
    /* fallback under oppstart */
  }
  return "mixup-local-secret";
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function makeSessionToken(role: AuthRole): string {
  const db = getDb();
  ensureAuthConfig(db);
  const getVal = (k: string) =>
    (db.prepare("SELECT value FROM app_config WHERE key = ?").get(k) as { value: string } | undefined)?.value;
  const hash = getVal(role === "superadmin" ? "auth_admin_hash" : "auth_conductor_hash") ?? "";
  const stamp = hash.slice(0, 16);
  const sig = sign(`mixup-auth:${role}:${stamp}`);
  return `${role}.${stamp}.${sig}`;
}

export function parseSessionToken(token: string): { role: AuthRole } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [role, stamp, sig] = parts;
  if (role !== "conductor" && role !== "superadmin") return null;
  const db = getDb();
  ensureAuthConfig(db);
  const getVal = (k: string) =>
    (db.prepare("SELECT value FROM app_config WHERE key = ?").get(k) as { value: string } | undefined)?.value;
  const hash = getVal(role === "superadmin" ? "auth_admin_hash" : "auth_conductor_hash") ?? "";
  const expectedStamp = hash.slice(0, 16);
  if (stamp !== expectedStamp) return null;
  const expectedSig = sign(`mixup-auth:${role}:${expectedStamp}`);
  if (!safeEqual(sig, expectedSig)) return null;
  return { role };
}

export function sessionCookie(role: AuthRole = "conductor") {
  return {
    name: ADMIN_COOKIE,
    value: makeSessionToken(role),
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.COOKIE_SECURE === "true",
      path: "/",
      maxAge: MAX_AGE_S,
    },
  };
}

export interface LoginResult {
  success: boolean;
  role?: AuthRole;
  mustChangePassword?: boolean;
}

export function verifyLogin(input: string): LoginResult {
  const db = getDb();
  ensureAuthConfig(db);
  const getVal = (k: string) =>
    (db.prepare("SELECT value FROM app_config WHERE key = ?").get(k) as { value: string } | undefined)?.value;

  // 1. Sjekk om det er admin (standard 987654321 eller endret)
  const adminHash = getVal("auth_admin_hash");
  if (adminHash && verifyPassword(input, adminHash)) {
    const mustChange = getVal("auth_admin_must_change") === "1";
    return { success: true, role: "superadmin", mustChangePassword: mustChange };
  }

  // 2. Sjekk om det er dirigent (standard 1234 eller endret)
  const conductorHash = getVal("auth_conductor_hash");
  if (conductorHash && verifyPassword(input, conductorHash)) {
    const mustChange = getVal("auth_conductor_must_change") === "1";
    return { success: true, role: "conductor", mustChangePassword: mustChange };
  }

  // 3. Fallback for .env ADMIN_PIN hvis eksplisitt satt
  if (process.env.ADMIN_PIN && input === process.env.ADMIN_PIN) {
    return { success: true, role: "conductor", mustChangePassword: false };
  }

  return { success: false };
}

export function changePassword(role: AuthRole, newPassword: string): void {
  const db = getDb();
  ensureAuthConfig(db);
  const hash = hashPassword(newPassword);
  db.transaction(() => {
    db.prepare("INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)").run(
      role === "superadmin" ? "auth_admin_hash" : "auth_conductor_hash",
      hash,
    );
    db.prepare("INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)").run(
      role === "superadmin" ? "auth_admin_must_change" : "auth_conductor_must_change",
      "0",
    );
  })();
}

export function resetConductorPassword(): void {
  const db = getDb();
  ensureAuthConfig(db);
  const hash = hashPassword("1234");
  db.transaction(() => {
    db.prepare("INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)").run(
      "auth_conductor_hash",
      hash,
    );
    db.prepare("INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)").run(
      "auth_conductor_must_change",
      "1",
    );
  })();
}

export function resetAdminPassword(): void {
  const db = getDb();
  ensureAuthConfig(db);
  const hash = hashPassword("987654321");
  db.transaction(() => {
    db.prepare("INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)").run(
      "auth_admin_hash",
      hash,
    );
    db.prepare("INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)").run(
      "auth_admin_must_change",
      "1",
    );
  })();
}

export async function getSession(): Promise<{ role: AuthRole; mustChangePassword: boolean } | null> {
  const store = await cookies();
  const val = store.get(ADMIN_COOKIE)?.value;
  if (!val) return null;
  const parsed = parseSessionToken(val);
  if (!parsed) {
    // Backwards-compat sjekk for eldre tokens
    if (safeEqual(val, sign(`admin:${process.env.ADMIN_PIN ?? "1234"}`))) {
      return { role: "conductor", mustChangePassword: false };
    }
    return null;
  }
  const db = getDb();
  ensureAuthConfig(db);
  const mustChange =
    (db.prepare("SELECT value FROM app_config WHERE key = ?").get(
      parsed.role === "superadmin" ? "auth_admin_must_change" : "auth_conductor_must_change",
    ) as { value: string } | undefined)?.value === "1";
  return { role: parsed.role, mustChangePassword: mustChange };
}

export async function isAdmin(): Promise<boolean> {
  return (await getSession()) !== null;
}

export async function isSuperAdmin(): Promise<boolean> {
  const s = await getSession();
  return s?.role === "superadmin";
}

export async function requireAdmin(): Promise<NextResponse | null> {
  if (await isAdmin()) return null;
  return NextResponse.json({ error: "Krever innlogging" }, { status: 401 });
}

export async function requireSuperAdmin(): Promise<NextResponse | null> {
  if (await isSuperAdmin()) return null;
  return NextResponse.json({ error: "Krever admin-tilgang" }, { status: 403 });
}

// Backwards-compat funksjoner for tester
export function adminToken(): string {
  return makeSessionToken("conductor");
}

export function checkPin(input: string): boolean {
  return verifyLogin(input).success;
}

// Brute-force-begrensning (per IP)
const attempts = new Map<string, { count: number; until: number }>();
const MAX_FAILS = 6;
const LOCK_MS = 60_000;

export async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export function isLocked(key: string): number {
  const a = attempts.get(key);
  if (!a) return 0;
  if (a.until && a.until > Date.now()) return Math.ceil((a.until - Date.now()) / 1000);
  return 0;
}

export function registerFailure(key: string) {
  const a = attempts.get(key) ?? { count: 0, until: 0 };
  a.count += 1;
  if (a.count >= MAX_FAILS) {
    a.until = Date.now() + LOCK_MS;
    a.count = 0;
  }
  attempts.set(key, a);
}

export function registerSuccess(key: string) {
  attempts.delete(key);
}
