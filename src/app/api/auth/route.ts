import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  clientKey,
  getSession,
  isLocked,
  registerFailure,
  registerSuccess,
  sessionCookie,
  verifyLogin,
} from "@/lib/auth";
import { bad, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  return NextResponse.json({
    admin: !!s,
    superadmin: s?.role === "superadmin",
    role: s?.role ?? "none",
    mustChangePassword: s?.mustChangePassword ?? false,
  });
}

export async function POST(req: Request) {
  const key = await clientKey();
  const wait = isLocked(key);
  if (wait > 0) return bad(`For mange forsøk. Prøv igjen om ${wait} sekunder.`, 429);
  const body = await readBody(req);
  const pin =
    typeof body.pin === "string"
      ? body.pin
      : typeof body.password === "string"
        ? body.password
        : "";
  const result = verifyLogin(pin);
  if (!result.success || !result.role) {
    registerFailure(key);
    return bad("Feil passord/PIN", 401);
  }
  registerSuccess(key);
  const c = sessionCookie(result.role);
  const res = NextResponse.json({
    admin: true,
    superadmin: result.role === "superadmin",
    role: result.role,
    mustChangePassword: result.mustChangePassword ?? false,
  });
  res.cookies.set(c.name, c.value, c.options);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ admin: false, superadmin: false, role: "none" });
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
