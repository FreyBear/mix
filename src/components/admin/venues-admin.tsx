"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client/api";
import type { Venue } from "@/lib/types";
import { Modal } from "../modal";
import { useToast } from "../toast";

interface Draft {
  id?: number;
  name: string;
  widthM: string;
  depthM: string;
}

function VenueForm({
  draft,
  onClose,
  onSaved,
}: {
  draft: Draft;
  onClose: () => void;
  onSaved: (v: Venue[]) => void;
}) {
  const toast = useToast();
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { name: d.name, widthM: Number(d.widthM), depthM: Number(d.depthM) };
      const res = d.id
        ? await api<{ venues: Venue[] }>("PUT", `/api/venues/${d.id}`, body)
        : await api<{ venues: Venue[] }>("POST", "/api/venues", body);
      onSaved(res.venues);
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kunne ikke lagre", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={d.id ? "Rediger lokasjon" : "Ny lokasjon"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="v-name">
            Navn
          </label>
          <input id="v-name" className="input" required autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Kulturhuset - Hovedscene" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="v-w">
              Bredde (m)
            </label>
            <input id="v-w" className="input" type="number" step="0.1" min={2} max={80} required value={d.widthM} onChange={(e) => setD({ ...d, widthM: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="v-d">
              Dybde (m)
            </label>
            <input id="v-d" className="input" type="number" step="0.1" min={2} max={60} required value={d.depthM} onChange={(e) => setD({ ...d, depthM: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={onClose}>
            Avbryt
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !d.name.trim()}>
            Lagre
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function VenuesAdmin({
  venues,
  onChange,
}: {
  venues: Venue[];
  onChange: (v: Venue[]) => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState<Draft | null>(null);

  const remove = async (v: Venue) => {
    if (!window.confirm(`Slette lokasjonen «${v.name}»? Eksisterende konserter beholder scenemålene sine.`)) return;
    try {
      const res = await api<{ venues: Venue[] }>("DELETE", `/api/venues/${v.id}`);
      onChange(res.venues);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Kunne ikke slette", "error");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">Lagre scener og lokasjoner du bruker ofte. De kan velges når du lager en konsert.</p>
        <button className="btn btn-primary shrink-0" onClick={() => setEditing({ name: "", widthM: "10", depthM: "6" })}>
          <Plus className="h-4 w-4" /> Ny lokasjon
        </button>
      </div>
      <ul className="space-y-2">
        {venues.map((v) => (
          <li key={v.id} className="card flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{v.name}</div>
              <div className="text-sm text-muted">
                {v.widthM} m × {v.depthM} m
              </div>
            </div>
            <button className="btn-icon" aria-label={`Rediger ${v.name}`} onClick={() => setEditing({ id: v.id, name: v.name, widthM: String(v.widthM), depthM: String(v.depthM) })}>
              <Pencil className="h-4 w-4" />
            </button>
            <button className="btn-icon text-danger" aria-label={`Slett ${v.name}`} onClick={() => void remove(v)}>
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {venues.length === 0 && <li className="text-sm text-muted">Ingen lokasjoner ennå.</li>}
      </ul>
      {editing && <VenueForm draft={editing} onClose={() => setEditing(null)} onSaved={onChange} />}
    </div>
  );
}
