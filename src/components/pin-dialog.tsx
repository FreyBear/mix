"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { api } from "@/lib/client/api";
import { Modal } from "./modal";

export function PinDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/api/auth", { pin });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noe gikk galt");
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Dirigentlås" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-muted">Skriv inn PIN-koden for å redigere oppstillinger og administrere koret.</p>
        <div>
          <label className="label" htmlFor="pin">
            PIN
          </label>
          <input
            id="pin"
            className="input text-center text-2xl tracking-[0.5em]"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            aria-invalid={!!error}
          />
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
