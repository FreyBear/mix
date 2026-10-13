"use client";

import { useId } from "react";
import { BODY_D, BODY_W, type LayoutResult } from "@/lib/layout";
import type { DropTarget } from "@/lib/placement";
import type { Placement, Singer, VoiceGroup, RowAdjustment } from "@/lib/types";
import { contrastText, describeLent, initials } from "@/lib/client/format";

export type Lod = "initials" | "name" | "detail";

/** Meter → SVG-enheter (centimeter). */
export const U = 100;
const RX = (BODY_W * U) / 2;
const RY = (BODY_D * U) / 2;

export function lodForScale(k: number): Lod {
  const nodePx = BODY_W * U * k;
  if (nodePx < 46) return "initials";
  if (nodePx < 95) return "name";
  return "detail";
}

export interface DragView {
  id: number;
  /** Visningskoordinater i meter (etter evt. speiling). */
  x: number;
  y: number;
  target: DropTarget | null;
}

export interface SceneContentProps {
  stageW: number;
  stageD: number;
  choirWidthPct: number;
  layout: LayoutResult;
  placements: Map<number, Placement>;
  singers: Map<number, Singer>;
  groups: Map<number, VoiceGroup>;
  meId: number | null;
  k: number;
  lod: Lod;
  editMode: boolean;
  selectedId: number | null;
  selectedRow?: number | null;
  rowAdjustments?: Record<number, RowAdjustment>;
  drag?: DragView | null;
  showRowLabels?: boolean;
  onRowClick?: (row: number) => void;
}

export function SceneContent(props: SceneContentProps) {
  const {
    stageW,
    stageD,
    choirWidthPct,
    layout,
    placements,
    singers,
    groups,
    meId,
    k,
    lod,
    editMode,
    selectedId,
    selectedRow,
    rowAdjustments,
    drag,
    showRowLabels,
    onRowClick,
  } = props;
  const patternId = useId().replace(/:/g, "");
  const W = stageW * U;
  const D = stageD * U;
  const dx = (xM: number) => xM * U;
  const dragging = drag?.id ?? null;
  const target = drag?.target ?? null;

  const rowLabels: { row: number; x: number; y: number }[] = [];
  if (showRowLabels) {
    for (const rl of layout.rowLabels) {
      rowLabels.push({ row: rl.row, x: dx(rl.x), y: rl.y * U });
    }
  }

  const cwHalf = (stageW * choirWidthPct) / 100 / 2;
  const guides = [stageW / 2 - cwHalf, stageW / 2 + cwHalf].map((x) => x * U);

  return (
    <g>
      <defs>
        <pattern id={patternId} width={U} height={U} patternUnits="userSpaceOnUse">
          <path d={`M ${U} 0 L 0 0 0 ${U}`} fill="none" stroke="var(--grid)" strokeWidth={1} />
        </pattern>
      </defs>
      <rect
        x={0}
        y={0}
        width={W}
        height={D}
        rx={10}
        fill="var(--stage)"
        stroke="var(--stage-line)"
        strokeWidth={3}
      />
      <rect x={0} y={0} width={W} height={D} rx={10} fill={`url(#${patternId})`} opacity={0.7} />
      <line x1={0} y1={D} x2={W} y2={D} stroke="var(--accent)" strokeWidth={6} strokeLinecap="round" />
      <text
        x={W / 2}
        y={D + 46}
        textAnchor="middle"
        fontSize={26}
        fontWeight={700}
        letterSpacing={6}
        fill="var(--muted)"
        style={{ userSelect: "none", pointerEvents: "none" }}
      >
        PUBLIKUM
      </text>

      {editMode &&
        guides.map((x, i) => (
          <line
            key={i}
            x1={x}
            y1={0}
            x2={x}
            y2={D}
            stroke="var(--accent)"
            strokeWidth={1.5}
            strokeDasharray="8 8"
            opacity={0.35}
          />
        ))}


      {/* Reserverte spor for solister */}
      {layout.gridSlots.map((s) => {
        if (!s.reserved) return null;
        const cx = dx(s.x);
        const cy = s.y * U;
        return (
          <ellipse
            key={`${s.row}:${s.slot}`}
            cx={cx}
            cy={cy}
            rx={RX}
            ry={RY}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={2}
            strokeDasharray="6 5"
            opacity={0.6}
          />
        );
      })}

      {/* Sangere */}
      {layout.nodes.map((n) => {
        const singer = singers.get(n.singerId);
        const placement = placements.get(n.singerId);
        if (!singer || !placement) return null;
        const group = groups.get(singer.voiceGroupId);
        const effGroupId = placement.overrideGroupId ?? singer.voiceGroupId;
        const lentText = describeLent(singer, placement.overrideGroupId, groups);
        const effGroup = groups.get(effGroupId);

        let shiftX = 0;
        if (
          target?.type === "insert" &&
          target.row === n.row &&
          n.zone === "choir" &&
          target.x !== undefined
        ) {
          const sep = (BODY_W * 0.38) * U;
          if (n.x < target.x) shiftX = -sep;
          else if (n.x > target.x) shiftX = sep;
        }

        return (
          <NodeShape
            key={n.singerId}
            cx={dx(n.x) + shiftX}
            cy={n.y * U}
            singer={singer}
            color={group?.color ?? "#94a3b8"}
            groupAbbr={effGroup?.abbr ?? group?.abbr ?? "?"}
            lentText={lentText}
            lent={lentText !== null}
            pinned={placement.pinned && editMode}
            solo={n.zone === "solo"}
            isMe={n.singerId === meId}
            colliding={layout.collisionIds.has(n.singerId) || layout.outsideIds.has(n.singerId)}
            selected={n.singerId === selectedId}
            ghost={n.singerId === dragging}
            dropTarget={target?.type === "singer" && target.id === n.singerId}
            lod={lod}
            k={k}
            interactive={editMode || true}
          />
        );
      })}

      {/* Dynamisk opprettet plass ved innsetting mellom sangere */}
      {target?.type === "insert" && target.x !== undefined && target.y !== undefined && (
        <g
          transform={`translate(${dx(target.x)} ${target.y * U})`}
          className="transition-all duration-150"
          style={{ pointerEvents: "none" }}
        >
          <ellipse
            rx={RX + 2}
            ry={RY + 2}
            fill="rgba(99, 102, 241, 0.22)"
            stroke="var(--accent)"
            strokeWidth={2.5}
            strokeDasharray="5 3"
          />
          <text
            y={5}
            textAnchor="middle"
            fontSize={18}
            fontWeight={700}
            fill="var(--accent)"
            style={{ userSelect: "none" }}
          >
            +
          </text>
        </g>
      )}

      {/* Sanger som dras */}
      {drag &&
        (() => {
          const singer = singers.get(drag.id);
          if (!singer) return null;
          const group = groups.get(singer.voiceGroupId);
          const dragX = target?.type === "insert" && target.x !== undefined ? target.x : drag.x;
          const dragY = target?.type === "insert" && target.y !== undefined ? target.y : drag.y;
          return (
            <NodeShape
              cx={dragX * U}
              cy={dragY * U}
              singer={singer}
              color={group?.color ?? "#94a3b8"}
              groupAbbr={group?.abbr ?? "?"}
              lentText={null}
              lent={false}
              pinned={false}
              solo={false}
              isMe={false}
              colliding={false}
              selected
              ghost={false}
              dropTarget={false}
              lod={lod === "initials" ? "initials" : "name"}
              k={k}
              interactive={false}
              lifted
            />
          );
        })()}

      {rowLabels.map((l) => {
        const isSelected = selectedRow === l.row;
        const adj = rowAdjustments?.[l.row];
        const isAdjusted = !!adj && ((adj.shift ?? 0) !== 0 || (adj.spread ?? 100) !== 100);

        if (!editMode) {
          return (
            <text
              key={l.row}
              x={l.x}
              y={l.y + 6}
              textAnchor="middle"
              fontSize={16}
              fontWeight={700}
              fill="var(--muted)"
              style={{ userSelect: "none", pointerEvents: "none" }}
            >
              {l.row + 1}
            </text>
          );
        }

        return (
          <g
            key={l.row}
            data-row-id={l.row}
            transform={`translate(${l.x} ${l.y})`}
            style={{ cursor: "pointer" }}
            className="transition-transform duration-100 active:scale-95"
            onClick={(e) => {
              e.stopPropagation();
              onRowClick?.(l.row);
            }}
          >
            <circle r={22} fill="transparent" />
            <circle
              r={15}
              fill={isSelected ? "var(--accent)" : isAdjusted ? "rgba(99, 102, 241, 0.18)" : "var(--card, #fff)"}
              stroke={isSelected ? "var(--accent)" : isAdjusted ? "var(--accent)" : "rgba(15,23,42,0.35)"}
              strokeWidth={isSelected || isAdjusted ? 2 : 1.5}
              filter="drop-shadow(0 2px 3px rgba(0,0,0,0.15))"
            />
            <text
              y={5}
              textAnchor="middle"
              fontSize={13}
              fontWeight={700}
              fill={isSelected ? "#fff" : isAdjusted ? "var(--accent)" : "var(--foreground, #0f172a)"}
              style={{ userSelect: "none", pointerEvents: "none" }}
            >
              {l.row + 1}
            </text>
            {isAdjusted && !isSelected && (
              <circle cx={10} cy={-10} r={3.5} fill="var(--accent)" />
            )}
          </g>
        );
      })}
    </g>
  );
}

interface NodeShapeProps {
  cx: number;
  cy: number;
  singer: Singer;
  color: string;
  groupAbbr: string;
  lentText: string | null;
  lent: boolean;
  pinned: boolean;
  solo: boolean;
  isMe: boolean;
  colliding: boolean;
  selected: boolean;
  ghost: boolean;
  dropTarget: boolean;
  lod: Lod;
  k: number;
  interactive: boolean;
  lifted?: boolean;
}

function NodeShape(p: NodeShapeProps) {
  const fg = contrastText(p.color);
  const nick = p.singer.nickname;
  const nameFont = Math.max(8, Math.min(17, 50 / Math.max(3, nick.length * 0.62)));
  const detailNameFont = Math.max(7, Math.min(11, 46 / Math.max(3, nick.length * 0.62)));
  const lentFont = p.lentText ? Math.min(7.5, 50 / (p.lentText.length * 0.56)) : 7.5;
  const labelPx = 13;
  const label = nick;
  const labelW = (label.length * 0.62 * labelPx + 14) / p.k;

  return (
    <g
      transform={`translate(${p.cx} ${p.cy})`}
      className="transition-transform duration-150 ease-out"
      data-node-id={p.interactive ? p.singer.id : undefined}
      opacity={p.ghost ? 0.3 : 1}
      style={p.interactive ? { cursor: "pointer" } : { pointerEvents: "none" }}
    >
      {p.interactive && <ellipse rx={RX + 8} ry={RY + 8} fill="transparent" />}

      {p.colliding && (
        <ellipse
          rx={RX + 6}
          ry={RY + 6}
          fill="none"
          stroke="#ef4444"
          strokeWidth={3.5}
          style={{ pointerEvents: "none" }}
        />
      )}
      {p.isMe && (
        <ellipse
          className="pulse-ring"
          rx={RX + 4}
          ry={RY + 4}
          fill="none"
          stroke="var(--me)"
          strokeWidth={4}
          style={{ pointerEvents: "none" }}
        />
      )}
      {p.isMe && (
        <ellipse
          rx={RX + 5}
          ry={RY + 5}
          fill="none"
          stroke="var(--me)"
          strokeWidth={4}
          style={{ pointerEvents: "none" }}
        />
      )}
      {p.selected && (
        <ellipse
          rx={RX + 9}
          ry={RY + 9}
          fill="none"
          stroke="#0ea5e9"
          strokeWidth={4}
          style={{ pointerEvents: "none" }}
        />
      )}
      {p.dropTarget && (
        <ellipse
          rx={RX + 9}
          ry={RY + 9}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={5}
          style={{ pointerEvents: "none" }}
        />
      )}

      <ellipse
        rx={RX}
        ry={RY}
        fill={p.color}
        stroke="rgba(15,23,42,0.45)"
        strokeWidth={1.5}
        filter={p.lifted ? "drop-shadow(0 6px 6px rgba(0,0,0,.35))" : undefined}
      />

      <g
        fill={fg}
        textAnchor="middle"
        style={{ pointerEvents: "none", userSelect: "none" }}
        fontWeight={700}
      >
        {p.lod === "initials" && (
          <text y={7} fontSize={21}>
            {initials(nick)}
          </text>
        )}
        {p.lod === "name" && (
          <text y={nameFont * 0.35} fontSize={nameFont}>
            {nick}
          </text>
        )}
        {p.lod === "detail" && (
          <>
            <text y={p.singer.height > 0 ? -5 : -2} fontSize={detailNameFont}>
              {nick}
            </text>
            <text y={p.singer.height > 0 ? 5 : 9} fontSize={p.lent ? lentFont : 7.5} fontWeight={600}>
              {p.lent ? p.lentText : p.groupAbbr}
            </text>
            {p.singer.height > 0 && (
              <text y={14} fontSize={7} fontWeight={500} opacity={0.9}>
                {p.singer.height} cm
              </text>
            )}
          </>
        )}
      </g>

      {p.pinned && (
        <g transform={`translate(${-RX + 3} ${RY - 3})`} style={{ pointerEvents: "none" }}>
          <circle r={8} fill="#fff" stroke="#0f172a" strokeWidth={1.5} />
          <rect x={-3.5} y={-1} width={7} height={5.5} rx={1} fill="#0f172a" />
          <path d="M -2.2 -1 V -3 a 2.2 2.2 0 0 1 4.4 0 V -1" fill="none" stroke="#0f172a" strokeWidth={1.3} />
        </g>
      )}
      {p.solo && (
        <text
          y={RY + 15}
          textAnchor="middle"
          fontSize={10}
          fontWeight={800}
          letterSpacing={1}
          fill="var(--fg)"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          SOLO
        </text>
      )}

      {/* «Meg selv» er alltid merket med navn, selv ved lav zoom. */}
      {p.isMe && p.lod === "initials" && (
        <g
          transform={`translate(0 ${-RY - 16 / p.k - 6})`}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          <rect
            x={-labelW / 2}
            y={(-labelPx * 0.85) / p.k}
            width={labelW}
            height={(labelPx * 1.5) / p.k}
            rx={6 / p.k}
            fill="var(--me)"
          />
          <text
            y={(labelPx * 0.35) / p.k}
            textAnchor="middle"
            fontSize={labelPx / p.k}
            fontWeight={800}
            fill="#2e1065"
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
}
