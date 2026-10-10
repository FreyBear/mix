"use client";

import type { LayoutResult } from "@/lib/layout";
import type { Concert, Placement, Scene, Singer, VoiceGroup } from "@/lib/types";
import { formatDate } from "@/lib/client/format";
import { SceneContent, U } from "./scene-content";

/** Utskriftsvennlig ark (kun synlig ved utskrift/PDF). */
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
      <h1 style={{ fontSize: "18pt", fontWeight: 700 }}>
        {concert.name}
        {concert.date ? ` · ${formatDate(concert.date)}` : ""}
      </h1>
      <h2 style={{ fontSize: "14pt", marginBottom: 6 }}>
        {sceneIndex + 1}. {scene.title}{" "}
        <span style={{ fontSize: "10pt", fontWeight: 400 }}>
          (sett fra salen · scene {concert.stageWidth} × {concert.stageDepth} m)
        </span>
      </h2>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: "10pt", marginBottom: 6 }}>
        {legend.map((g) => (
          <span key={g.id} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: g.color,
                display: "inline-block",
              }}
            />
            {g.name}
          </span>
        ))}
      </div>
      <svg viewBox={`-90 -30 ${W + 180} ${D + 130}`} role="img" aria-label="Sceneoppstilling">
        <SceneContent
          stageW={concert.stageWidth}
          stageD={concert.stageDepth}
          choirWidthPct={scene.settings.choirWidthPct}
          layout={layout}
          placements={placements}
          singers={singers}
          groups={groups}
          mirror={false}
          meId={null}
          k={1.4}
          lod="name"
          editMode={false}
          selectedId={null}
          showRowLabels
        />
      </svg>
      {bench.length > 0 && (
        <p style={{ fontSize: "10pt", marginTop: 6 }}>
          <strong>Reservebenk:</strong> {bench.join(", ")}
        </p>
      )}
    </div>
  );
}
