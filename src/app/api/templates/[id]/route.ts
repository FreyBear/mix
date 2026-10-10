import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bad, ok, parseId } from "@/lib/http";
import { listTemplates } from "@/lib/repo";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (!id) return bad("Ugyldig id");
  const db = getDb();
  db.prepare("DELETE FROM templates WHERE id = ?").run(id);
  return ok({ templates: listTemplates(db) });
}
