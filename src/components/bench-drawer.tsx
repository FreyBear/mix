"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { DropTarget } from "@/lib/placement";
import type { Singer, VoiceGroup } from "@/lib/types";
import { contrastText } from "@/lib/client/format";
import type { StageHandle } from "./stage-canvas";

interface Entry {
  singer: Singer;
  group: VoiceGroup | undefined;
}

export function BenchDrawer({
  entries,
  editMode,
  selectedId,
  meId,
  stage,
  onTapSinger,
  onZoneTap,
  onDrop,
}: {
  entries: Entry[];
  editMode: boolean;
  selectedId: number | null;
  meId: number | null;
  stage: RefObject<StageHandle | null>;
  onTapSinger: (id: number) => void;
  onZoneTap: () => void;
  onDrop: (id: number, target: DropTarget) => void;
}) {
  const [open, setOpen] = useState(true);
  const [ghost, setGhost] = useState<{ id: number; x: number; y: number } | null>(null);
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanup.current?.(), []);

  if (!editMode && entries.length === 0) return null;

  const startPress = (e: React.PointerEvent, id: number) => {
    if (!editMode) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) moved = true;
      if (moved) setGhost({ id, x: ev.clientX, y: ev.clientY });
    };
    const up = (ev: PointerEvent) => {
      cleanup.current?.();
      setGhost(null);
      if (!moved) {
        onTapSinger(id);
        return;
      }
      const target = stage.current?.hitTest(ev.clientX, ev.clientY, id);
      if (target) onDrop(id, target);
    };
    const cancel = () => {
      cleanup.current?.();
      setGhost(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    cleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      cleanup.current = null;
    };
  };

  const ghostEntry = ghost ? entries.find((x) => x.singer.id === ghost.id) : null;

  return (
    <section
      data-dropzone="bench"
      aria-label="Reservebenk"
      className="no-print border-t border-line bg-surface"
    >
      <button
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>
          Reservebenk <span className="font-normal text-muted">({entries.length})</span>
          {entries.length === 0 && editMode && (
            <span className="ml-2 font-normal text-muted">dra sangere hit eller bruk «Send til benk»</span>
          )}
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>
      {open && (
        <div
          className="flex max-h-28 min-h-10 flex-wrap gap-1.5 overflow-y-auto px-3 pb-2"
          onClick={(e) => {
            if (editMode && selectedId !== null && e.target === e.currentTarget) onZoneTap();
          }}
        >
          {entries.map(({ singer, group }) => {
            const bg = group?.color ?? "#94a3b8";
            const selected = singer.id === selectedId;
            return (
              <button
                key={singer.id}
                onPointerDown={(e) => startPress(e, singer.id)}
                onClick={() => {
                  if (!editMode) onTapSinger(singer.id);
                }}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold shadow-sm ${
                  editMode ? "touch-none" : ""
                } ${selected ? "ring-2 ring-sky-500 ring-offset-1" : ""} ${
                  singer.id === meId ? "outline-2 outline-offset-1 outline-[var(--me)]" : ""
                }`}
                style={{ background: bg, color: contrastText(bg) }}
              >
                {singer.nickname}
              </button>
            );
          })}
        </div>
      )}
      {ghost && ghostEntry && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-sm font-semibold shadow-xl"
          style={{
            left: ghost.x,
            top: ghost.y,
            background: ghostEntry.group?.color ?? "#94a3b8",
            color: contrastText(ghostEntry.group?.color ?? "#94a3b8"),
          }}
        >
          {ghostEntry.singer.nickname}
        </div>
      )}
    </section>
  );
}
