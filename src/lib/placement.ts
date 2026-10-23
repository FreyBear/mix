import type {
  AutoSortOptions,
  Placement,
  PlacementPreset,
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

export function resolveGroupOrder(
  pattern: "SATB" | "TSAB" | "STBA",
  groups: VoiceGroup[],
): number[] {
  const sorted = [...groups].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const byLetter: Record<string, VoiceGroup[]> = { S: [], A: [], T: [], B: [], other: [] };

  for (const g of sorted) {
    const key = (g.abbr || g.name).trim().toUpperCase();
    if (key.startsWith("S")) byLetter.S.push(g);
    else if (key.startsWith("A")) byLetter.A.push(g);
    else if (key.startsWith("T")) byLetter.T.push(g);
    else if (key.startsWith("B")) byLetter.B.push(g);
    else byLetter.other.push(g);
  }

  const orderKeys =
    pattern === "SATB"
      ? ["S", "A", "T", "B"]
      : pattern === "TSAB"
      ? ["T", "S", "A", "B"]
      : ["S", "T", "B", "A"];

  const res: number[] = [];
  for (const k of orderKeys) {
    const list = pattern === "STBA" && k === "A" ? [...byLetter[k]].reverse() : byLetter[k];
    for (const g of list) res.push(g.id);
  }
  for (const g of byLetter.other) res.push(g.id);
  return res;
}

export function getBuiltInPresets(groups: VoiceGroup[]): PlacementPreset[] {
  return [
    {
      id: "satb",
      name: "SATB (Klassisk: S – A – T – B)",
      type: "blocks",
      groupOrder: resolveGroupOrder("SATB", groups),
      builtIn: true,
    },
    {
      id: "tsab",
      name: "TSAB (Tenor venstre: T – S – A – B)",
      type: "blocks",
      groupOrder: resolveGroupOrder("TSAB", groups),
      builtIn: true,
    },
    {
      id: "stba",
      name: "SSTTBBAA Vanlig",
      type: "blocks",
      groupOrder: resolveGroupOrder("STBA", groups),
      builtIn: true,
    },
    {
      id: "mixed",
      name: "🎲 Fullstendig miks (Spredt)",
      type: "mixed",
      builtIn: true,
    },
  ];
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

function arrangeMixedRow(
  rowMembers: Placement[],
  prevRowGroups: number[] | undefined,
  sMap: Map<number, Singer>,
  rng: () => number,
): Placement[] {
  if (rowMembers.length <= 1) return rowMembers;

  let bestList = rowMembers.slice();
  let minPenalty = Infinity;

  const scorePermutation = (arr: Placement[]): number => {
    let penalty = 0;
    for (let i = 0; i < arr.length; i++) {
      const gCurrent = effectiveGroupId(arr[i], sMap.get(arr[i].singerId)!);
      if (i > 0) {
        const gLeft = effectiveGroupId(arr[i - 1], sMap.get(arr[i - 1].singerId)!);
        if (gCurrent === gLeft) penalty += 10;
      }
      if (prevRowGroups && i < prevRowGroups.length) {
        if (gCurrent === prevRowGroups[i]) penalty += 3;
      }
    }
    return penalty;
  };

  const iterations = Math.min(100, Math.max(30, rowMembers.length * 5));
  for (let it = 0; it < iterations; it++) {
    const candidate = rowMembers.slice();
    for (let i = candidate.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidate[i], candidate[j]] = [candidate[j], candidate[i]];
    }
    const penalty = scorePermutation(candidate);
    if (penalty < minPenalty) {
      minPenalty = penalty;
      bestList = candidate;
      if (minPenalty === 0) break;
    }
  }

  return bestList;
}

/**
 * Sorterer korister etter stemmegruppe (blokker fra venstre) og høyde (høyest bakerst),
 * eller som en optimalisert fullstendig miks.
 *
 * Endres antall rader, følger låste sangere sin kant: låst på forreste rad blir på forreste rad,
 * låst på bakerste rad blir på bakerste rad, og låst i en midtrad mister låsen.
 * `prevRows` er antall rader før endringen (utledes ellers fra oppstillingen).
 */
export function autoSort(
  placements: Placement[],
  settings: SceneSettings,
  ctx: PlacementCtx,
  prevRows?: number,
  options?: AutoSortOptions,
): PlacementState {
  const sMap = new Map(ctx.singers.map((s) => [s.id, s]));
  const members0 = placements.filter((p) => p.status !== "bench" && sMap.has(p.singerId));
  const N = members0.length;
  const hasSolos = members0.some((p) => p.status === "solo");

  const cw = (ctx.stageW * settings.choirWidthPct) / 100;
  let rows: number;
  if (settings.rowsAuto) {
    const spacing = (settings.singerSpacing ?? 75) / 100;
    const maxRows = Math.max(
      1,
      Math.floor((ctx.stageD - 0.8 - (hasSolos ? 1.1 : 0)) / 0.6) + 1,
    );
    if (settings.shape === "arc" && settings.arc > 0) {
      const theta = (settings.arc / 100) * Math.PI;
      const Rb = cw / (2 * Math.sin(theta / 2));
      const Rmin = Math.max(0.5, (10 * 0.62) / theta);
      let bestRows = 6;
      for (let rCount = 1; rCount <= 6; rCount++) {
        const dr = rCount > 1 ? Math.max(0.5, Math.min(0.75, (Rb - Rmin) / (rCount - 1))) : 0;
        let totCap = 0;
        for (let r = 0; r < rCount; r++) {
          const R = Rb - (rCount - 1 - r) * dr;
          totCap += Math.max(1, Math.floor((R * theta) / spacing));
        }
        if (totCap >= N) {
          bestRows = rCount;
          break;
        }
      }
      rows = Math.min(bestRows, maxRows);
    } else {
      const maxPerRow = Math.max(1, Math.floor(cw / spacing));
      rows = Math.min(6, Math.max(1, Math.ceil(N / maxPerRow)));
      rows = Math.min(rows, maxRows);
    }
  } else {
    rows = Math.max(1, settings.rows);
  }

  const oldRows = Math.max(
    1,
    prevRows ?? settings.rows,
    ...members0.filter(onGrid).map((p) => p.row + 1),
  );
  const unpinned = new Set<number>();
  const members = members0.map((p) => {
    if (!(p.pinned && onGrid(p)) || rows === oldRows) return p;
    if (p.row === 0) return p; // forreste rad forblir forreste rad
    if (p.row === oldRows - 1) return { ...p, row: rows - 1 }; // bakerste forblir bakerst
    unpinned.add(p.singerId);
    return { ...p, pinned: false };
  });
  const pinned = members.filter((p) => p.pinned && onGrid(p));
  const free = members.filter((p) => !pinned.includes(p));
  rows = Math.max(rows, ...pinned.map((p) => p.row + 1), 1);

  // Radstørrelser: tilpasset bue/amfi slik at bakerste rader (som har større radius og
  // lengre bue) får flere korister, mens forreste rad får færre.
  // Ved rette rader (arc = 0) er koristene jevnt fordelt (+/- 1).
  let rowSize: number[];
  const isArc = settings.shape === "arc" && settings.arc > 0;
  if (!isArc || rows <= 1) {
    const base = Math.floor(N / rows);
    const rem = N % rows;
    rowSize = Array.from({ length: rows }, (_, r) => base + (r >= rows - rem ? 1 : 0));
  } else {
    const spacing = (settings.singerSpacing ?? 75) / 100;
    const effCw = Math.min(cw, Math.max(4.0, (N / rows) * spacing * 1.15));
    const theta = (settings.arc / 100) * Math.PI;
    const Rb = effCw / (2 * Math.sin(theta / 2));
    const dr = Math.min(0.85, Math.max(0.1, (Rb - 0.5) / (rows - 1)));
    const weights = Array.from({ length: rows }, (_, r) =>
      Math.max(0.5, Rb - (rows - 1 - r) * dr),
    );
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    if (N < rows) {
      rowSize = Array(rows).fill(0);
      const byWeight = Array.from({ length: rows }, (_, r) => r).sort(
        (a, b) => weights[b] - weights[a],
      );
      for (let i = 0; i < N; i++) rowSize[byWeight[i]] = 1;
    } else {
      const surplus = N - rows;
      const exact = weights.map((w) => (surplus * w) / totalWeight);
      rowSize = exact.map((x) => 1 + Math.floor(x));
      let allocated = rowSize.reduce((a, b) => a + b, 0);

      const byFrac = exact
        .map((x, r) => ({ r, frac: x - Math.floor(x) }))
        .sort((a, b) => b.frac - a.frac || b.r - a.r);

      let remIdx = 0;
      while (allocated < N && remIdx < byFrac.length) {
        rowSize[byFrac[remIdx].r]++;
        allocated++;
        remIdx++;
      }
    }
  }
  const pinnedCount = Array.from({ length: rows }, (_, r) => pinned.filter((p) => p.row === r).length);
  const cap = rowSize.map((sz, r) => Math.max(0, sz - pinnedCount[r]));
  let capSum = cap.reduce((a, b) => a + b, 0);
  while (capSum > free.length) {
    const r = cap.indexOf(Math.max(...cap));
    cap[r]--;
    capSum--;
  }
  while (capSum < free.length) {
    const r = cap.indexOf(Math.min(...cap));
    cap[r]++;
    capSum++;
  }

  if (options?.mode === "mixed") {
    // --- FULLSTENDIG MIKS ---
    // Enkel pseudotilfeldig generator hvis seed er spesifisert, ellers Math.random
    let seedVal = options.seed !== undefined ? Math.abs(options.seed) : Math.random() * 100000;
    const rng = () => {
      seedVal = (seedVal * 9301 + 49297) % 233280;
      return seedVal / 233280;
    };

    // 1. Sorter frie korister etter høyde stigende (laveste foran, høyeste bakerst)
    const sortedFree = free.slice().sort((a, b) => {
      const ha = sMap.get(a.singerId)!.height;
      const hb = sMap.get(b.singerId)!.height;
      return ha - hb || (rng() - 0.5);
    });

    // 2. Fordel koristene på radene iht. radkapasiteten (cap[r])
    const rowFreeMembers: Placement[][] = Array.from({ length: rows }, () => []);
    let fIdx = 0;
    for (let r = 0; r < rows; r++) {
      const take = cap[r];
      rowFreeMembers[r] = sortedFree.slice(fIdx, fIdx + take);
      fIdx += take;
    }

    // 3. For hver rad: optimaliser spredning av stemmegrupper (minimere naboer med samme stemme)
    const assigned = new Map<number, { row: number; slot: number }>();
    let C = 1;
    const rowGroupAtSlot: number[][] = Array.from({ length: rows }, () => []);

    for (let r = 0; r < rows; r++) {
      const membersInRow = rowFreeMembers[r];
      const mixedOrder = arrangeMixedRow(
        membersInRow,
        r > 0 ? rowGroupAtSlot[r - 1] : undefined,
        sMap,
        rng,
      );

      const rowPinned = pinned.filter((q) => q.row === r).sort((a, b) => a.slot - b.slot);
      const seq: Placement[] = [...mixedOrder];
      for (const p of rowPinned) {
        seq.splice(Math.min(Math.max(p.slot, 0), seq.length), 0, p);
      }

      rowGroupAtSlot[r] = [];
      seq.forEach((p, i) => {
        assigned.set(p.singerId, { row: r, slot: i });
        rowGroupAtSlot[r][i] = effectiveGroupId(p, sMap.get(p.singerId)!);
      });
      C = Math.max(C, seq.length);
    }

    const next = placements.map((p) => {
      const a = assigned.get(p.singerId);
      const base = unpinned.has(p.singerId) ? { ...p, pinned: false } : p;
      return a ? { ...base, row: a.row, slot: a.slot } : base;
    });
    return { placements: next, settings: { ...settings, rows, slots: C, rowAdjustments: undefined } };
  }

  // --- BLOKKSORTERING (SATB, TSAB, STBA eller egendefinert rekkefølge) ---
  const defaultOrder = sortedGroups(ctx.groups).map((g) => g.id);
  const groupOrder =
    options?.groupOrder && options.groupOrder.length > 0 ? options.groupOrder : defaultOrder;

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

  // Fordel hver stemmegruppe på radene i forhold til ledig plass igjen i hver rad.
  const remaining = cap.slice();
  const segments: Placement[][][] = Array.from({ length: rows }, () => []);
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
    const total = remaining.reduce((a, b) => a + b, 0);
    const give = remaining.map((c) => (total ? (n * c) / total : 0));
    const take = give.map((g) => Math.floor(g));
    let left = n - take.reduce((a, b) => a + b, 0);
    const byFrac = give
      .map((g, r) => ({ r, f: g - Math.floor(g) }))
      .sort((a, b) => b.f - a.f || b.r - a.r);
    for (const { r } of byFrac) {
      if (left <= 0) break;
      if (take[r] < remaining[r]) {
        take[r]++;
        left--;
      }
    }
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      const part = list.slice(idx, idx + take[r]);
      idx += take[r];
      remaining[r] -= take[r];
      if (part.length) segments[r].push(part);
    }
  }

  // Bygg hver rad som en tett rekke: stemmegruppene i blokker, høyeste i midten av blokken.
  const assigned = new Map<number, { row: number; slot: number }>();
  let C = 1;
  for (let r = 0; r < rows; r++) {
    const seq: Placement[] = [];
    for (const part of segments[r]) {
      const k = part.length;
      const positions = Array.from({ length: k }, (_, j) => j).sort(
        (a, b) => Math.abs(a - (k - 1) / 2) - Math.abs(b - (k - 1) / 2) || a - b,
      );
      const tallFirst = part.slice().sort((a, c) => {
        return sMap.get(c.singerId)!.height - sMap.get(a.singerId)!.height;
      });
      const block: Placement[] = new Array(k);
      tallFirst.forEach((p, i) => {
        block[positions[i]] = p;
      });
      seq.push(...block);
    }
    for (const p of pinned
      .filter((q) => q.row === r)
      .sort((a, b) => a.slot - b.slot)) {
      seq.splice(Math.min(Math.max(p.slot, 0), seq.length), 0, p);
    }
    seq.forEach((p, i) => assigned.set(p.singerId, { row: r, slot: i }));
    C = Math.max(C, seq.length);
  }

  const next = placements.map((p) => {
    const a = assigned.get(p.singerId);
    const base = unpinned.has(p.singerId) ? { ...p, pinned: false } : p;
    return a ? { ...base, row: a.row, slot: a.slot } : base;
  });
  return { placements: next, settings: { ...settings, rows, slots: C, rowAdjustments: undefined } };
}

/**
 * Setter inn en sanger i en rad på en gitt posisjon og nummererer raden på nytt (0..n-1),
 * slik at raden fortsatt er tett uten hull.
 */
function insertIntoRow(
  placements: Placement[],
  singerId: number,
  row: number,
  index: number,
): Placement[] {
  const inRow = placements
    .filter((p) => p.singerId !== singerId && onGrid(p) && p.row === row)
    .sort((a, b) => a.slot - b.slot);
  const me = placements.find((p) => p.singerId === singerId)!;
  const seq = inRow.map((p) => p.singerId);
  seq.splice(Math.min(Math.max(index, 0), seq.length), 0, me.singerId);
  const slotOf = new Map(seq.map((id, i) => [id, i]));
  return placements.map((p) => {
    if (p.singerId === singerId) return { ...p, row, slot: slotOf.get(singerId)!, status: p.status === "bench" ? "choir" : p.status };
    if (slotOf.has(p.singerId)) return { ...p, slot: slotOf.get(p.singerId)! };
    return p;
  });
}

/** Plasserer en sanger inn i raden ved sin (effektive) stemmegruppe, uten å lage hull. */
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
  const order = sortedGroups(ctx.groups).map((g) => g.id);
  const orderOf = (g: number) => {
    const i = order.indexOf(g);
    return i < 0 ? order.length : i;
  };

  const others = state.placements.filter((q) => {
    const sg = sMap.get(q.singerId);
    return sg && q.singerId !== singerId && onGrid(q);
  });
  const sameGroup = others.filter((q) => effectiveGroupId(q, sMap.get(q.singerId)!) === gid);
  const heights = [...sameGroup.map((q) => sMap.get(q.singerId)!.height), singer.height].sort(
    (a, b) => a - b,
  );
  const rank = heights.indexOf(singer.height);
  const pct = heights.length > 1 ? rank / (heights.length - 1) : 0.5;
  const trow = Math.min(rows - 1, Math.max(0, Math.round(pct * (rows - 1))));

  const rowMembers = others.filter((q) => q.row === trow).sort((a, b) => a.slot - b.slot);
  let index = rowMembers.length;
  let lastSame = -1;
  rowMembers.forEach((q, i) => {
    if (effectiveGroupId(q, sMap.get(q.singerId)!) === gid) lastSame = i;
  });
  if (lastSame >= 0) {
    index = lastSame + 1;
  } else {
    const mine = orderOf(gid);
    const firstAfter = rowMembers.findIndex(
      (q) => orderOf(effectiveGroupId(q, sMap.get(q.singerId)!)) > mine,
    );
    index = firstAfter < 0 ? rowMembers.length : firstAfter;
  }

  const placements = insertIntoRow(state.placements, singerId, trow, index);
  const slots = Math.max(
    1,
    ...Array.from({ length: Math.max(rows, trow + 1) }, (_, r) =>
      placements.filter((p) => onGrid(p) && p.row === r).length,
    ),
  );
  return { placements, settings: { ...state.settings, rows: Math.max(rows, trow + 1), slots } };
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
  | { type: "insert"; row: number; index: number; x?: number; y?: number }
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

  if (target.type === "insert") {
    if (a.pinned && a.status !== "bench") return { state, error: locked };

    const targetRow = target.row;
    const targetIndex = target.index;

    // Andre sangere på rutenettet
    const others = state.placements.filter((p) => p.singerId !== sourceId && onGrid(p));

    // Målradens sangere (uten kilden), sortert etter gjeldende slot
    const inTargetRow = others
      .filter((p) => p.row === targetRow)
      .sort((p1, p2) => p1.slot - p2.slot);

    // Sett inn sourceId på ønsket indeks i målraden
    const targetSeq = inTargetRow.map((p) => p.singerId);
    targetSeq.splice(Math.min(Math.max(targetIndex, 0), targetSeq.length), 0, sourceId);

    const targetSlotMap = new Map<number, number>();
    targetSeq.forEach((id, idx) => targetSlotMap.set(id, idx));

    // Hvis kilden kom fra en annen rad, renummerer vi kilderaden så den forblir tett
    const sourceOldRow = a.status !== "bench" && a.row >= 0 ? a.row : null;
    const sourceSlotMap = new Map<number, number>();
    if (sourceOldRow !== null && sourceOldRow !== targetRow) {
      const inSourceRow = others
        .filter((p) => p.row === sourceOldRow)
        .sort((p1, p2) => p1.slot - p2.slot);
      inSourceRow.forEach((p, idx) => sourceSlotMap.set(p.singerId, idx));
    }

    const nextPlacements = state.placements.map((p) => {
      if (p.singerId === sourceId) {
        return {
          ...p,
          row: targetRow,
          slot: targetSlotMap.get(sourceId)!,
          status: "choir" as const,
        };
      }
      if (p.row === targetRow && targetSlotMap.has(p.singerId)) {
        return { ...p, slot: targetSlotMap.get(p.singerId)! };
      }
      if (sourceOldRow !== null && p.row === sourceOldRow && sourceSlotMap.has(p.singerId)) {
        return { ...p, slot: sourceSlotMap.get(p.singerId)! };
      }
      return p;
    });

    const slots = Math.max(state.settings.slots, targetSeq.length);
    const rows = Math.max(state.settings.rows, targetRow + 1);

    return {
      state: {
        ...state,
        settings: { ...state.settings, slots, rows },
        placements: nextPlacements,
      },
    };
  }

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
