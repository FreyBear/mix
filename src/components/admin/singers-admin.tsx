"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { contrastText } from "@/lib/client/format";
import type { Singer, VoiceGroup } from "@/lib/types";
import {
  compareVoiceGroups,
  groupVoiceGroupsByFamily,
  matchesGroupFilter,
} from "@/lib/voice-family";
import { Modal } from "../modal";
import { useToast } from "../toast";

interface Draft {
  id?: number;
  fullName: string;
  nickname: string;
  voiceGroupId: number;
  height: string;
  isActive: boolean;
}

function SingerForm({
  draft,
  groups,
  onClose,
  onSaved,
}: {
  draft: Draft;
  groups: VoiceGroup[];
  onClose: () => void;
  onSaved: (s: Singer[]) => void;
}) {
  const toast = useToast();
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const groupedFamilies = useMemo(() => groupVoiceGroupsByFamily(groups), [groups]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        fullName: d.fullName,
        nickname: d.nickname || d.fullName.split(/\s+/)[0],
        voiceGroupId: d.voiceGroupId,
        height: Number(d.height),
        isActive: d.isActive,
      };
      const res = d.id
        ? await api<{ singers: Singer[] }>("PUT", `/api/singers/${d.id}`, body)
        : await api<{ singers: Singer[] }>("POST", "/api/singers", body);
      onSaved(res.singers);
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kunne ikke lagre", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={d.id ? "Rediger sanger" : "Ny sanger"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="s-full">
            Fullt navn
          </label>
          <input id="s-full" className="input" required autoFocus value={d.fullName} onChange={(e) => setD({ ...d, fullName: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="s-nick">
            Kallenavn / kortnavn (vises i scenekartet)
          </label>
          <input
            id="s-nick"
            className="input"
            maxLength={30}
            placeholder={d.fullName.split(/\s+/)[0] || "Fornavn"}
            value={d.nickname}
            onChange={(e) => setD({ ...d, nickname: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="s-group">
              Stemmegruppe
            </label>
            <select id="s-group" className="input" value={d.voiceGroupId} onChange={(e) => setD({ ...d, voiceGroupId: Number(e.target.value) })}>
              {groupedFamilies.map(({ family, groups: fGroups }) => (
                <optgroup key={family.key} label={family.label}>
                  {fGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.abbr})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="s-height">
              Høyde (cm)
            </label>
            <input id="s-height" className="input" type="number" min={100} max={250} required value={d.height} onChange={(e) => setD({ ...d, height: e.target.value })} />
          </div>
        </div>
        <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={d.isActive} onChange={(e) => setD({ ...d, isActive: e.target.checked })} />
          Aktiv i koret
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={onClose}>
            Avbryt
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !d.fullName.trim()}>
            Lagre
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ImportDialog({
  groups,
  onClose,
  onDone,
}: {
  groups: VoiceGroup[];
  onClose: () => void;
  onDone: (s: Singer[]) => void;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [skipped, setSkipped] = useState<{ line: number; text: string; reason: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async () => {
    setBusy(true);
    try {
      const res = await api<{ added: number; skipped: { line: number; text: string; reason: string }[]; singers: Singer[] }>(
        "POST",
        "/api/singers/import",
        { text, replaceExisting },
      );
      onDone(res.singers);
      setSkipped(res.skipped);
      toast(`La til ${res.added} sangere${res.skipped.length ? `, hoppet over ${res.skipped.length}` : ""}`, res.added ? "success" : "error");
      if (res.skipped.length === 0) onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Import feilet", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Importer sangere"
      onClose={onClose}
      wide
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Lukk
          </button>
          <button className="btn btn-primary" onClick={() => void run()} disabled={busy || !text.trim()}>
            Importer
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-muted">
          Lim inn tekst eller velg en CSV-fil. Én sanger per linje:{" "}
          <code className="rounded bg-surface2 px-1">Navn; Kallenavn; Stemmegruppe; Høyde; Aktiv</code>. Skilletegn kan være
          semikolon, komma eller tabulator. Overskriftsrad er valgfri. Stemmegruppe oppgis med forkortelse eller navn (
          {groups.map((g) => g.abbr).join(", ")}).
        </p>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setText(await f.text());
              e.target.value = "";
            }}
          />
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-4 w-4" /> Velg CSV-fil
          </button>
        </div>
        <textarea
          className="input h-52 font-mono text-xs"
          placeholder={"Ola Nordmann; Ola; T; 181\nKari Hansen; Kari; S; 165"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Sangere som tekst"
        />
        <label className="flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs font-medium text-amber-800 dark:text-amber-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-amber-600"
            checked={replaceExisting}
            onChange={(e) => setReplaceExisting(e.target.checked)}
          />
          <span>
            <strong>Erstatt alle eksisterende sangere:</strong> Sletter demodata og tidligere sangere før import.
          </span>
        </label>
        {skipped.length > 0 && (
          <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-2 text-danger">
            <p className="font-semibold">Hoppet over {skipped.length} linje(r):</p>
            <ul className="list-disc pl-5">
              {skipped.map((s) => (
                <li key={s.line}>
                  Linje {s.line}: {s.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

type SortCol = "name" | "nickname" | "voice" | "height" | "status";

export function SingersAdmin({
  singers,
  groups,
  onChange,
}: {
  singers: Singer[];
  groups: VoiceGroup[];
  onChange: (s: Singer[]) => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<number | string>("all");
  const [showInactive, setShowInactive] = useState(true);
  const [sortCol, setSortCol] = useState<SortCol>("voice");
  const [sortAsc, setSortAsc] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [importing, setImporting] = useState(false);

  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const groupedFamilies = useMemo(() => groupVoiceGroupsByFamily(groups), [groups]);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortAsc((prev: boolean) => !prev);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = singers.filter(
    (s) =>
      matchesGroupFilter(s.voiceGroupId, groupFilter, groupMap) &&
      (showInactive || s.isActive) &&
      (!q || s.fullName.toLowerCase().includes(q) || s.nickname.toLowerCase().includes(q)),
  );

  const list = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let diff = 0;
      if (sortCol === "voice") {
        const ga = groupMap.get(a.voiceGroupId);
        const gb = groupMap.get(b.voiceGroupId);
        if (ga && gb) diff = compareVoiceGroups(ga, gb);
        else if (ga) diff = -1;
        else if (gb) diff = 1;
        if (diff === 0) diff = a.fullName.localeCompare(b.fullName, "nb");
      } else if (sortCol === "name") {
        diff = a.fullName.localeCompare(b.fullName, "nb");
      } else if (sortCol === "nickname") {
        diff = a.nickname.localeCompare(b.nickname, "nb");
      } else if (sortCol === "height") {
        diff = a.height - b.height;
      } else if (sortCol === "status") {
        diff = a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1;
      }
      return sortAsc ? diff : -diff;
    });
    return arr;
  }, [filtered, sortCol, sortAsc, groupMap]);

  const remove = async (s: Singer) => {
    if (!window.confirm(`Slette ${s.fullName}? Sangeren fjernes fra alle konserter.`)) return;
    try {
      const res = await api<{ singers: Singer[] }>("DELETE", `/api/singers/${s.id}`);
      onChange(res.singers);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Kunne ikke slette", "error");
    }
  };

  const clearAllSingers = async () => {
    if (!window.confirm("Er du sikker på at du vil slette ALLE sangere? (Dette fjerner demodata/nåværende sangere).")) {
      return;
    }
    try {
      const res = await api<{ singers: Singer[] }>("DELETE", "/api/singers");
      onChange(res.singers);
      toast("Alle sangere er slettet", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Kunne ikke slette", "error");
    }
  };

  const newDraft = (): Draft => ({
    fullName: "",
    nickname: "",
    voiceGroupId: groups[0]?.id ?? 0,
    height: "170",
    isActive: true,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-52" placeholder="Søk" aria-label="Søk" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select
          className="input max-w-56"
          aria-label="Filtrer på stemmegruppe"
          value={String(groupFilter)}
          onChange={(e) => {
            const v = e.target.value;
            setGroupFilter(v === "all" || v.startsWith("family:") ? v : Number(v));
          }}
        >
          <option value="all">Alle stemmer ({singers.length})</option>
          {groupedFamilies.map(({ family, groups: fGroups }) => (
            <optgroup key={family.key} label={family.label}>
              {fGroups.length > 1 && (
                <option value={`family:${family.key}`}>
                  {family.label} (alle)
                </option>
              )}
              {fGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.abbr})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Vis inaktive
        </label>
        <div className="ml-auto flex gap-2">
          {singers.length > 0 && (
            <button className="btn text-danger hover:border-danger/40 hover:bg-danger/10" onClick={() => void clearAllSingers()}>
              <Trash2 className="h-4 w-4" /> Slett alle
            </button>
          )}
          <button className="btn" onClick={() => setImporting(true)}>
            <FileUp className="h-4 w-4" /> Importer
          </button>
          <button className="btn btn-primary" onClick={() => setEditing(newDraft())} disabled={groups.length === 0}>
            <Plus className="h-4 w-4" /> Ny sanger
          </button>
        </div>
      </div>

      <p className="text-sm text-muted">
        {list.length} av {singers.length} sangere · {singers.filter((s) => s.isActive).length} aktive
      </p>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="border-b border-line text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">
                <button
                  type="button"
                  className="flex items-center gap-1 font-medium hover:text-foreground"
                  onClick={() => toggleSort("name")}
                >
                  Navn
                  {sortCol === "name" ? (
                    sortAsc ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                  )}
                </button>
              </th>
              <th className="px-3 py-2 font-medium">
                <button
                  type="button"
                  className="flex items-center gap-1 font-medium hover:text-foreground"
                  onClick={() => toggleSort("nickname")}
                >
                  Kallenavn
                  {sortCol === "nickname" ? (
                    sortAsc ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                  )}
                </button>
              </th>
              <th className="px-3 py-2 font-medium">
                <button
                  type="button"
                  className="flex items-center gap-1 font-medium hover:text-foreground"
                  onClick={() => toggleSort("voice")}
                >
                  Stemme
                  {sortCol === "voice" ? (
                    sortAsc ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                  )}
                </button>
              </th>
              <th className="px-3 py-2 font-medium">
                <button
                  type="button"
                  className="flex items-center gap-1 font-medium hover:text-foreground"
                  onClick={() => toggleSort("height")}
                >
                  Høyde
                  {sortCol === "height" ? (
                    sortAsc ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                  )}
                </button>
              </th>
              <th className="px-3 py-2 font-medium">
                <button
                  type="button"
                  className="flex items-center gap-1 font-medium hover:text-foreground"
                  onClick={() => toggleSort("status")}
                >
                  Status
                  {sortCol === "status" ? (
                    sortAsc ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                  )}
                </button>
              </th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.map((s) => {
              const g = groupMap.get(s.voiceGroupId);
              return (
                <tr key={s.id} className={`border-b border-line last:border-0 ${s.isActive ? "" : "text-muted"}`}>
                  <td className="px-3 py-2">{s.fullName}</td>
                  <td className="px-3 py-2">{s.nickname}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: g?.color ?? "#94a3b8", color: contrastText(g?.color ?? "#94a3b8") }}>
                        {g?.abbr ?? "?"}
                      </span>
                      <span className="text-xs text-muted">({g?.name ?? "?"})</span>
                    </span>
                  </td>
                  <td className="px-3 py-2">{s.height} cm</td>
                  <td className="px-3 py-2">{s.isActive ? "Aktiv" : "Inaktiv"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      className="btn-icon inline-flex h-9 w-9"
                      aria-label={`Rediger ${s.fullName}`}
                      onClick={() => setEditing({ id: s.id, fullName: s.fullName, nickname: s.nickname, voiceGroupId: s.voiceGroupId, height: String(s.height), isActive: s.isActive })}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>{" "}
                    <button className="btn-icon inline-flex h-9 w-9 text-danger" aria-label={`Slett ${s.fullName}`} onClick={() => void remove(s)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted">
                  Ingen sangere funnet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && <SingerForm draft={editing} groups={groups} onClose={() => setEditing(null)} onSaved={onChange} />}
      {importing && <ImportDialog groups={groups} onClose={() => setImporting(false)} onDone={onChange} />}
    </div>
  );
}
