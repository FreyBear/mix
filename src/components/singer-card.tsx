"use client";

import { Lock, LockOpen, Mic, Armchair, X, RefreshCw } from "lucide-react";
import type { Placement, Singer, VoiceGroup } from "@/lib/types";
import { contrastText, describeLent } from "@/lib/client/format";

export function SingerCard({
  singer,
  groups,
  placement,
  positionText,
  editMode,
  onClose,
  onSolo,
  onBench,
  onPin,
  onOverride,
}: {
  singer: Singer;
  groups: VoiceGroup[];
  placement: Placement;
  positionText: string;
  editMode: boolean;
  onClose: () => void;
  onSolo: () => void;
  onBench: () => void;
  onPin: () => void;
  onOverride: (groupId: number | null) => void;
}) {
  const home = groups.find((g) => g.id === singer.voiceGroupId);
  const lent = describeLent(singer, placement.overrideGroupId, new Map(groups.map((g) => [g.id, g])));
  const isSolo = placement.status === "solo";
  const isBench = placement.status === "bench";

  return (
    <div className="card pointer-events-auto w-full max-w-md p-3 shadow-xl" role="dialog" aria-label={singer.fullName}>
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-10 w-12 shrink-0 items-center justify-center rounded-[50%] text-xs font-bold"
          style={{ background: home?.color ?? "#94a3b8", color: contrastText(home?.color ?? "#94a3b8") }}
        >
          {home?.abbr ?? "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold">{singer.fullName}</div>
          <div className="text-sm text-muted">
            «{singer.nickname}» · {home?.name ?? "Ukjent stemmegruppe"} · {singer.height} cm
          </div>
          {lent && <div className="mt-0.5 text-sm font-medium text-amber-600 dark:text-amber-400">★ {lent}</div>}
          <div className="mt-0.5 text-sm">{positionText}</div>
        </div>
        <button className="btn-icon h-8 w-8" onClick={onClose} aria-label="Lukk">
          <X className="h-4 w-4" />
        </button>
      </div>

      {editMode && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <div className="grid grid-cols-3 gap-2">
            <button className={`btn ${isSolo ? "btn-primary" : ""}`} onClick={onSolo}>
              <Mic className="h-4 w-4" /> {isSolo ? "Ikke solist" : "Gjør til solist"}
            </button>
            <button className="btn" onClick={onBench}>
              <Armchair className="h-4 w-4" /> {isBench ? "Hent fra benk" : "Send til benk"}
            </button>
            <button className={`btn ${placement.pinned ? "btn-primary" : ""}`} onClick={onPin} disabled={isBench}>
              {placement.pinned ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {placement.pinned ? "Løsne" : "Lås plass"}
            </button>
          </div>
          <div>
            <label className="label flex items-center gap-1" htmlFor="override">
              <RefreshCw className="h-3 w-3" /> Stemmegruppe kun for denne sangen
            </label>
            <select
              id="override"
              className="input"
              value={placement.overrideGroupId ?? ""}
              onChange={(e) => onOverride(e.target.value === "" ? null : Number(e.target.value))}
            >
              <option value="">Fast gruppe ({home?.abbr})</option>
              {groups
                .filter((g) => g.id !== singer.voiceGroupId)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    Synger {g.abbr} ({g.name})
                  </option>
                ))}
            </select>
          </div>
          <p className="text-xs text-muted">
            Trykk på en annen sanger eller tom plass for å bytte/flytte, eller dra sangeren dit.
          </p>
        </div>
      )}
    </div>
  );
}
