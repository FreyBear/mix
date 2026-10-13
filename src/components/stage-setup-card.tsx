"use client";

import { useState } from "react";
import { ArrowDownAZ, X } from "lucide-react";
import type { SceneSettings, SoloLayout } from "@/lib/types";

interface StageSetupCardProps {
  settings: SceneSettings;
  onSettings: (patch: Partial<SceneSettings>) => void;
  onAutoSort: () => void;
  onClose: () => void;
}

export function StageSetupCard({
  settings: s,
  onSettings,
  onAutoSort,
  onClose,
}: StageSetupCardProps) {
  const [tab, setTab] = useState<"setup" | "solo">("setup");
  const spacing = s.singerSpacing ?? 75;

  return (
    <div
      className="card pointer-events-auto w-full max-w-sm sm:max-w-md p-3.5 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-150"
      role="dialog"
      aria-label="Form og oppstilling"
    >
      {/* Topplinje med faner og lukkeknapp */}
      <div className="flex items-center justify-between pb-2 border-b border-line">
        <div className="flex items-center gap-1.5">
          <button
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
              tab === "setup"
                ? "bg-accent text-accent-fg"
                : "text-muted hover:text-foreground hover:bg-surface2"
            }`}
            onClick={() => setTab("setup")}
          >
            Form & oppstilling
          </button>
          <button
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
              tab === "solo"
                ? "bg-accent text-accent-fg"
                : "text-muted hover:text-foreground hover:bg-surface2"
            }`}
            onClick={() => setTab("solo")}
          >
            Solister
          </button>
        </div>
        <button className="btn-icon h-7 w-7" onClick={onClose} aria-label="Lukk">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3">
        {/* Fane: Form & oppstilling */}
        {tab === "setup" && (
          <div className="space-y-3">
            {/* Avstand mellom sangere */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-foreground">Avstand mellom sangere</span>
                <span className="font-semibold text-accent">
                  {spacing} cm
                  <span className="ml-1 text-[11px] font-normal text-muted">
                    {spacing <= 65 ? "(tett)" : spacing >= 95 ? "(luftig)" : "(normal)"}
                  </span>
                </span>
              </div>
              <input
                id="setup-spacing"
                type="range"
                min={60}
                max={110}
                step={5}
                value={spacing}
                className="w-full accent-accent cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none"
                onChange={(e) => onSettings({ singerSpacing: Number(e.target.value) })}
              />
              <div className="flex justify-between text-[10px] text-muted mt-0.5">
                <span>60 cm (tett)</span>
                <span>75 cm (normal)</span>
                <span>110 cm (luftig)</span>
              </div>
            </div>

            {/* Bue / amfi */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-foreground">Bue / amfi</span>
                <span className="font-semibold text-accent">
                  {s.arc === 0 ? "Rette rader" : `${s.arc} %`}
                </span>
              </div>
              <input
                id="setup-arc"
                type="range"
                min={0}
                max={100}
                step={1}
                value={s.arc}
                className="w-full accent-accent cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none"
                onChange={(e) => {
                  const arc = Number(e.target.value);
                  onSettings({ arc, shape: arc > 0 ? "arc" : "rows" });
                }}
              />
              <div className="flex justify-between text-[10px] text-muted mt-0.5">
                <span>Rett</span>
                <span>Halvbue</span>
                <span>Krapp amfi</span>
              </div>
            </div>

            {/* Antall rader */}
            <div>
              <label className="label" htmlFor="setup-rows">
                Antall rader
              </label>
              <select
                id="setup-rows"
                className="input py-1.5 text-xs"
                value={s.rowsAuto ? "auto" : String(s.rows)}
                onChange={(e) =>
                  e.target.value === "auto"
                    ? onSettings({ rowsAuto: true })
                    : onSettings({ rowsAuto: false, rows: Number(e.target.value) })
                }
              >
                <option value="auto">Automatisk ({s.rows})</option>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "rad" : "rader"}
                  </option>
                ))}
              </select>
            </div>

            {/* Auto-sorter knapp */}
            <div className="pt-1">
              <button
                className="btn btn-primary w-full flex items-center justify-center gap-2 py-2 text-xs"
                onClick={onAutoSort}
                title="Sorterer etter stemmegruppe og høyde (låste plasser står)"
              >
                <ArrowDownAZ className="h-4 w-4" /> Auto-sorter oppstilling
              </button>
            </div>
          </div>
        )}

        {/* Fane: Solister */}
        {tab === "solo" && (
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="setup-solo-layout">
                Plassering foran koret
              </label>
              <select
                id="setup-solo-layout"
                className="input py-1.5 text-xs"
                value={s.soloLayout}
                onChange={(e) => onSettings({ soloLayout: e.target.value as SoloLayout })}
              >
                <option value="center">Samlet i midten</option>
                <option value="spread">Spredt jevnt foran</option>
                <option value="pairs">To-og-to</option>
              </select>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-foreground cursor-pointer pt-1">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded accent-accent"
                checked={s.soloKeepGap}
                onChange={(e) => onSettings({ soloKeepGap: e.target.checked })}
              />
              <div>
                <div className="font-medium">Behold solistens korplass som tomt spor</div>
                <div className="text-[11px] text-muted">
                  Plassen i koret holdes av i stedet for at resten av koret trekkes sammen.
                </div>
              </div>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
