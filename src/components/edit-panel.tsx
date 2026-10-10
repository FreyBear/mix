"use client";

import { useState } from "react";
import {
  ArrowDownAZ,
  ChevronLeft,
  ChevronRight,
  Copy,
  FilePlus2,
  LayoutTemplate,
  ListChecks,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import type { Scene, SceneSettings, SoloLayout, Template } from "@/lib/types";

interface Props {
  scene: Scene;
  sceneIndex: number;
  sceneCount: number;
  hasPrev: boolean;
  templates: Template[];
  warnings: string[];
  saving: boolean;
  onTitle: (title: string) => void;
  onSettings: (patch: Partial<SceneSettings>) => void;
  onAutoSort: () => void;
  onCopyPrev: () => void;
  onNewScene: (copy: boolean) => void;
  onDeleteScene: () => void;
  onMove: (dir: -1 | 1) => void;
  onSaveTemplate: (name: string) => void;
  onApplyTemplate: (t: Template) => void;
  onDeleteTemplate: (t: Template) => void;
  onAttendance: () => void;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-b border-line px-4 py-3 last:border-b-0">
      <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function EditPanel(p: Props) {
  const s = p.scene.settings;
  const [tplName, setTplName] = useState("");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">Rediger oppstilling</h2>
          <p className="text-xs text-muted">{p.saving ? "Lagrer …" : "Endringer lagres automatisk"}</p>
        </div>
        <button className="btn-icon h-8 w-8" onClick={p.onClose} aria-label="Lukk panel">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {p.warnings.length > 0 && (
          <div className="mx-4 mt-3 rounded-lg border border-danger/40 bg-danger/10 p-2 text-sm text-danger" role="alert">
            <div className="mb-1 flex items-center gap-1.5 font-semibold">
              <TriangleAlert className="h-4 w-4" /> Advarsler
            </div>
            <ul className="list-disc space-y-0.5 pl-5">
              {p.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <Section title="Sang">
          <div>
            <label className="label" htmlFor="scene-title">
              Tittel (sang {p.sceneIndex + 1} av {p.sceneCount})
            </label>
            <input
              id="scene-title"
              key={p.scene.id}
              className="input"
              defaultValue={p.scene.title}
              maxLength={100}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== p.scene.title) p.onTitle(v);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn" onClick={p.onAutoSort} title="Sorterer etter stemmegruppe og høyde (låste plasser står)">
              <ArrowDownAZ className="h-4 w-4" /> Auto-sorter
            </button>
            <button className="btn" onClick={p.onCopyPrev} disabled={!p.hasPrev}>
              <Copy className="h-4 w-4" /> Kopier forrige
            </button>
            <button className="btn" onClick={() => p.onNewScene(true)}>
              <Plus className="h-4 w-4" /> Ny sang (kopi)
            </button>
            <button className="btn" onClick={() => p.onNewScene(false)}>
              <FilePlus2 className="h-4 w-4" /> Ny sang (tom)
            </button>
            <button className="btn" onClick={() => p.onMove(-1)} disabled={p.sceneIndex === 0}>
              <ChevronLeft className="h-4 w-4" /> Flytt frem
            </button>
            <button className="btn" onClick={() => p.onMove(1)} disabled={p.sceneIndex >= p.sceneCount - 1}>
              Flytt bak <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button className="btn w-full text-danger" onClick={p.onDeleteScene} disabled={p.sceneCount <= 1}>
            <Trash2 className="h-4 w-4" /> Slett sangen
          </button>
        </Section>

        <Section title="Form og bredde">
          <div>
            <label className="label flex justify-between" htmlFor="width">
              <span>Korbredde</span>
              <span className="font-semibold text-fg">{s.choirWidthPct} %</span>
            </label>
            <input
              id="width"
              type="range"
              min={30}
              max={100}
              step={1}
              value={s.choirWidthPct}
              onChange={(e) => p.onSettings({ choirWidthPct: Number(e.target.value) })}
            />
          </div>

          <div role="radiogroup" aria-label="Radform" className="grid grid-cols-2 gap-1 rounded-lg bg-surface2 p-1">
            {(
              [
                ["rows", "Rette rader"],
                ["arc", "Bue / amfi"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                role="radio"
                aria-checked={s.shape === val}
                onClick={() => p.onSettings({ shape: val })}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  s.shape === val ? "bg-surface shadow-sm" : "text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={s.shape === "arc" ? "" : "opacity-50"}>
            <label className="label flex justify-between" htmlFor="arc">
              <span>Amfi-radius (slak → krapp)</span>
              <span className="font-semibold text-fg">{s.arc}</span>
            </label>
            <input
              id="arc"
              type="range"
              min={0}
              max={100}
              step={1}
              disabled={s.shape !== "arc"}
              value={s.arc}
              onChange={(e) => p.onSettings({ arc: Number(e.target.value) })}
            />
          </div>

          <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--accent)]"
              checked={s.zigzag}
              onChange={(e) => p.onSettings({ zigzag: e.target.checked })}
            />
            Forskyv rader (sikksakk)
          </label>

          <div>
            <label className="label" htmlFor="rows">
              Antall rader
            </label>
            <select
              id="rows"
              className="input"
              value={s.rowsAuto ? "auto" : String(s.rows)}
              onChange={(e) =>
                e.target.value === "auto"
                  ? p.onSettings({ rowsAuto: true })
                  : p.onSettings({ rowsAuto: false, rows: Number(e.target.value) })
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
        </Section>

        <Section title="Solister">
          <div>
            <label className="label" htmlFor="solo-layout">
              Plassering foran koret
            </label>
            <select
              id="solo-layout"
              className="input"
              value={s.soloLayout}
              onChange={(e) => p.onSettings({ soloLayout: e.target.value as SoloLayout })}
            >
              <option value="center">Samlet i midten</option>
              <option value="spread">Spredt jevnt foran</option>
              <option value="pairs">To-og-to</option>
            </select>
          </div>
          <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--accent)]"
              checked={s.soloKeepGap}
              onChange={(e) => p.onSettings({ soloKeepGap: e.target.checked })}
            />
            Behold solistens korplass som tomt spor
          </label>
        </Section>

        <Section title="Konsert">
          <button className="btn w-full" onClick={p.onAttendance}>
            <ListChecks className="h-4 w-4" /> Deltakelse (sjekkliste)
          </button>
        </Section>

        <Section title="Maler">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = tplName.trim();
              if (!name) return;
              p.onSaveTemplate(name);
              setTplName("");
            }}
          >
            <input
              className="input"
              placeholder="Navn på mal"
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              maxLength={100}
            />
            <button className="btn shrink-0" type="submit" disabled={!tplName.trim()}>
              <Save className="h-4 w-4" /> Lagre
            </button>
          </form>
          {p.templates.length === 0 ? (
            <p className="text-sm text-muted">Ingen maler ennå. Lagre den gjeldende oppstillingen som mal.</p>
          ) : (
            <ul className="space-y-1">
              {p.templates.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <button className="btn flex-1 justify-start" onClick={() => p.onApplyTemplate(t)}>
                    <LayoutTemplate className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t.name}</span>
                  </button>
                  <button
                    className="btn-icon h-9 w-9 text-danger"
                    aria-label={`Slett malen ${t.name}`}
                    onClick={() => p.onDeleteTemplate(t)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
