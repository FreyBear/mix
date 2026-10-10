"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { api } from "@/lib/client/api";
import { useToast } from "../toast";

export function BackupAdmin({ onRestored }: { onRestored: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const restore = async (file: File) => {
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      toast("Filen er ikke gyldig JSON", "error");
      return;
    }
    if (!window.confirm("Gjenopprette fra denne filen? ALL eksisterende data erstattes.")) return;
    setBusy(true);
    try {
      await api("POST", "/api/restore", json);
      toast("Sikkerhetskopien er gjenopprettet", "success");
      onRestored();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gjenoppretting feilet", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-2 p-4">
        <h3 className="font-semibold">Last ned backup (JSON)</h3>
        <p className="text-sm text-muted">Inneholder stemmegrupper, sangere, lokasjoner, konserter, oppmøte, sanger og maler.</p>
        <a className="btn btn-primary" href="/api/backup" download>
          <Download className="h-4 w-4" /> Last ned backup
        </a>
      </div>
      <div className="card space-y-2 p-4">
        <h3 className="font-semibold">Gjenopprett fra JSON</h3>
        <p className="text-sm text-muted">Velg en tidligere backup-fil. Dette erstatter alle data i appen.</p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void restore(f);
            e.target.value = "";
          }}
        />
        <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> Gjenopprett fra fil
        </button>
      </div>
    </div>
  );
}
