import type {
  Placement,
  SceneSettings,
  Singer,
  VoiceGroup,
} from "./types";

export interface PlacementCtx {
  singers: Singer[];
  groups: VoiceGroup[];
  stageW: number;
  stageD: number;
}

export interface PlacementState {
  placements: Placement[];
  settings: SceneSettings;
}

const key = (row: number, slot: number) => `${row}:${slot}`;

export function sortedGroups(groups: VoiceGroup[]): VoiceGroup[] {
  return [...groups].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

export function effectiveGroupId(p: Placement, singer: Singer): number {
  return p.overrideGroupId ?? singer.voiceGroupId;
}

function onGrid(p: Placement) {
  return p.status !== "bench" && p.row >= 0 && p.slot >= 0;
}

function occupiedSet(placements: Placement[], except?: number): Set<string> {
  const set = new Set<string>();
  for (const p of placements) {
    if (p.singerId === except) continue;
    if (onGrid(p)) set.add(key(p.row, p.slot));
  }
  return set;
}

function claimNearest(
  occ: Set<string>,
  row: number,
  target: number,
  rows: number,
  cols: number,
): { row: number; slot: number } | null {
  const t = Math.min(Math.max(target, 0), cols - 1);
  for (let dr = 0; dr < rows; dr++) {
    for (const r of dr === 0 ? [row] : [row - dr, row + dr]) {
      if (r < 0 || r >= rows) continue;
      for (let d = 0; d < cols; d++) {
        for (const c of d === 0 ? [t] : [t - d, t + d]) {
          if (c < 0 || c >= cols) continue;
          if (!occ.has(key(r, c))) return { row: r, slot: c };
        }
      }
    }
  }
  return null;
}

/** Sorterer korister etter stemmegruppe (blokker fra venstre) og høyde (høyest bakerst). */
export function autoSort(
  placements: Placement[],
  settings: SceneSettings,
  ctx: PlacementCtx,
): PlacementState {
  const sMap = new Map(ctx.singers.map((s) => [s.id, s]));
  const members = placements.filter((p) => p.status !== "bench" && sMap.has(p.singerId));
  const pinned = members.filter((p) => p.pinned && onGrid(p));
  const free = members.filter((p) => !pinned.includes(p));
  const N = members.length;
  const hasSolos = members.some((p) => p.status === "solo");

  const cw = (ctx.stageW * settings.choirWidthPct) / 100;
  let rows: number;
  if (settings.rowsAuto) {
    const maxPerRow = Math.max(1, Math.floor(cw / 0.8));
    rows = Math.min(6, Math.max(1, Math.ceil(N / maxPerRow)));
    const maxRows = Math.max(
      1,
      Math.floor((ctx.stageD - 0.8 - (hasSolos ? 1.1 : 0)) / 0.6) + 1,
    );
    rows = Math.min(rows, maxRows);
  } else {
    rows = settings.rows;
  }
  rows = Math.max(rows, ...pinned.map((p) => p.row + 1), 1);

  const groupOrder = sortedGroups(ctx.groups).map((g) => g.id);
  const byGroup = new Map<number, Placement[]>();
  for (const p of free) {
    const gid = effectiveGroupId(p, sMap.get(p.singerId)!);
    if (!byGroup.has(gid)) byGroup.set(gid, []);
    byGroup.get(gid)!.push(p);
  }
  const orderedIds = [
    ...groupOrder.filter((g) => byGroup.has(g)),
    ...[...byGroup.keys()].filter((g) => !groupOrder.includes(g)),
  ];

  type Block = { gid: number; tiers: Placement[][]; width: number; start: number };
  const blocks: Block[] = [];
  let sumW = 0;
  for (const gid of orderedIds) {
    const list = byGroup
      .get(gid)!
      .slice()
      .sort((a, b) => {
        const sa = sMap.get(a.singerId)!;
        const sb = sMap.get(b.singerId)!;
        return sa.height - sb.height || sa.fullName.localeCompare(sb.fullName, "nb");
      });
    const n = list.length;
    const base = Math.floor(n / rows);
    const rem = n % rows;
    const tiers: Placement[][] = [];
    let idx = 0;
    for (let t = 0; t < rows; t++) {
      const size = base + (t >= rows - rem ? 1 : 0);
      tiers.push(list.slice(idx, idx + size));
      idx += size;
    }
    const width = Math.max(1, ...tiers.map((t) => t.length));
    blocks.push({ gid, tiers, width, start: sumW });
    sumW += width;
  }

  const C = Math.max(
    1,
    sumW,
    Math.ceil(N / rows),
    ...pinned.map((p) => p.slot + 1),
  );

  const occ = new Set<string>(pinned.map((p) => key(p.row, p.slot)));
  const assigned = new Map<number, { row: number; slot: number }>();
  for (const b of blocks) {
    b.tiers.forEach((tier, row) => {
      const k = tier.length;
      if (!k) return;
      const positions = Array.from({ length: k }, (_, j) => j).sort(
        (a, b2) =>
          Math.abs(a - (k - 1) / 2) - Math.abs(b2 - (k - 1) / 2) || a - b2,
      );
      const tallFirst = tier.slice().sort((a, c) => {
        const sa = sMap.get(a.singerId)!;
        const sc = sMap.get(c.singerId)!;
        return sc.height - sa.height;
      });
      tallFirst.forEach((p, i) => {
        const j = positions[i];
        const target = b.start + Math.round(((j + 0.5) * b.width) / k - 0.5);
        const spot = claimNearest(occ, row, target, rows, C);
        if (spot) {
          occ.add(key(spot.row, spot.slot));
          assigned.set(p.singerId, spot);
        }
      });
    });
  }

  const next = placements.map((p) => {
    const a = assigned.get(p.singerId);
    return a ? { ...p, row: a.row, slot: a.slot } : p;
  });
  return { placements: next, settings: { ...settings, rows, slots: C } };
}

/** Plasserer en sanger på nærmeste ledige plass ved sin (effektive) stemmegruppe. */
export function placeNearGroup(
  state: PlacementState,
  singerId: number,
  ctx: PlacementCtx,
): PlacementState {
  const sMap = new Map(ctx.singers.map((s) => [s.id, s]));
  const me = state.placements.find((p) => p.singerId === singerId);
  const singer = sMap.get(singerId);
  if (!me || !singer) return state;
  const gid = effectiveGroupId(me, singer);
  const rows = Math.max(1, state.settings.rows);
  let C = Math.max(1, state.settings.slots);

  const others = state.placements.filter((q) => {
    const sg = sMap.get(q.singerId);
    return sg && q.singerId !== singerId && onGrid(q) && effectiveGroupId(q, sg) === gid;
  });
  const heights = [...others.map((q) => sMap.get(q.singerId)!.height), singer.height].sort(
    (a, b) => a - b,
  );
  const rank = heights.indexOf(singer.height);
  const pct = heights.length > 1 ? rank / (heights.length - 1) : 0.5;
  const trow = Math.round(pct * (rows - 1));
  const tcol = others.length
    ? others.reduce((sum, q) => sum + q.slot, 0) / others.length
    : (C - 1) / 2;

  const occ = occupiedSet(state.placements, singerId);
  let best: { row: number; slot: number } | null = null;
  let bestCost = Infinity;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < C; i++) {
      if (occ.has(key(r, i))) continue;
      const cost = Math.abs(i - tcol) + 0.8 * Math.abs(r - trow);
      if (cost < bestCost) {
        bestCost = cost;
        best = { row: r, slot: i };
      }
    }
  }
  if (!best) {
    best = { row: trow, slot: C };
    C += 1;
  }
  return {
    placements: state.placements.map((p) =>
      p.singerId === singerId ? { ...p, row: best!.row, slot: best!.slot } : p,
    ),
    settings: { ...state.settings, slots: C },
  };
}

/** Lag første oppstilling for gitte sangere. */
export function createInitialState(
  singerIds: number[],
  settings: SceneSettings,
  ctx: PlacementCtx,
): PlacementState {
  const placements: Placement[] = singerIds.map((id) => ({
    singerId: id,
    row: -1,
    slot: -1,
    status: "choir",
    pinned: false,
    overrideGroupId: null,
  }));
  return autoSort(placements, settings, ctx);
}

/** Fjerner sangere som ikke deltar og legger til nye deltakere. */
export function reconcile(
  state: PlacementState,
  attending: Set<number>,
  ctx: PlacementCtx,
): PlacementState {
  const sMap = new Map(ctx.singers.map((s) => [s.id, s]));
  let cur: PlacementState = {
    settings: state.settings,
    placements: state.placements.filter((p) => attending.has(p.singerId) && sMap.has(p.singerId)),
  };
  const have = new Set(cur.placements.map((p) => p.singerId));
  const missing = [...attending].filter((id) => !have.has(id) && sMap.has(id));
  for (const id of missing) {
    cur = {
      settings: cur.settings,
      placements: [
        ...cur.placements,
        { singerId: id, row: -1, slot: -1, status: "choir", pinned: false, overrideGroupId: null },
      ],
    };
    cur = placeNearGroup(cur, id, ctx);
  }
  return cur;
}

// ---------------------------------------------------------------------------
// Redigeringsoperasjoner
// ---------------------------------------------------------------------------

export type DropTarget =
  | { type: "singer"; id: number }
  | { type: "slot"; row: number; slot: number }
  | { type: "bench" };

export interface OpResult {
  state: PlacementState;
  error?: string;
}

function patch(
  placements: Placement[],
  id: number,
  fn: (p: Placement) => Placement,
): Placement[] {
  return placements.map((p) => (p.singerId === id ? fn(p) : p));
}

export function moveSinger(
  state: PlacementState,
  sourceId: number,
  target: DropTarget,
  ctx: PlacementCtx,
): OpResult {
  const a = state.placements.find((p) => p.singerId === sourceId);
  if (!a) return { state };
  if (target.type === "singer" && target.id === sourceId) return { state };
  const locked = "Plassen er låst. Fjern låsen først.";

  if (target.type === "bench") {
    if (a.status === "bench") return { state };
    if (a.pinned) return { state, error: locked };
    return {
      state: {
        ...state,
        placements: patch(state.placements, sourceId, (p) => ({ ...p, status: "bench" })),
      },
    };
  }

  if (target.type === "slot") {
    const occ = occupiedSet(state.placements, sourceId);
    if (occ.has(key(target.row, target.slot))) {
      return { state, error: "Plassen er opptatt eller reservert for en solist." };
    }
    if (a.pinned && a.status !== "bench") return { state, error: locked };
    const slots = Math.max(state.settings.slots, target.slot + 1);
    const rows = Math.max(state.settings.rows, target.row + 1);
    return {
      state: {
        settings: { ...state.settings, slots, rows },
        placements: patch(state.placements, sourceId, (p) => ({
          ...p,
          row: target.row,
          slot: target.slot,
          status: "choir",
        })),
      },
    };
  }

  const b = state.placements.find((p) => p.singerId === target.id);
  if (!b) return { state };
  if ((a.pinned && a.status !== "bench") || (b.pinned && b.status !== "bench")) {
    return { state, error: locked };
  }
  void ctx;
  if (a.status === "bench" && b.status === "bench") return { state };
  const placements = state.placements.map((p) => {
    if (p.singerId === a.singerId) {
      return { ...p, row: b.row, slot: b.slot, status: b.status };
    }
    if (p.singerId === b.singerId) {
      return { ...p, row: a.row, slot: a.slot, status: a.status };
    }
    return p;
  });
  return { state: { ...state, placements } };
}

export function toggleBench(
  state: PlacementState,
  id: number,
  ctx: PlacementCtx,
): OpResult {
  const p = state.placements.find((q) => q.singerId === id);
  if (!p) return { state };
  if (p.status === "bench") {
    const occ = occupiedSet(state.placements, id);
    const ok =
      p.row >= 0 &&
      p.slot >= 0 &&
      p.row < state.settings.rows &&
      p.slot < state.settings.slots &&
      !occ.has(key(p.row, p.slot));
    let next: PlacementState = {
      ...state,
      placements: patch(state.placements, id, (q) => ({ ...q, status: "choir" })),
    };
    if (!ok) next = placeNearGroup(next, id, ctx);
    return { state: next };
  }
  if (p.pinned) return { state, error: "Plassen er låst. Fjern låsen først." };
  return {
    state: {
      ...state,
      placements: patch(state.placements, id, (q) => ({ ...q, status: "bench" })),
    },
  };
}

export function toggleSolo(
  state: PlacementState,
  id: number,
  ctx: PlacementCtx,
): OpResult {
  const p = state.placements.find((q) => q.singerId === id);
  if (!p) return { state };
  if (p.status === "solo") {
    return {
      state: {
        ...state,
        placements: patch(state.placements, id, (q) => ({ ...q, status: "choir" })),
      },
    };
  }
  let next: PlacementState = {
    ...state,
    placements: patch(state.placements, id, (q) => ({ ...q, status: "solo" })),
  };
  if (p.status === "bench") {
    const occ = occupiedSet(state.placements, id);
    const ok = p.row >= 0 && p.slot >= 0 && !occ.has(key(p.row, p.slot));
    if (!ok) next = placeNearGroup(next, id, ctx);
  }
  return { state: next };
}

export function togglePin(state: PlacementState, id: number): OpResult {
  return {
    state: {
      ...state,
      placements: patch(state.placements, id, (q) => ({ ...q, pinned: !q.pinned })),
    },
  };
}

/** Sett midlertidig stemmegruppe (null = tilbake til fast) og flytt til den nye gruppens blokk. */
export function setOverride(
  state: PlacementState,
  id: number,
  groupId: number | null,
  ctx: PlacementCtx,
): OpResult {
  const singer = ctx.singers.find((s) => s.id === id);
  const p = state.placements.find((q) => q.singerId === id);
  if (!singer || !p) return { state };
  const override = groupId === singer.voiceGroupId ? null : groupId;
  let next: PlacementState = {
    ...state,
    placements: patch(state.placements, id, (q) => ({ ...q, overrideGroupId: override })),
  };
  if (!p.pinned && p.status !== "bench") next = placeNearGroup(next, id, ctx);
  return { state: next };
}
