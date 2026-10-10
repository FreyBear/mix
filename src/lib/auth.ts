import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

export const ADMIN_COOKIE = "mixup_admin";
const MAX_AGE_S = 60 * 60 * 12;

const pin = () => process.env.ADMIN_PIN ?? "1234";
const secret = () => process.env.SESSION_SECRET ?? `mixup-session:${pin()}`;

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function adminToken(): string {
  return sign(`admin:${pin()}`);
}

export function checkPin(input: string): boolean {
  return safeEqual(sign(`pin:${input}`), sign(`pin:${pin()}`));
}

export function sessionCookie() {
  return {
    name: ADMIN_COOKIE,
    value: adminToken(),
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.COOKIE_SECURE === "true",
      path: "/",
      maxAge: MAX_AGE_S,
    },
  };
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(ADMIN_COOKIE)?.value;
  return !!value && safeEqual(value, adminToken());
}

/** Returnerer en 401-respons hvis brukeren ikke er innlogget som dirigent/admin. */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (await isAdmin()) return null;
  return NextResponse.json({ error: "Krever dirigent-PIN" }, { status: 401 });
}

// Enkel begrensning mot gjetting av PIN (per IP, i minnet).
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
