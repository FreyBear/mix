import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  listConcerts,
  listGroups,
  listSingers,
  listTemplates,
  listVenues,
} from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const session = await getSession();
  const admin = !!session;
  const superadmin = session?.role === "superadmin";
  const mustChangePassword = session?.mustChangePassword ?? false;

  return NextResponse.json({
    admin,
    superadmin,
    mustChangePassword,
    role: session?.role ?? "none",
    groups: listGroups(db),
    // Høyde er kun for dirigent/admin: sendes ikke til vanlige sangere (0 = skjult).
    singers: listSingers(db).map((s) => (admin ? s : { ...s, height: 0 })),
    venues: listVenues(db),
    concerts: listConcerts(db),
    templates: listTemplates(db),
  });
}
