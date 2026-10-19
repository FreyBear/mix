import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, ok, readBody, str } from "@/lib/http";
import { listAllPresets, saveCustomPreset } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  return ok({ presets: listAllPresets(db) });
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const b = await readBody(req);
  const name = str(b.name, 100);
  if (!name) return bad("Navn på forvalg kreves");

  const groupOrder = Array.isArray(b.groupOrder)
    ? b.groupOrder.map(Number).filter(Number.isInteger)
    : [];

  const db = getDb();
  saveCustomPreset(db, {
    id: typeof b.id === "string" && b.id.trim() ? b.id.trim() : `custom-${Date.now()}`,
    name,
    type: b.type === "mixed" ? "mixed" : "blocks",
    groupOrder,
  });

  return ok({ presets: listAllPresets(db) }, 201);
}
