import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
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
  return NextResponse.json({
    admin: await isAdmin(),
    groups: listGroups(db),
    singers: listSingers(db),
    venues: listVenues(db),
    concerts: listConcerts(db),
    templates: listTemplates(db),
  });
}
