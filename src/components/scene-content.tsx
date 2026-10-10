"use client";

import { useId } from "react";
import { BODY_D, BODY_W, type LayoutResult } from "@/lib/layout";
import type { DropTarget } from "@/lib/placement";
import type { Placement, Singer, VoiceGroup } from "@/lib/types";
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
  mirror: boolean;
  meId: number | null;
  k: number;
  lod: Lod;
  editMode: boolean;
  selectedId: number | null;
  drag?: DragView | null;
  showRowLabels?: boolean;
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
    mirror,
    meId,
    k,
    lod,
    editMode,
    selectedId,
    drag,
    showRowLabels,
  } = props;
  const patternId = useId().replace(/:/g, "");
  const W = stageW * U;
  const D = stageD * U;
  const dx = (xM: number) => (mirror ? stageW - xM : xM) * U;
  const dragging = drag?.id ?? null;
  const target = drag?.target ?? null;
  const showSlots = editMode && (selectedId !== null || dragging !== null);

  const rowLabels: { row: number; x: number; y: number }[] = [];
  if (showRowLabels) {
    for (let r = 0; r < layout.rows; r++) {
      const slots = layout.gridSlots.filter((s) => s.row === r);
      if (!slots.length) continue;
      let best = slots[0];
      for (const s of slots) if (dx(s.x) < dx(best.x)) best = s;
      rowLabels.push({ row: r, x: dx(best.x) - RX - 18, y: best.y * U });
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

      {rowLabels.map((l) => (
        <text
          key={l.row}
          x={l.x}
          y={l.y + 6}
          textAnchor="end"
          fontSize={18}
          fontWeight={700}
          fill="var(--muted)"
          style={{ userSelect: "none", pointerEvents: "none" }}
        >
          {l.row + 1}
        </text>
      ))}

      {/* Tomme plasser og reserverte spor */}
      {layout.gridSlots.map((s) => {
        if (s.occupiedBy !== null && !s.reserved) return null;
        const cx = dx(s.x);
        const cy = s.y * U;
        const isTarget =
          target?.type === "slot" && target.row === s.row && target.slot === s.slot;
        if (s.reserved) {
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
        }
        if (!editMode) return null;
        return (
          <g key={`${s.row}:${s.slot}`} data-slot-row={s.row} data-slot-col={s.slot}>
            <circle cx={cx} cy={cy} r={24} fill="transparent" />
            <circle
              cx={cx}
              cy={cy}
              r={showSlots ? 15 : 9}
              fill={isTarget ? "var(--accent)" : showSlots ? "var(--accent)" : "none"}
              fillOpacity={isTarget ? 0.55 : 0.15}
              stroke="var(--accent)"
              strokeWidth={2}
              strokeDasharray="4 4"
              opacity={showSlots ? 0.9 : 0.4}
            />
          </g>
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
        return (
          <NodeShape
            key={n.singerId}
            cx={dx(n.x)}
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

      {/* Sanger som dras */}
      {drag &&
        (() => {
          const singer = singers.get(drag.id);
          if (!singer) return null;
          const group = groups.get(singer.voiceGroupId);
          return (
            <NodeShape
              cx={drag.x * U}
              cy={drag.y * U}
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
        stroke={p.lent ? "#0f172a" : "rgba(15,23,42,0.45)"}
        strokeWidth={p.lent ? 3 : 1.5}
        strokeDasharray={p.lent ? "6 4" : undefined}
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
            <text y={-5} fontSize={detailNameFont}>
              {nick}
            </text>
            <text y={5} fontSize={p.lent ? lentFont : 7.5} fontWeight={600}>
              {p.lent ? p.lentText : p.groupAbbr}
            </text>
            <text y={14} fontSize={7} fontWeight={500} opacity={0.9}>
              {p.singer.height} cm
            </text>
          </>
        )}
      </g>

      {p.lent && (
        <g style={{ pointerEvents: "none" }}>
          <circle cx={RX - 3} cy={-RY + 3} r={8} fill="#fff" stroke="#0f172a" strokeWidth={1.5} />
          <text
            x={RX - 3}
            y={-RY + 8}
            fontSize={11}
            textAnchor="middle"
            fill="#b45309"
            fontWeight={800}
          >
            ★
          </text>
        </g>
      )}
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
