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

export interface LayoutResult {
  rows: number;
  slots: number;
  rowSpacing: number;
  nodes: LNode[];
  gridSlots: LSlot[];
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

  const cw = (stageW * settings.choirWidthPct) / 100;
  const left = (stageW - cw) / 2;
  const cx = stageW / 2;
  const zig = settings.zigzag;
  const s = cw / (C + (zig ? 0.5 : 0));
  const baseX = (r: number, i: number) =>
    left + s * (i + 0.5) + (zig && r % 2 === 1 ? s / 2 : 0);

  const hasSolos = active.some((i) => i.status === "solo");
  const arcOn = settings.arc > 0;
  const R0 = arcOn ? cw * (3 - (2.5 * settings.arc) / 100) : Infinity;
  const rawY = (r: number, x: number, rs: number) => {
    if (!arcOn) return r * rs;
    const R = R0 + r * rs;
    const dx = x - cx;
    return Math.sqrt(Math.max(R * R - dx * dx, 0));
  };

  const avail = stageD - 2 * MARGIN - (hasSolos ? SOLO_GAP : 0);
  const spanFor = (rs: number) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of [0, rows - 1]) {
      for (const i of [0, Math.floor((C - 1) / 2), C - 1]) {
        const y = rawY(r, baseX(r, i), rs);
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
      maxRaw = Math.max(maxRaw, rawY(r, baseX(r, i), rowSpacing));
    }
  }
  const shift = maxRaw - (stageD - MARGIN);
  const posY = (r: number, x: number) => rawY(r, x, rowSpacing) - shift;

  const nodes: LNode[] = [];
  for (const it of placed) {
    if (it.status !== "choir") continue;
    const eff = effSlot.get(it.singerId) ?? it.slot;
    const x = baseX(it.row, eff);
    nodes.push({
      singerId: it.singerId,
      x,
      y: posY(it.row, x),
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
      const x = baseX(r, effSlot.get(it.singerId)!);
      gridSlots.push({
        row: r,
        slot: it.slot,
        x,
        y: posY(r, x),
        occupiedBy: it.singerId,
        reserved: it.status === "solo",
      });
    }
    const x = baseX(r, (C - entries.length) / 2 + entries.length);
    gridSlots.push({
      row: r,
      slot: entries.length ? entries[entries.length - 1].slot + 1 : 0,
      x,
      y: posY(r, x),
      occupiedBy: null,
      reserved: false,
    });
  }

  // Beregningene over regner y = 0 som scenekanten mot publikum. Lerretet tegner
  // publikum nederst (y = stageD), så snu y: rad 1 og solister havner nærmest publikum.
  for (const nd of nodes) nd.y = stageD - nd.y;
  for (const gs of gridSlots) gs.y = stageD - gs.y;

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
    warnings,
    collisionIds,
    outsideIds,
    bounds: { minX, minY, maxX, maxY },
  };
}
