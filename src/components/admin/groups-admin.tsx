"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { contrastText } from "@/lib/client/format";
import { VOICE_PROFILES } from "@/lib/profiles";
import type { VoiceGroup } from "@/lib/types";
import { useToast } from "../toast";

export function ColorField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(value);
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label={`${label} (fargevelger)`}
        className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-surface p-1"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#888888"}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
      />
      <input
        aria-label={`${label} (hex)`}
        className="input w-28 font-mono"
        value={text}
        maxLength={7}
        onChange={(e) => {
          setText(e.target.value);
          if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase());
        }}
      />
    </div>
  );
}

function GroupRow({
  group,
  index,
  count,
  onSaved,
  onMove,
}: {
  group: VoiceGroup;
  index: number;
  count: number;
  onSaved: (groups: VoiceGroup[]) => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(group.name);
  const [abbr, setAbbr] = useState(group.abbr);
  const [color, setColor] = useState(group.color);
  const dirty = name !== group.name || abbr !== group.abbr || color !== group.color;

  const save = async () => {
    try {
      const res = await api<{ groups: VoiceGroup[] }>("PUT", `/api/groups/${group.id}`, { name, abbr, color });
      onSaved(res.groups);
      toast("Stemmegruppen er lagret", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Kunne ikke lagre", "error");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Slette stemmegruppen «${group.name}»?`)) return;
    try {
      const res = await api<{ groups: VoiceGroup[] }>("DELETE", `/api/groups/${group.id}`);
      onSaved(res.groups);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Kunne ikke slette", "error");
    }
  };

  return (
    <li className="card flex flex-wrap items-end gap-3 p-3">
      <span
        className="flex h-10 w-14 shrink-0 items-center justify-center rounded-[50%] text-sm font-bold"
        style={{ background: color, color: contrastText(color) }}
        aria-hidden
      >
        {abbr}
      </span>
      <div className="min-w-32 flex-1">
        <label className="label">Navn</label>
        <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="w-24">
        <label className="label">Forkortelse</label>
        <input className="input" value={abbr} maxLength={8} onChange={(e) => setAbbr(e.target.value)} />
      </div>
      <div>
        <label className="label">Farge</label>
        <ColorField label={`Farge for ${group.name}`} value={color} onChange={setColor} />
      </div>
      <div className="flex gap-1">
        <button className="btn-icon" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Flytt opp">
          <ArrowUp className="h-4 w-4" />
        </button>
        <button className="btn-icon" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Flytt ned">
          <ArrowDown className="h-4 w-4" />
        </button>
        <button className="btn btn-primary" onClick={save} disabled={!dirty || !name.trim() || !abbr.trim()}>
          <Save className="h-4 w-4" /> Lagre
        </button>
        <button className="btn-icon text-danger" onClick={remove} aria-label={`Slett ${group.name}`}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

export function GroupsAdmin({
  groups,
  onChange,
}: {
  groups: VoiceGroup[];
  onChange: (g: VoiceGroup[]) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [abbr, setAbbr] = useState("");
  const [color, setColor] = useState("#6366f1");
  const sorted = [...groups].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api<{ groups: VoiceGroup[] }>("POST", "/api/groups", { name, abbr, color });
      onChange(res.groups);
      setName("");
      setAbbr("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kunne ikke opprette", "error");
    }
  };

  const addProfile = async (profile: string) => {
    try {
      const res = await api<{ groups: VoiceGroup[] }>("POST", "/api/groups/profile", { profile });
      onChange(res.groups);
      toast(`La til manglende grupper fra ${profile}`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Feilet", "error");
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const ids = sorted.map((g) => g.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    try {
      const res = await api<{ groups: VoiceGroup[] }>("POST", "/api/groups/profile", { order: ids });
      onChange(res.groups);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Feilet", "error");
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Rekkefølgen bestemmer hvilken stemmegruppe som står lengst til venstre (sett fra salen) i auto-sortering.
      </p>
      <ul className="space-y-2">
        {sorted.map((g, i) => (
          <GroupRow key={`${g.id}-${g.name}-${g.abbr}-${g.color}`} group={g} index={i} count={sorted.length} onSaved={onChange} onMove={(d) => void move(i, d)} />
        ))}
      </ul>

      <form onSubmit={add} className="card flex flex-wrap items-end gap-3 p-3">
        <div className="min-w-32 flex-1">
          <label className="label" htmlFor="g-name">
            Ny stemmegruppe
          </label>
          <input id="g-name" className="input" placeholder="Navn, f.eks. Bass 2" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="w-24">
          <label className="label" htmlFor="g-abbr">
            Forkortelse
          </label>
          <input id="g-abbr" className="input" placeholder="B2" maxLength={8} value={abbr} onChange={(e) => setAbbr(e.target.value)} />
        </div>
        <div>
          <label className="label">Farge</label>
          <ColorField label="Farge for ny gruppe" value={color} onChange={setColor} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={!name.trim() || !abbr.trim()}>
          <Plus className="h-4 w-4" /> Legg til
        </button>
      </form>

      <div className="card p-3">
        <h3 className="mb-2 text-sm font-semibold">Standardprofiler</h3>
        <p className="mb-2 text-sm text-muted">Legger til manglende grupper med ferdige farger. Alt kan endres etterpå.</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(VOICE_PROFILES).map(([key, p]) => (
            <button key={key} className="btn" onClick={() => void addProfile(key)}>
              <span className="flex gap-0.5">
                {p.groups.map((g) => (
                  <span key={g.abbr} className="h-3 w-3 rounded-full" style={{ background: g.color }} />
                ))}
              </span>
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
