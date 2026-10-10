import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  checkPin,
  clientKey,
  isAdmin,
  isLocked,
  registerFailure,
  registerSuccess,
  sessionCookie,
} from "@/lib/auth";
import { bad, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ admin: await isAdmin() });
}

export async function POST(req: Request) {
  const key = await clientKey();
  const wait = isLocked(key);
  if (wait > 0) return bad(`For mange forsøk. Prøv igjen om ${wait} sekunder.`, 429);
  const body = await readBody(req);
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!checkPin(pin)) {
    registerFailure(key);
    return bad("Feil PIN", 401);
  }
  registerSuccess(key);
  const c = sessionCookie();
  const res = NextResponse.json({ admin: true });
  res.cookies.set(c.name, c.value, c.options);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ admin: false });
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
