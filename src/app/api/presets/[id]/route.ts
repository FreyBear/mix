import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, ok } from "@/lib/http";
import { deleteCustomPreset, listAllPresets } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  if (!id) return bad("ID kreves");

  if (["satb", "tsab", "stba", "mixed"].includes(id)) {
    return bad("Innebygde forvalg kan ikke slettes", 400);
  }

  const db = getDb();
  deleteCustomPreset(db, id);
  return ok({ presets: listAllPresets(db) });
}
