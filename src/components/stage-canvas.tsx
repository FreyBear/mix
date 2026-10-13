"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import { BODY_D, BODY_W, type LayoutResult } from "@/lib/layout";
import type { DropTarget } from "@/lib/placement";
import type { Placement, Singer, VoiceGroup, RowAdjustment } from "@/lib/types";
import { lodForScale, SceneContent, U, type DragView } from "./scene-content";

export interface StageHandle {
  zoomBy: (factor: number) => void;
  fit: () => void;
  centerOn: (singerId: number) => void;
  /** Finn sanger/tom plass under en skjermposisjon. */
  hitTest: (clientX: number, clientY: number, excludeId?: number) => DropTarget | null;
}

interface Props {
  stageW: number;
  stageD: number;
  choirWidthPct: number;
  layout: LayoutResult;
  placements: Map<number, Placement>;
  singers: Map<number, Singer>;
  groups: Map<number, VoiceGroup>;
  meId: number | null;
  editMode: boolean;
  selectedId: number | null;
  selectedRow?: number | null;
  rowAdjustments?: Record<number, RowAdjustment>;
  /** Øk for å tvinge «nullstill zoom». */
  fitSignal: number;
  onNodeTap: (id: number) => void;
  onSlotTap: (row: number, slot: number) => void;
  onRowTap?: (row: number) => void;
  onBackgroundTap: () => void;
  onDrop: (id: number, target: DropTarget) => void;
  className?: string;
  handleRef?: Ref<StageHandle>;
}

interface T {
  x: number;
  y: number;
  k: number;
}

type TapTarget =
  | { type: "node"; id: number }
  | { type: "row"; row: number }
  | { type: "slot"; row: number; slot: number }
  | null;

interface Gesture {
  mode: "none" | "pan" | "node" | "pinch";
  startX: number;
  startY: number;
  startT: T;
  moved: boolean;
  tap: TapTarget;
  nodeId: number | null;
  pinch?: { dist: number; mx: number; my: number; t: T };
}

const MOVE_THRESHOLD = 6;
const K_MAX = 10;

export function StageCanvas(props: Props) {
  const {
    stageW,
    stageD,
    choirWidthPct,
    layout,
    placements,
    singers,
    groups,
    meId,
    editMode,
    selectedId,
    selectedRow,
    rowAdjustments,
    fitSignal,
    onNodeTap,
    onSlotTap,
    onRowTap,
    onBackgroundTap,
    onDrop,
    className,
    handleRef,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [t, setTState] = useState<T>({ x: 0, y: 0, k: 0.3 });
  const tRef = useRef<T>(t);
  const [drag, setDrag] = useState<DragView | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>({
    mode: "none",
    startX: 0,
    startY: 0,
    startT: t,
    moved: false,
    tap: null,
    nodeId: null,
  });

  const kMin = useCallback(() => {
    if (!size.w || !size.h) return 0.05;
    const fitStage = Math.min(size.w / (stageW * U + 200), size.h / (stageD * U + 200));
    return fitStage * 0.5;
  }, [size.w, size.h, stageW, stageD]);

  const setT = useCallback((next: T) => {
    tRef.current = next;
    setTState(next);
  }, []);

  const clampK = useCallback((k: number) => Math.min(K_MAX, Math.max(kMin(), k)), [kMin]);

  // Mål beholderen.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const userMoved = useRef(false);
  const fit = useCallback(() => {
    if (!size.w || !size.h) return;
    const b = layout.bounds;
    const pad = 0.9;
    const minX = b.minX - pad;
    const maxX = b.maxX + pad;
    const minY = b.minY - pad;
    const maxY = b.maxY + pad + 0.6;
    const bw = (maxX - minX) * U;
    const bh = (maxY - minY) * U;
    const k = clampK(Math.min(size.w / bw, size.h / bh));
    const cx = ((minX + maxX) / 2) * U;
    const cy = ((minY + maxY) / 2) * U;
    setT({ k, x: size.w / 2 - cx * k, y: size.h / 2 - cy * k });
    userMoved.current = false;
  }, [size.w, size.h, layout.bounds, clampK, setT]);

  // Tilpass visningen første gang, ved speiling og når forelderen ber om det.
  const sized = size.w > 0 && size.h > 0;
  const fitRef = useRef(fit);
  useEffect(() => {
    fitRef.current = fit;
  });
  useEffect(() => {
    if (sized) fitRef.current();
  }, [sized, fitSignal]);
  // Hold visningen tilpasset når beholderen endrer størrelse, så lenge brukeren ikke har panorert/zoomet.
  useEffect(() => {
    if (sized && !userMoved.current) fitRef.current();
  }, [sized, size.w, size.h]);

  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number) => {
      const cur = tRef.current;
      const k = clampK(cur.k * factor);
      const wx = (cx - cur.x) / cur.k;
      const wy = (cy - cur.y) / cur.k;
      userMoved.current = true;
      setT({ k, x: cx - wx * k, y: cy - wy * k });
    },
    [clampK, setT],
  );

  // Musehjul / pekeplate-pinch (må være ikke-passiv for å hindre sidescroll).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0018)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const hitDisplay = (wx: number, wy: number, excludeId?: number): DropTarget | null => {
    // 1. Direkte treff på en sanger for å bytte plass (kun hvis pekeren er helt over kjernen)
    let bestDirectNode: { id: number; dist: number } | null = null;
    for (const n of layout.nodes) {
      if (n.singerId === excludeId) continue;
      const d = Math.pow((wx - n.x) / (BODY_W * 0.38), 2) + Math.pow((wy - n.y) / (BODY_D * 0.45), 2);
      if (d < 1 && (!bestDirectNode || d < bestDirectNode.dist)) {
        bestDirectNode = { id: n.singerId, dist: d };
      }
    }

    // 2. Kontinuerlig segment-basert innsetting langs hver rekke
    interface InsertMatch {
      row: number;
      index: number;
      x: number;
      y: number;
      verticalDist: number;
    }
    let bestInsert: InsertMatch | null = null;
    let minVerticalDist = Infinity;

    for (let r = 0; r < layout.rows; r++) {
      const rowNodes = layout.nodes
        .filter((n) => n.zone === "choir" && n.row === r && n.singerId !== excludeId)
        .sort((a, b) => a.x - b.x);

      // Tom rekke
      if (rowNodes.length === 0) {
        const slotY = layout.gridSlots.find((s) => s.row === r)?.y ?? stageD / 2;
        const vDist = Math.abs(wy - slotY);
        if (vDist < 0.75 && vDist < minVerticalDist) {
          minVerticalDist = vDist;
          bestInsert = {
            row: r,
            index: 0,
            x: stageW / 2,
            y: slotY,
            verticalDist: vDist,
          };
        }
        continue;
      }

      // Én sanger i rekken
      if (rowNodes.length === 1) {
        const single = rowNodes[0];
        const vDist = Math.abs(wy - single.y);
        if (vDist < 0.75 && vDist < minVerticalDist) {
          const isLeft = wx < single.x;
          const ix = isLeft ? single.x - 0.7 : single.x + 0.7;
          minVerticalDist = vDist;
          bestInsert = {
            row: r,
            index: isLeft ? 0 : 1,
            x: ix,
            y: single.y,
            verticalDist: vDist,
          };
        }
        continue;
      }

      // Flere sangere i rekken (beregner buet rekke-omriss)
      const minY = Math.min(...rowNodes.map((n) => n.y)) - 0.75;
      const maxY = Math.max(...rowNodes.map((n) => n.y)) + 0.75;
      if (wy < minY || wy > maxY) continue;

      const first = rowNodes[0];
      const last = rowNodes[rowNodes.length - 1];

      // A: Venstre for hele rekken (før første sanger)
      if (wx < first.x) {
        const vDist = Math.abs(wy - first.y);
        const hDist = first.x - wx;
        if (vDist < 0.75 && hDist < 1.4 && vDist < minVerticalDist) {
          const stepX = rowNodes[1].x - first.x;
          const stepY = rowNodes[1].y - first.y;
          minVerticalDist = vDist;
          bestInsert = {
            row: r,
            index: 0,
            x: first.x - stepX,
            y: first.y - stepY,
            verticalDist: vDist,
          };
        }
        continue;
      }

      // B: Høyre for hele rekken (etter siste sanger)
      if (wx > last.x) {
        const vDist = Math.abs(wy - last.y);
        const hDist = wx - last.x;
        if (vDist < 0.75 && hDist < 1.4 && vDist < minVerticalDist) {
          const prev = rowNodes[rowNodes.length - 2];
          const stepX = last.x - prev.x;
          const stepY = last.y - prev.y;
          minVerticalDist = vDist;
          bestInsert = {
            row: r,
            index: rowNodes.length,
            x: last.x + stepX,
            y: last.y + stepY,
            verticalDist: vDist,
          };
        }
        continue;
      }

      // C: Horisontalt mellom to sangere i denne rekken
      for (let i = 1; i < rowNodes.length; i++) {
        const left = rowNodes[i - 1];
        const right = rowNodes[i];
        if (wx >= left.x && wx <= right.x) {
          const span = right.x - left.x;
          const t = span > 0.001 ? (wx - left.x) / span : 0.5;
          const segY = left.y + t * (right.y - left.y);
          const vDist = Math.abs(wy - segY);

          if (vDist < 0.75 && vDist < minVerticalDist) {
            minVerticalDist = vDist;
            bestInsert = {
              row: r,
              index: i,
              x: (left.x + right.x) / 2,
              y: (left.y + right.y) / 2,
              verticalDist: vDist,
            };
          }
          break;
        }
      }
    }

    // Hvis brukeren peker direkte mot en sanger, prioriteres bytte
    if (bestDirectNode && (!bestInsert || bestDirectNode.dist < 0.4)) {
      return { type: "singer", id: bestDirectNode.id };
    }

    // Ellers snapper vi til det naturlige innsettingspunktet i rekken
    if (bestInsert) {
      return {
        type: "insert",
        row: bestInsert.row,
        index: bestInsert.index,
        x: bestInsert.x,
        y: bestInsert.y,
      };
    }

    return null;
  };

  const clientToDisplay = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const cur = tRef.current;
    return {
      x: (clientX - r.left - cur.x) / cur.k / U,
      y: (clientY - r.top - cur.y) / cur.k / U,
    };
  };

  useImperativeHandle(
    handleRef,
    () => ({
      zoomBy: (factor: number) => zoomAt(size.w / 2, size.h / 2, factor),
      fit,
      centerOn: (singerId: number) => {
        const n = layout.nodes.find((x) => x.singerId === singerId);
        if (!n) return;
        const k = clampK(Math.max(tRef.current.k, 2.2));
        userMoved.current = true;
        setT({ k, x: size.w / 2 - n.x * U * k, y: size.h / 2 - n.y * U * k });
      },
      hitTest: (clientX, clientY, excludeId) => {
        const p = clientToDisplay(clientX, clientY);
        return hitDisplay(p.x, p.y, excludeId);
      },
    }),
    undefined,
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = containerRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;

    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      g.mode = "pinch";
      g.moved = true;
      g.pinch = {
        dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
        t: tRef.current,
      };
      setDrag(null);
      return;
    }

    const target = e.target as Element;
    const nodeEl = target.closest("[data-node-id]");
    const rowEl = target.closest("[data-row-id]");
    const slotEl = target.closest("[data-slot-row]");
    let tap: TapTarget = null;
    if (nodeEl) tap = { type: "node", id: Number(nodeEl.getAttribute("data-node-id")) };
    else if (rowEl) tap = { type: "row", row: Number(rowEl.getAttribute("data-row-id")) };
    else if (slotEl) {
      tap = {
        type: "slot",
        row: Number(slotEl.getAttribute("data-slot-row")),
        slot: Number(slotEl.getAttribute("data-slot-col")),
      };
    }
    g.startX = e.clientX;
    g.startY = e.clientY;
    g.startT = tRef.current;
    g.moved = false;
    g.tap = tap;
    if (editMode && tap?.type === "node") {
      g.mode = "node";
      g.nodeId = tap.id;
    } else {
      g.mode = "pan";
      g.nodeId = null;
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const el = containerRef.current;
    if (!el) return;

    if (g.mode === "pinch" && g.pinch && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const r = el.getBoundingClientRect();
      const k = clampK((g.pinch.t.k * dist) / g.pinch.dist);
      const wx = (g.pinch.mx - r.left - g.pinch.t.x) / g.pinch.t.k;
      const wy = (g.pinch.my - r.top - g.pinch.t.y) / g.pinch.t.k;
      userMoved.current = true;
      setT({ k, x: mx - r.left - wx * k, y: my - r.top - wy * k });
      return;
    }

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (g.mode === "pan") {
      if (!g.moved && Math.hypot(dx, dy) > MOVE_THRESHOLD) g.moved = true;
      if (g.moved) {
        userMoved.current = true;
        setT({ k: g.startT.k, x: g.startT.x + dx, y: g.startT.y + dy });
      }
    } else if (g.mode === "node" && g.nodeId !== null) {
      if (!g.moved && Math.hypot(dx, dy) > MOVE_THRESHOLD) g.moved = true;
      if (g.moved) {
        const p = clientToDisplay(e.clientX, e.clientY);
        const overBench = !!document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest("[data-dropzone='bench']");
        setDrag({
          id: g.nodeId,
          x: p.x,
          y: p.y,
          target: overBench ? { type: "bench" } : hitDisplay(p.x, p.y, g.nodeId),
        });
      }
    }
  };

  const finish = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;

    if (g.mode === "pinch") {
      if (pointers.current.size === 1) {
        const [only] = [...pointers.current.values()];
        g.mode = "pan";
        g.moved = true;
        g.startX = only.x;
        g.startY = only.y;
        g.startT = tRef.current;
        g.tap = null;
      } else if (pointers.current.size === 0) {
        g.mode = "none";
      }
      return;
    }

    const wasMode = g.mode;
    g.mode = "none";
    if (cancelled) {
      setDrag(null);
      return;
    }

    if (wasMode === "node" && g.nodeId !== null) {
      const id = g.nodeId;
      if (!g.moved) {
        onNodeTap(id);
      } else {
        const overBench = !!document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest("[data-dropzone='bench']");
        let target: DropTarget | null = null;
        if (overBench) target = { type: "bench" };
        else {
          const p = clientToDisplay(e.clientX, e.clientY);
          target = hitDisplay(p.x, p.y, id);
        }
        if (target) onDrop(id, target);
      }
      setDrag(null);
      return;
    }

    if (wasMode === "pan" && !g.moved) {
      if (g.tap?.type === "node") onNodeTap(g.tap.id);
      else if (g.tap?.type === "row") onRowTap?.(g.tap.row);
      else if (g.tap?.type === "slot") onSlotTap(g.tap.row, g.tap.slot);
      else onBackgroundTap();
    }
  };

  const lod = lodForScale(t.k);

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden select-none ${className ?? "relative"}`}
      style={{ touchAction: "none", cursor: drag ? "grabbing" : "grab" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg width={size.w} height={size.h} className="block" role="img" aria-label="Sceneoppstilling">
        <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>
          <SceneContent
            stageW={stageW}
            stageD={stageD}
            choirWidthPct={choirWidthPct}
            layout={layout}
            placements={placements}
            singers={singers}
            groups={groups}
            meId={meId}
            k={t.k}
            lod={lod}
            editMode={editMode}
            selectedId={selectedId}
            selectedRow={selectedRow}
            rowAdjustments={rowAdjustments}
            drag={drag}
            showRowLabels
            onRowClick={onRowTap}
          />
        </g>
      </svg>
    </div>
  );
}
