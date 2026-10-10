"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { formatDate } from "@/lib/client/format";
import type { Concert, Scene, Singer, Venue, VoiceGroup } from "@/lib/types";
import { AttendanceDialog } from "../attendance-dialog";
import { Modal } from "../modal";
import { useToast } from "../toast";

interface Draft {
  id?: number;
  name: string;
  date: string;
  venueId: number | null;
  stageWidth: string;
  stageDepth: string;
}

function ConcertForm({
  draft,
  venues,
  onClose,
  onSaved,
}: {
  draft: Draft;
  venues: Venue[];
  onClose: () => void;
  onSaved: (c: Concert[]) => void;
}) {
  const toast = useToast();
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);

  const pickVenue = (value: string) => {
    if (value === "") {
      setD({ ...d, venueId: null });
      return;
    }
    const v = venues.find((x) => x.id === Number(value));
    if (v) setD({ ...d, venueId: v.id, stageWidth: String(v.widthM), stageDepth: String(v.depthM) });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        name: d.name,
        date: d.date || null,
        venueId: d.venueId,
        stageWidth: Number(d.stageWidth),
        stageDepth: Number(d.stageDepth),
      };
      const res = d.id
        ? await api<{ concerts: Concert[] }>("PUT", `/api/concerts/${d.id}`, body)
        : await api<{ concerts: Concert[] }>("POST", "/api/concerts", body);
      onSaved(res.concerts);
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kunne ikke lagre", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={d.id ? "Rediger konsert" : "Ny konsert"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="c-name">
            Navn
          </label>
          <input id="c-name" className="input" required autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Vårkonsert" />
        </div>
        <div>
          <label className="label" htmlFor="c-date">
            Dato
          </label>
          <input id="c-date" className="input" type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="c-venue">
            Lokasjon
          </label>
          <select id="c-venue" className="input" value={d.venueId ?? ""} onChange={(e) => pickVenue(e.target.value)}>
            <option value="">Egendefinerte mål</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.widthM} × {v.depthM} m)
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="c-w">
              Scenebredde (m)
            </label>
            <input id="c-w" className="input" type="number" step="0.1" min={2} max={80} required value={d.stageWidth} onChange={(e) => setD({ ...d, stageWidth: e.target.value, venueId: null })} />
          </div>
          <div>
            <label className="label" htmlFor="c-d">
              Scenedybde (m)
            </label>
            <input id="c-d" className="input" type="number" step="0.1" min={2} max={60} required value={d.stageDepth} onChange={(e) => setD({ ...d, stageDepth: e.target.value, venueId: null })} />
          </div>
        </div>
        {!d.id && <p className="text-xs text-muted">Alle aktive korister deltar som standard. Du kan hake bort de som har meldt forfall etterpå.</p>}
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

export function ConcertsAdmin({
  concerts,
  venues,
  singers,
  groups,
  onChange,
}: {
  concerts: Concert[];
  venues: Venue[];
  singers: Singer[];
  groups: VoiceGroup[];
  onChange: (c: Concert[]) => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [attendance, setAttendance] = useState<{ concert: Concert; ids: number[] } | null>(null);

  const openAttendance = async (c: Concert) => {
    try {
      const res = await api<{ attendingIds: number[]; scenes: Scene[] }>("GET", `/api/concerts/${c.id}`);
      setAttendance({ concert: c, ids: res.attendingIds });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Kunne ikke hente oppmøte", "error");
    }
  };

  const remove = async (c: Concert) => {
    if (!window.confirm(`Slette konserten «${c.name}» med alle sanger og oppstillinger?`)) return;
    try {
      const res = await api<{ concerts: Concert[] }>("DELETE", `/api/concerts/${c.id}`);
      onChange(res.concerts);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Kunne ikke slette", "error");
    }
  };

  const newDraft = (): Draft => {
    const v = venues[0];
    return {
      name: "",
      date: "",
      venueId: v?.id ?? null,
      stageWidth: String(v?.widthM ?? 10),
      stageDepth: String(v?.depthM ?? 6),
    };
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">Sanger og oppstillinger redigeres i hovedvisningen (blyantikonet).</p>
        <button className="btn btn-primary shrink-0" onClick={() => setEditing(newDraft())}>
          <Plus className="h-4 w-4" /> Ny konsert
        </button>
      </div>
      <ul className="space-y-2">
        {concerts.map((c) => (
          <li key={c.id} className="card flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{c.name}</div>
              <div className="text-sm text-muted">
                {c.date ? formatDate(c.date) : "Uten dato"} · {venues.find((v) => v.id === c.venueId)?.name ?? "Egendefinert scene"} · {c.stageWidth} × {c.stageDepth} m
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn" onClick={() => void openAttendance(c)}>
                <ListChecks className="h-4 w-4" /> Deltakelse
              </button>
              <Link className="btn" href={`/?c=${c.id}`}>
                <ExternalLink className="h-4 w-4" /> Åpne
              </Link>
              <button className="btn-icon" aria-label={`Rediger ${c.name}`} onClick={() => setEditing({ id: c.id, name: c.name, date: c.date ?? "", venueId: c.venueId, stageWidth: String(c.stageWidth), stageDepth: String(c.stageDepth) })}>
                <Pencil className="h-4 w-4" />
              </button>
              <button className="btn-icon text-danger" aria-label={`Slett ${c.name}`} onClick={() => void remove(c)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
        {concerts.length === 0 && <li className="text-sm text-muted">Ingen konserter ennå.</li>}
      </ul>

      {editing && <ConcertForm draft={editing} venues={venues} onClose={() => setEditing(null)} onSaved={onChange} />}
      {attendance && (
        <AttendanceDialog
          concert={attendance.concert}
          singers={singers}
          groups={groups}
          attendingIds={attendance.ids}
          onClose={() => setAttendance(null)}
          onUpdated={(u) => setAttendance((cur) => (cur ? { ...cur, ids: u.attendingIds } : cur))}
        />
      )}
    </div>
  );
}
