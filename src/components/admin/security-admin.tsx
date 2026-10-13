"use client";

import { useState } from "react";
import { KeyRound, RotateCcw, ShieldCheck } from "lucide-react";
import { api } from "@/lib/client/api";
import { useToast } from "../toast";
import { ChangePasswordDialog } from "../change-password-dialog";

export function SecurityAdmin({
  superadmin,
  onPasswordChanged,
}: {
  superadmin: boolean;
  onPasswordChanged: () => void;
}) {
  const toast = useToast();
  const [showChange, setShowChange] = useState(false);
  const [busy, setBusy] = useState(false);

  const resetConductor = async () => {
    if (
      !window.confirm(
        "Er du sikker på at du vil tilbakestille dirigentens passord til 1234? Dirigenten må opprette et nytt passord ved neste innlogging.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; message: string }>("POST", "/api/auth/reset-conductor");
      toast(res.message, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Kunne ikke tilbakestille", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-accent" />
          <h2 className="text-base font-semibold">Din tilgang</h2>
          <span className="chip ml-auto border-accent/40 bg-accent/10 font-semibold text-accent">
            {superadmin ? "Super-Admin" : "Dirigent"}
          </span>
        </div>
        <p className="text-sm text-muted">
          {superadmin
            ? "Du er logget inn som administrator med full tilgang til alle funksjoner, inkludert passordhåndtering for dirigenten."
            : "Du er logget inn som dirigent med tilgang til å opprette konserter, endre sceneoppstillinger og administrere koret."}
        </p>
        <div>
          <button className="btn btn-primary" onClick={() => setShowChange(true)}>
            <KeyRound className="h-4 w-4" /> Endre mitt passord
          </button>
        </div>
      </div>

      {superadmin && (
        <div className="card space-y-3 border-line p-4">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-amber-500" />
            <h2 className="text-base font-semibold">Tilbakestill dirigentpassord</h2>
          </div>
          <p className="text-sm text-muted">
            Dersom dirigenten har glemt passordet sitt, kan du tilbakestille det til standardkoden{" "}
            <strong>1234</strong>. Dirigenten vil automatisk bli pålagt å opprette et nytt passord ved neste
            innlogging.
          </p>
          <div>
            <button className="btn" disabled={busy} onClick={resetConductor}>
              <RotateCcw className="h-4 w-4" /> Tilbakestill dirigentpassord til 1234
            </button>
          </div>
        </div>
      )}

      {showChange && (
        <ChangePasswordDialog
          role={superadmin ? "superadmin" : "conductor"}
          isMandatory={false}
          onSuccess={() => {
            setShowChange(false);
            onPasswordChanged();
          }}
          onClose={() => setShowChange(false)}
        />
      )}
    </div>
  );
}
