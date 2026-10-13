"use client";

import { Maximize2, MoveHorizontal, RotateCcw, X } from "lucide-react";
import type { RowAdjustment } from "@/lib/types";

interface RowAdjustmentCardProps {
  row: number;
  singerCount: number;
  adjustment: RowAdjustment | undefined;
  onChange: (adj: RowAdjustment) => void;
  onReset: () => void;
  onClose: () => void;
}

export function RowAdjustmentCard({
  row,
  singerCount,
  adjustment,
  onChange,
  onReset,
  onClose,
}: RowAdjustmentCardProps) {
  const shift = adjustment?.shift ?? 0;
  const spread = adjustment?.spread ?? 100;
  const isAdjusted = shift !== 0 || spread !== 100;

  const shiftCm = Math.round(shift * 100);
  const shiftLabel =
    shiftCm === 0
      ? "0 cm (sentrert)"
      : shiftCm > 0
        ? `+${shiftCm} cm (høyre)`
        : `${shiftCm} cm (venstre)`;

  const spreadLabel =
    spread === 100
      ? "100 % (normal)"
      : spread < 100
        ? `${spread} % (tettere)`
        : `${spread} % (bredere)`;

  return (
    <div
      className="card pointer-events-auto w-full max-w-sm p-3.5 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-150"
      role="dialog"
      aria-label={`Justering for rad ${row + 1}`}
    >
      <div className="flex items-center justify-between pb-2 border-b border-line">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white font-bold text-xs shadow-sm">
            {row + 1}
          </span>
          <div>
            <div className="text-sm font-semibold text-foreground">Rad {row + 1}</div>
            <div className="text-xs text-muted">
              {singerCount} {singerCount === 1 ? "korist" : "korister"}
            </div>
          </div>
        </div>
        <button className="btn-icon h-7 w-7" onClick={onClose} aria-label="Lukk">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {/* Utstrekning */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <Maximize2 className="h-3.5 w-3.5 text-accent" /> Utstrekning
            </span>
            <span className="font-semibold text-accent">{spreadLabel}</span>
          </div>
          <input
            type="range"
            min={60}
            max={140}
            step={5}
            value={spread}
            className="w-full accent-accent cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none"
            onChange={(e) => onChange({ shift, spread: Number(e.target.value) })}
          />
          <div className="flex justify-between text-[10px] text-muted mt-0.5">
            <span>Smalere</span>
            <span>Normal</span>
            <span>Bredere</span>
          </div>
        </div>

        {/* Forskyving */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <MoveHorizontal className="h-3.5 w-3.5 text-accent" /> Forskyving
            </span>
            <span className="font-semibold text-accent">{shiftLabel}</span>
          </div>
          <input
            type="range"
            min={-1.2}
            max={1.2}
            step={0.05}
            value={shift}
            className="w-full accent-accent cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none"
            onChange={(e) => onChange({ shift: Number(e.target.value), spread })}
          />
          <div className="flex justify-between text-[10px] text-muted mt-0.5">
            <span>← Venstre</span>
            <span>Sentrert</span>
            <span>Høyre →</span>
          </div>
        </div>

        {/* Nullstill-knapp og veiledning */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px] text-muted">
            Nullstilles ved Auto-sorter eller endring av antall rader.
          </p>
          {isAdjusted && (
            <button
              className="btn btn-ghost h-7 px-2 text-xs flex items-center gap-1 text-muted hover:text-foreground shrink-0"
              onClick={onReset}
            >
              <RotateCcw className="h-3 w-3" /> Nullstill rad
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
