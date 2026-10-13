import { requireSuperAdmin, resetConductorPassword } from "@/lib/auth";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  resetConductorPassword();

  return ok({
    ok: true,
    message: "Dirigentpassordet er tilbakestilt til 1234. Dirigenten vil bli bedt om å velge et nytt passord ved neste innlogging.",
  });
}
