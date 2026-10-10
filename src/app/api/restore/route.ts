import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { restoreBackup } from "@/lib/backup";
import { bad, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Ugyldig JSON");
  }
  try {
    restoreBackup(getDb(), body);
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Kunne ikke gjenopprette", 400);
  }
  return ok();
}
