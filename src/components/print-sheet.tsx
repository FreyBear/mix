"use client";

import type { LayoutResult } from "@/lib/layout";
import type { Concert, Placement, Scene, Singer, VoiceGroup } from "@/lib/types";
import { formatDate } from "@/lib/client/format";
import { SceneContent, U } from "./scene-content";

/** Utskriftsvennlig ark (kun synlig ved utskrift/PDF). Liggende helside med navn. */
export function PrintSheet({
  concert,
  scene,
  sceneIndex,
  layout,
  placements,
  singers,
  groups,
}: {
  concert: Concert;
  scene: Scene;
  sceneIndex: number;
  layout: LayoutResult;
  placements: Map<number, Placement>;
  singers: Map<number, Singer>;
  groups: Map<number, VoiceGroup>;
}) {
  const W = concert.stageWidth * U;
  const D = concert.stageDepth * U;
  const used = new Set<number>();
  for (const n of layout.nodes) {
    const s = singers.get(n.singerId);
    if (s) used.add(s.voiceGroupId);
  }
  const legend = [...groups.values()]
    .filter((g) => used.has(g.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const bench = [...placements.values()]
    .filter((p) => p.status === "bench")
    .map((p) => singers.get(p.singerId)?.nickname)
    .filter(Boolean);

  return (
    <div className="print-only print-sheet">
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          borderBottom: "1px solid #cbd5e1",
          paddingBottom: "4px",
          marginBottom: "6px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "15pt", fontWeight: 700, color: "#0f172a" }}>
            {sceneIndex + 1}. {scene.title}
          </span>
          <span style={{ fontSize: "10pt", color: "#64748b" }}>
            · {concert.name}
            {concert.date ? ` · ${formatDate(concert.date)}` : ""}
            {` · scene ${concert.stageWidth} × ${concert.stageDepth} m`}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "9pt" }}>
          {legend.map((g) => (
            <span key={g.id} style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "#334155" }}>
              <span
                style={{
                  display: "inline-block",
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: g.color,
                  border: "1px solid rgba(0,0,0,0.15)",
                }}
              />
              {g.name}
            </span>
          ))}
        </div>
      </header>

      <svg
        viewBox={`-90 -30 ${W + 180} ${D + 130}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Sceneoppstilling"
      >
        <SceneContent
          stageW={concert.stageWidth}
          stageD={concert.stageDepth}
          choirWidthPct={scene.settings.choirWidthPct}
          layout={layout}
          placements={placements}
          singers={singers}
          groups={groups}
          meId={null}
          k={1.4}
          lod="name"
          editMode={false}
          selectedId={null}
          showRowLabels
        />
      </svg>

      {bench.length > 0 && (
        <footer
          style={{
            borderTop: "1px solid #e2e8f0",
            paddingTop: "3px",
            marginTop: "3px",
            fontSize: "8.5pt",
            color: "#64748b",
            flexShrink: 0,
          }}
        >
          <strong>Reservebenk:</strong> {bench.join(", ")}
        </footer>
      )}
    </div>
  );
}
