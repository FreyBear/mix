"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownAZ,
  ChevronLeft,
  ChevronRight,
  Dices,
  Trash2,
  X,
} from "lucide-react";
import type {
  PlacementPreset,
  SceneSettings,
  SoloLayout,
  VoiceGroup,
} from "@/lib/types";

interface StageSetupCardProps {
  settings: SceneSettings;
  onSettings: (patch: Partial<SceneSettings>) => void;
  onAutoSort: () => void;
  onClose: () => void;
  presets?: PlacementPreset[];
  groups?: VoiceGroup[];
  selectedPresetId?: string;
  onSelectPreset?: (presetId: string) => void;
  onApplyPreset?: (preset: PlacementPreset) => void;
  onCreateCustomPreset?: (name: string, groupOrder: number[]) => Promise<void>;
  onDeleteCustomPreset?: (presetId: string) => Promise<void>;
}

export function StageSetupCard({
  settings: s,
  onSettings,
  onAutoSort,
  onClose,
  presets = [],
  groups = [],
  selectedPresetId = "satb",
  onSelectPreset,
  onApplyPreset,
  onCreateCustomPreset,
  onDeleteCustomPreset,
}: StageSetupCardProps) {
  const [tab, setTab] = useState<"setup" | "solo">("setup");
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [userCustomOrder, setUserCustomOrder] = useState<number[] | null>(null);
  const defaultOrder = useMemo(() => groups.map((g) => g.id), [groups]);
  const customOrder = userCustomOrder ?? defaultOrder;

  const spacing = s.singerSpacing ?? 75;

  const activePreset =
    presets.find((p) => p.id === selectedPresetId) ||
    presets.find((p) => p.id === "satb") ||
    presets[0];

  const moveGroup = (idx: number, delta: number) => {
    const target = idx + delta;
    if (target < 0 || target >= customOrder.length) return;
    const next = [...customOrder];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    setUserCustomOrder(next);
  };

  const handleSaveCustom = async () => {
    if (!newPresetName.trim() || !onCreateCustomPreset) return;
    await onCreateCustomPreset(newPresetName.trim(), customOrder);
    setNewPresetName("");
    setUserCustomOrder(null);
    setShowCustomModal(false);
  };

  return (
    <>
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

              {/* Oppstillingsmønster & sortering */}
              <div className="pt-2 border-t border-line space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">Oppstillingsmønster</span>
                  {activePreset && !activePreset.builtIn && onDeleteCustomPreset && (
                    <button
                      type="button"
                      className="text-[11px] text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors"
                      onClick={() => {
                        if (confirm(`Slette forvalget «${activePreset.name}»?`)) {
                          onDeleteCustomPreset(activePreset.id);
                        }
                      }}
                      title="Slett dette egendefinerte forvalget"
                    >
                      <Trash2 className="h-3 w-3" /> Slett forvalg
                    </button>
                  )}
                </div>

                <select
                  id="setup-preset-select"
                  className="input py-1.5 text-xs w-full"
                  value={selectedPresetId}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "__new__") {
                      setShowCustomModal(true);
                    } else {
                      onSelectPreset?.(val);
                    }
                  }}
                >
                  <optgroup label="Standard forvalg">
                    {presets
                      .filter((p) => p.builtIn)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </optgroup>
                  {presets.some((p) => !p.builtIn) && (
                    <optgroup label="Egne forvalg">
                      {presets
                        .filter((p) => !p.builtIn)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  <option value="__new__">＋ Opprett egendefinert forvalg...</option>
                </select>

                {/* Handlingsknapp */}
                {activePreset?.type === "mixed" ? (
                  <div className="space-y-1 pt-1">
                    <button
                      type="button"
                      className="btn btn-primary w-full flex items-center justify-center gap-2 py-2 text-xs"
                      onClick={() => activePreset && onApplyPreset?.(activePreset)}
                      title="Blander stemmene maksimalt med laveste foran og høyeste bak. Trykk flere ganger for å variere miksen."
                    >
                      <Dices className="h-4 w-4" /> Generer ny miks (eller rull på nytt 🎲)
                    </button>
                    <p className="text-[10px] text-muted text-center">
                      Låste korister blir stående. Trykk flere ganger for å variere miksen.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1 pt-1">
                    <button
                      type="button"
                      className="btn btn-primary w-full flex items-center justify-center gap-2 py-2 text-xs"
                      onClick={() => {
                        if (activePreset) onApplyPreset?.(activePreset);
                        else onAutoSort();
                      }}
                      title="Sorterer oppstillingen etter de valgte stemmeblokkene (låste plasser blir stående)"
                    >
                      <ArrowDownAZ className="h-4 w-4" /> Sorter oppstilling
                    </button>
                    <p className="text-[10px] text-muted text-center">
                      Sorterer etter stemmegruppe og høyde (låste plasser blir stående).
                    </p>
                  </div>
                )}
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

      {/* Modal for opprettelse av egendefinert forvalg */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="card w-full max-w-sm p-4 space-y-3 shadow-2xl bg-surface border border-line animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h3 className="text-xs font-semibold text-foreground">Nytt oppstillingsforvalg</h3>
              <button
                type="button"
                className="btn-icon h-6 w-6"
                onClick={() => setShowCustomModal(false)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div>
              <label className="label text-[11px]" htmlFor="custom-preset-name">
                Navn på forvalg
              </label>
              <input
                id="custom-preset-name"
                type="text"
                className="input py-1.5 text-xs"
                placeholder="f.eks. Kammerkor, Juleoppstilling..."
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <div className="text-[11px] font-medium text-foreground mb-1">
                Rekkefølge på stemmegrupper (fra venstre mot høyre)
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {customOrder.map((gid, idx) => {
                  const g = groups.find((x) => x.id === gid);
                  if (!g) return null;
                  return (
                    <div
                      key={gid}
                      className="flex items-center justify-between p-1.5 rounded-lg border border-line bg-surface2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: g.color }}
                        />
                        <span className="font-semibold">{g.abbr}</span>
                        <span className="text-muted text-[11px] truncate max-w-[120px]">{g.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          className="btn-icon h-6 w-6 disabled:opacity-20"
                          onClick={() => moveGroup(idx, -1)}
                          title="Flytt mot venstre"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === customOrder.length - 1}
                          className="btn-icon h-6 w-6 disabled:opacity-20"
                          onClick={() => moveGroup(idx, 1)}
                          title="Flytt mot høyre"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                className="btn btn-secondary text-xs py-1.5 px-3"
                onClick={() => setShowCustomModal(false)}
              >
                Avbryt
              </button>
              <button
                type="button"
                disabled={!newPresetName.trim()}
                className="btn btn-primary text-xs py-1.5 px-3"
                onClick={handleSaveCustom}
              >
                Lagre og velg
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
