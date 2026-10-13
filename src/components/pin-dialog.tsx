"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { api } from "@/lib/client/api";
import { Modal } from "./modal";

export interface AuthSuccessPayload {
  role: "conductor" | "superadmin";
  mustChangePassword: boolean;
}

export function PinDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (auth?: AuthSuccessPayload) => void;
}) {
  const [pin, setPin] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        admin: boolean;
        superadmin: boolean;
        role: "conductor" | "superadmin";
        mustChangePassword: boolean;
      }>("POST", "/api/auth", { pin });
      onSuccess({ role: res.role, mustChangePassword: res.mustChangePassword });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noe gikk galt");
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Dirigent- og adminlås" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-muted">
          Skriv inn dirigent- eller adminpassord for å redigere oppstillinger og administrere koret.
        </p>
        <div>
          <label className="label" htmlFor="pin">
            Passord / PIN
          </label>
          <div className="relative">
            <input
              id="pin"
              className="input pr-10 text-center text-xl"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              aria-invalid={!!error}
              placeholder="••••"
            />
            <button
              type="button"
              className="btn-icon absolute top-1/2 right-1.5 h-7 w-7 -translate-y-1/2 border-none bg-transparent shadow-none"
              onClick={() => setShow((s) => !s)}
              tabIndex={-1}
              aria-label={show ? "Skjul passord" : "Vis passord"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || pin.length === 0}>
          <Lock className="h-4 w-4" /> Lås opp
        </button>
      </form>
    </Modal>
  );
}
