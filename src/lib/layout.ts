import type { PlacementStatus, SceneSettings } from "./types";

/** Kroppsstørrelse i meter (bredde x dybde). */
export const BODY_W = 0.55;
export const BODY_D = 0.4;
const MARGIN = 0.4;
const SOLO_GAP = 1.1;
const SOLO_Y_OFFSET = 0.95;

export interface LayoutItem {
  singerId: number;
  row: number;
  slot: number;
  status: PlacementStatus;
}

export interface LNode {
  singerId: number;
  x: number;
  y: number;
  zone: "choir" | "solo";
  row: number;
  slot: number;
}

export interface LSlot {
  row: number;
  slot: number;
  x: number;
  y: number;
  /** Singer som opptar plassen (inkl. solistens reserverte spor). */
  occupiedBy: number | null;
  /** Reservert tomt spor etter en solist. */
  reserved: boolean;
}

export interface LayoutWarning {
  kind: "collision" | "outside" | "depth";
  singerIds: number[];
}

export interface LRowLabel {
  row: number;
  x: number;
  y: number;
}

export interface LayoutResult {
  rows: number;
  slots: number;
  rowSpacing: number;
  nodes: LNode[];
  gridSlots: LSlot[];
  rowLabels: LRowLabel[];
  warnings: LayoutWarning[];
  collisionIds: Set<number>;
  outsideIds: Set<number>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export function computeLayout(
  stageW: number,
  stageD: number,
  settings: SceneSettings,
  items: LayoutItem[],
): LayoutResult {
  const active = items.filter((i) => i.status !== "bench");
  const placed = active.filter((i) => i.row >= 0 && i.slot >= 0);
  const rows = Math.max(1, settings.rows, ...placed.map((i) => i.row + 1));

  // Hver rad pakkes tett fra venstre mot høyre i rekkefølgen til de lagrede plassene,
  // slik at det aldri blir hull i koret. Bare en solists «behold hull» holder av plass.
  const rowEntries: LayoutItem[][] = Array.from({ length: rows }, (_, r) =>
    placed
      .filter(
        (i) => i.row === r && (i.status === "choir" || (i.status === "solo" && settings.soloKeepGap)),
      )
      .sort((a, b) => a.slot - b.slot || a.singerId - b.singerId),
  );
  const C = Math.max(1, ...rowEntries.map((e) => e.length));
  /** Effektiv (pakket) plassindeks for hver sanger, sentrert i raden. */
  const effSlot = new Map<number, number>();
  rowEntries.forEach((entries) => {
    const start = (C - entries.length) / 2;
    entries.forEach((it, rank) => effSlot.set(it.singerId, start + rank));
  });

  const spacingM = (settings.singerSpacing ?? 75) / 100;
  const maxAllowedW = Math.min(
    stageW - 2 * MARGIN,
    (stageW * (settings.choirWidthPct ?? 100)) / 100,
  );
  const cw = Math.min(C * spacingM, maxAllowedW);
  const left = (stageW - cw) / 2;
  const cx = stageW / 2;
  const s = cw / C;
  /** Posisjon langs raden som andel 0..1 av korbredden. */
  const fracOf = (_r: number, i: number) => (s * (i + 0.5)) / cw;

  const hasSolos = active.some((i) => i.status === "solo");
  // Bue: hver rad er en sirkelbue rundt midten av scenekanten mot publikum. Sangerne står med
  // lik avstand langs buen (ikke lik avstand sideveis), så avstanden holder seg jevn i endene.
  // arc 0 = rette rader, 100 = halvsirkel. Bakerste rad får bredden `cw`.
  const arcOn = settings.arc > 0;
  const theta = arcOn ? (settings.arc / 100) * Math.PI : 0;
  const Rb = arcOn ? cw / (2 * Math.sin(theta / 2)) : Infinity;
  // Forreste rad får ikke mindre radius enn at plassene langs buen er minst ~0,62 m.
  const Rmin = arcOn ? Math.max(0.5, (C * 0.62) / theta) : 0;
  const radialFor = (rs: number) =>
    rows > 1 ? Math.max(0.5, Math.min(rs, (Rb - Rmin) / (rows - 1))) : rs;
  const pos = (r: number, i: number, rs: number) => {
    const f = fracOf(r, i);
    const adj = settings.rowAdjustments?.[r];
    const shift = adj?.shift ?? 0;
    const spread = (adj?.spread ?? 100) / 100;

    if (!arcOn) {
      return {
        x: cx + (f - 0.5) * cw * spread + shift,
        y: r * rs,
      };
    }
    const R = Rb - (rows - 1 - r) * radialFor(rs);
    const shiftAngle = R > 0.01 ? shift / R : 0;
    const th = (f - 0.5) * theta * spread + shiftAngle;
    return { x: cx + R * Math.sin(th), y: R * Math.cos(th) };
  };

  const avail = stageD - 2 * MARGIN - (hasSolos ? SOLO_GAP : 0);
  const spanFor = (rs: number) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of [0, rows - 1]) {
      for (const i of [0, Math.floor((C - 1) / 2), C - 1]) {
        const y = pos(r, i, rs).y;
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
    }
    return hi - lo;
  };
  let rowSpacing = 0.9;
  let fits = false;
  for (let rs = 0.9; rs >= 0.499; rs -= 0.05) {
    rowSpacing = rs;
    if (spanFor(rs) <= avail) {
      fits = true;
      break;
    }
  }
  const warnings: LayoutWarning[] = [];
  if (!fits && rows > 0) warnings.push({ kind: "depth", singerIds: [] });

  // Koret forankres bakerst på scenen.
  let maxRaw = -Infinity;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < C; i++) {
      maxRaw = Math.max(maxRaw, pos(r, i, rowSpacing).y);
    }
  }
  const shift = maxRaw - (stageD - MARGIN);
  const place = (r: number, i: number) => {
    const p = pos(r, i, rowSpacing);
    return { x: p.x, y: p.y - shift };
  };

  const nodes: LNode[] = [];
  for (const it of placed) {
    if (it.status !== "choir") continue;
    const eff = effSlot.get(it.singerId) ?? it.slot;
    const pl = place(it.row, eff);
    nodes.push({
      singerId: it.singerId,
      x: pl.x,
      y: pl.y,
      zone: "choir",
      row: it.row,
      slot: it.slot,
    });
  }

  // Solister: sortert etter opprinnelig plassering fra venstre mot høyre.
  const solos = active
    .filter((i) => i.status === "solo")
    .sort((a, b) => a.slot + a.row * 0.01 - (b.slot + b.row * 0.01));
  const soloXs: number[] = [];
  const n = solos.length;
  if (n > 0) {
    if (settings.soloLayout === "spread") {
      for (let k = 0; k < n; k++) soloXs.push(left + (cw * (k + 0.5)) / n);
    } else if (settings.soloLayout === "pairs") {
      const pairs = Math.ceil(n / 2);
      for (let p = 0; p < pairs; p++) {
        const pc = left + (cw * (p + 0.5)) / pairs;
        const inPair = Math.min(2, n - p * 2);
        if (inPair === 1) soloXs.push(pc);
        else soloXs.push(pc - 0.45, pc + 0.45);
      }
    } else {
      for (let k = 0; k < n; k++) soloXs.push(cx + (k - (n - 1) / 2) * 0.9);
    }
  }
  const choirNodes = nodes.slice();
  const globalMinY = choirNodes.length
    ? Math.min(...choirNodes.map((c) => c.y))
    : stageD - MARGIN;
  solos.forEach((it, k) => {
    const x = soloXs[k];
    const near = choirNodes.filter((c) => Math.abs(c.x - x) < 1.5);
    const front = near.length ? Math.min(...near.map((c) => c.y)) : globalMinY;
    nodes.push({
      singerId: it.singerId,
      x,
      y: front - SOLO_Y_OFFSET,
      zone: "solo",
      row: it.row,
      slot: it.slot,
    });
  });

  // Rutenett: de pakkede plassene (inkl. solistens reserverte spor) pluss én tom
  // «legg til»-plass rett etter siste sanger i hver rad (for tapp og dra-og-slipp).
  const gridSlots: LSlot[] = [];
  for (let r = 0; r < rows; r++) {
    const entries = rowEntries[r];
    for (const it of entries) {
      const pl = place(r, effSlot.get(it.singerId)!);
      gridSlots.push({
        row: r,
        slot: it.slot,
        x: pl.x,
        y: pl.y,
        occupiedBy: it.singerId,
        reserved: it.status === "solo",
      });
    }
    const end = place(r, (C - entries.length) / 2 + entries.length);
    gridSlots.push({
      row: r,
      slot: entries.length ? entries[entries.length - 1].slot + 1 : 0,
      x: end.x,
      y: end.y,
      occupiedBy: null,
      reserved: false,
    });
  }

  // Radknapper: plasseres i samme bue som raden, et lite stykke før første sanger.
  const rowLabels: LRowLabel[] = [];
  for (let r = 0; r < rows; r++) {
    const entries = rowEntries[r];
    const start = (C - entries.length) / 2;
    const labelPos = place(r, start - 0.7);
    rowLabels.push({
      row: r,
      x: Math.max(0.25, labelPos.x),
      y: labelPos.y,
    });
  }

  // Beregningene over regner y = 0 som scenekanten mot publikum. Lerretet tegner
  // publikum nederst (y = stageD), så snu y: rad 1 og solister havner nærmest publikum.
  for (const nd of nodes) nd.y = stageD - nd.y;
  for (const gs of gridSlots) gs.y = stageD - gs.y;
  for (const rl of rowLabels) rl.y = stageD - rl.y;

  // Kollisjoner og scenekant.
  const collisionIds = new Set<number>();
  const outsideIds = new Set<number>();
  for (let a = 0; a < nodes.length; a++) {
    const na = nodes[a];
    const m = 0.02;
    if (
      na.x < BODY_W / 2 - m ||
      na.x > stageW - BODY_W / 2 + m ||
      na.y < BODY_D / 2 - m ||
      na.y > stageD - BODY_D / 2 + m
    ) {
      outsideIds.add(na.singerId);
    }
    for (let b = a + 1; b < nodes.length; b++) {
      const nb = nodes[b];
      const dx = (na.x - nb.x) / BODY_W;
      const dy = (na.y - nb.y) / BODY_D;
      if (dx * dx + dy * dy < 0.98) {
        collisionIds.add(na.singerId);
        collisionIds.add(nb.singerId);
        warnings.push({ kind: "collision", singerIds: [na.singerId, nb.singerId] });
      }
    }
  }
  if (outsideIds.size) warnings.push({ kind: "outside", singerIds: [...outsideIds] });

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const nd of nodes) {
    minX = Math.min(minX, nd.x - BODY_W / 2);
    maxX = Math.max(maxX, nd.x + BODY_W / 2);
    minY = Math.min(minY, nd.y - BODY_D / 2);
    maxY = Math.max(maxY, nd.y + BODY_D / 2);
  }
  if (!nodes.length) {
    minX = 0;
    minY = 0;
    maxX = stageW;
    maxY = stageD;
  }

  return {
    rows,
    slots: C,
    rowSpacing,
    nodes,
    gridSlots,
    rowLabels,
    warnings,
    collisionIds,
    outsideIds,
    bounds: { minX, minY, maxX, maxY },
  };
}
