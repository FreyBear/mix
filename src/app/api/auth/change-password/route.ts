import { NextResponse } from "next/server";
import { changePassword, getSession, sessionCookie } from "@/lib/auth";
import { bad, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return bad("Krever innlogging", 401);

  const b = await readBody(req);
  const pass = typeof b.newPassword === "string" ? b.newPassword.trim() : "";

  if (pass.length < 4) {
    return bad("Passordet må være minst 4 tegn langt");
  }

  if (session.role === "conductor" && pass === "1234") {
    return bad("Du må velge et annet passord enn standardkoden 1234");
  }

  if (session.role === "superadmin" && pass === "987654321") {
    return bad("Du må velge et annet passord enn standardkoden 987654321");
  }

  changePassword(session.role, pass);

  const c = sessionCookie(session.role);
  const res = NextResponse.json({
    ok: true,
    role: session.role,
    mustChangePassword: false,
  });
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
