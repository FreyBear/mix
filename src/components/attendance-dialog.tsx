"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { useToast } from "./toast";
import { Modal } from "./modal";
import type { Concert, Scene, Singer, VoiceGroup } from "@/lib/types";

interface Updated {
  attendingIds: number[];
  scenes: Scene[];
}

/** Rask sjekkliste for konsertoppmøte: hak vekk de som har meldt forfall. */
export function AttendanceDialog({
  concert,
  singers,
  groups,
  attendingIds,
  onClose,
  onUpdated,
}: {
  concert: Concert;
  singers: Singer[];
  groups: VoiceGroup[];
  attendingIds: number[];
  onClose: () => void;
  onUpdated: (u: Updated) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const attending = useMemo(() => new Set(attendingIds), [attendingIds]);
  const [query, setQuery] = useState("");

  const visible = singers.filter((s) => s.isActive || attending.has(s.id));
  const sortedGroups = [...groups].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const q = query.trim().toLowerCase();
  const matches = (s: Singer) =>
    !q || s.fullName.toLowerCase().includes(q) || s.nickname.toLowerCase().includes(q);

  const send = async (body: unknown) => {
    setBusy(true);
    try {
      const res = await api<Updated>("PUT", `/api/concerts/${concert.id}/attendance`, body);
      onUpdated(res);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Kunne ikke lagre", "error");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (s: Singer) => send({ singerId: s.id, attending: !attending.has(s.id) });
  const setAll = (on: boolean) => send({ attendingIds: on ? visible.map((s) => s.id) : [] });

  return (
    <Modal
      title={`Deltakelse: ${concert.name}`}
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted">
            {attendingIds.length} av {visible.length} deltar
          </span>
          <button className="btn btn-primary" onClick={onClose}>
            Ferdig
          </button>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-56"
          placeholder="Søk i navn"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn" disabled={busy} onClick={() => setAll(true)}>
          Velg alle
        </button>
        <button className="btn" disabled={busy} onClick={() => setAll(false)}>
          Fjern alle
        </button>
      </div>
      <div className="space-y-4">
        {sortedGroups.map((g) => {
          const list = visible.filter((s) => s.voiceGroupId === g.id && matches(s));
          if (list.length === 0) return null;
          const count = list.filter((s) => attending.has(s.id)).length;
          return (
            <section key={g.id}>
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                <span className="h-3 w-3 rounded-full" style={{ background: g.color }} />
                {g.name}
                <span className="text-xs font-normal text-muted">
                  {count}/{list.length}
                </span>
              </h3>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {list.map((s) => (
                  <li key={s.id}>
                    <label
                      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                        attending.has(s.id)
                          ? "border-line bg-surface"
                          : "border-danger/40 bg-danger/5 text-muted line-through"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[var(--accent)]"
                        checked={attending.has(s.id)}
                        disabled={busy}
                        onChange={() => toggle(s)}
                      />
                      <span className="flex-1">
                        {s.fullName}
                        {s.nickname !== s.fullName.split(" ")[0] && (
                          <span className="text-muted"> «{s.nickname}»</span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
