"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound, ShieldAlert } from "lucide-react";
import { api } from "@/lib/client/api";
import { Modal } from "./modal";
import { useToast } from "./toast";

interface ChangePasswordDialogProps {
  role: "conductor" | "superadmin";
  isMandatory?: boolean;
  onSuccess: () => void;
  onClose: () => void;
}

export function ChangePasswordDialog({
  role,
  isMandatory = false,
  onSuccess,
  onClose,
}: ChangePasswordDialogProps) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const title = role === "superadmin" ? "Opprett sikkert adminpassord" : "Opprett sikkert dirigentpassord";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = password.trim();
    if (trimmed.length < 4) {
      setError("Passordet må ha minst 4 tegn.");
      return;
    }

    if (role === "conductor" && trimmed === "1234") {
      setError("Du kan ikke bruke standardpassordet 1234. Velg et personlig passord.");
      return;
    }

    if (role === "superadmin" && trimmed === "987654321") {
      setError("Du kan ikke bruke standardpassordet 987654321. Velg et personlig passord.");
      return;
    }

    if (trimmed !== confirm.trim()) {
      setError("Passordene matcher ikke.");
      return;
    }

    setBusy(true);
    try {
      await api("POST", "/api/auth/change-password", { newPassword: trimmed });
      toast(
        role === "superadmin"
          ? "Adminpassordet er oppdatert!"
          : "Dirigentpassordet er oppdatert!",
        "success",
      );
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke endre passord.");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (isMandatory) {
      // Hvis obligatorisk bytte avbrytes, må brukeren logges ut så de ikke omgår kravet
      try {
        await api("DELETE", "/api/auth");
      } catch {
        /* ignorer */
      }
    }
    onClose();
  };

  return (
    <Modal title={title} onClose={handleCancel}>
      <form onSubmit={submit} className="space-y-4">
        {isMandatory && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Du er logget inn med standardkoden (
              <strong>{role === "superadmin" ? "987654321" : "1234"}</strong>). For å
              beskytte koret mot uautorisert tilgang på internett må du opprette et personlig
              passord eller en passfrase før du kan fortsette.
            </span>
          </div>
        )}

        <div>
          <label className="label" htmlFor="new-password">
            Nytt passord
          </label>
          <div className="relative">
            <input
              id="new-password"
              className="input pr-10 text-base"
              type={show ? "text" : "password"}
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minst 4 tegn"
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

        <div>
          <label className="label" htmlFor="confirm-password">
            Gjenta nytt passord
          </label>
          <input
            id="confirm-password"
            className="input text-base"
            type={show ? "text" : "password"}
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Gjenta det nye passordet"
          />
        </div>

        {error && (
          <p role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={handleCancel}>
            {isMandatory ? "Avbryt og logg ut" : "Avbryt"}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || password.length === 0 || confirm.length === 0}
          >
            <KeyRound className="h-4 w-4" /> Lagre passord
          </button>
        </div>
      </form>
    </Modal>
  );
}
