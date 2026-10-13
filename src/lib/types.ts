export type Shape = "rows" | "arc";
export type SoloLayout = "center" | "spread" | "pairs";
export type PlacementStatus = "choir" | "solo" | "bench";

export interface VoiceGroup {
  id: number;
  name: string;
  abbr: string;
  color: string;
  sortOrder: number;
}

export interface Singer {
  id: number;
  fullName: string;
  nickname: string;
  voiceGroupId: number;
  height: number;
  isActive: boolean;
}

export interface Venue {
  id: number;
  name: string;
  widthM: number;
  depthM: number;
}

export interface Concert {
  id: number;
  name: string;
  date: string | null;
  venueId: number | null;
  stageWidth: number;
  stageDepth: number;
}

export interface RowAdjustment {
  /** Sideveis forskyving i meter (-2.0 til +2.0m, standard 0). */
  shift?: number;
  /** Utstrekning i prosent (50% til 150%, standard 100%). */
  spread?: number;
}

export interface SceneSettings {
  /** Sangeravstand (senter-til-senter i cm, 60-120). */
  singerSpacing: number;
  /** Korets maksimale bredde i prosent av scenen (30-100). */
  choirWidthPct: number;
  shape: Shape;
  /** Bue/amfi-krumning: 0 = rette rader, opp til 100 (krapp). `shape` utledes fra denne. */
  arc: number;
  /** Forskyv annenhver rad en halv plassbredde. */
  zigzag?: boolean;
  rowsAuto: boolean;
  rows: number;
  /** Antall plasser (kolonner) per rad i rutenettet. */
  slots: number;
  soloLayout: SoloLayout;
  /** Behold solistens opprinnelige korplass som tomt spor. */
  soloKeepGap: boolean;
  /** Individuelle justeringer per rad (forskyving og utstrekning). */
  rowAdjustments?: Record<number, RowAdjustment>;
}

export interface Placement {
  singerId: number;
  row: number;
  slot: number;
  status: PlacementStatus;
  pinned: boolean;
  /** Midlertidig stemmegruppe kun for denne scenen. */
  overrideGroupId: number | null;
}

export interface Scene {
  id: number;
  concertId: number;
  position: number;
  title: string;
  settings: SceneSettings;
  placements: Placement[];
  updatedAt: string;
}

export interface Template {
  id: number;
  name: string;
  settings: SceneSettings;
  placements: Placement[];
  createdAt: string;
}

export const DEFAULT_SETTINGS: SceneSettings = {
  singerSpacing: 75,
  choirWidthPct: 90,
  shape: "rows",
  arc: 0,
  zigzag: false,
  rowsAuto: true,
  rows: 3,
  slots: 10,
  soloLayout: "center",
  soloKeepGap: false,
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/** Gjør om ukjent JSON til gyldige scene-innstillinger. */
export function sanitizeRowAdjustments(raw: unknown): Record<number, RowAdjustment> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<number, RowAdjustment> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const row = Number(k);
    if (!Number.isInteger(row) || row < 0 || row > 10) continue;
    if (!v || typeof v !== "object") continue;
    const item = v as Record<string, unknown>;
    const shift =
      typeof item.shift === "number" && Number.isFinite(item.shift)
        ? clamp(Math.round(item.shift * 100) / 100, -3, 3)
        : 0;
    const spread =
      typeof item.spread === "number" && Number.isFinite(item.spread)
        ? clamp(Math.round(item.spread), 40, 200)
        : 100;
    if (shift !== 0 || spread !== 100) {
      out[row] = { shift, spread };
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function sanitizeSettings(raw: unknown): SceneSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  // Eldre data hadde en egen bryter for rette rader; «rows» betyr da arc = 0.
  const arc = r.shape === "rows" ? 0 : clamp(Math.round(num(r.arc, d.arc)), 0, 100);
  const singerSpacing = clamp(Math.round(num(r.singerSpacing, d.singerSpacing)), 55, 130);
  const rowAdjustments = sanitizeRowAdjustments(r.rowAdjustments);
  return {
    singerSpacing,
    choirWidthPct: clamp(Math.round(num(r.choirWidthPct, d.choirWidthPct)), 30, 100),
    shape: arc > 0 ? "arc" : "rows",
    arc,
    zigzag: false,
    rowsAuto: r.rowsAuto !== false,
    rows: clamp(Math.round(num(r.rows, d.rows)), 1, 10),
    slots: clamp(Math.round(num(r.slots, d.slots)), 1, 60),
    soloLayout:
      r.soloLayout === "spread" || r.soloLayout === "pairs" ? r.soloLayout : "center",
    soloKeepGap: r.soloKeepGap === true,
    ...(rowAdjustments ? { rowAdjustments } : {}),
  };
}

export function sanitizePlacements(raw: unknown): Placement[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: Placement[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const singerId = num(p.singerId, NaN);
    if (!Number.isInteger(singerId) || seen.has(singerId)) continue;
    seen.add(singerId);
    out.push({
      singerId,
      row: Math.round(num(p.row, -1)),
      slot: Math.round(num(p.slot, -1)),
      status: p.status === "solo" || p.status === "bench" ? p.status : "choir",
      pinned: p.pinned === true,
      overrideGroupId:
        typeof p.overrideGroupId === "number" && Number.isInteger(p.overrideGroupId)
          ? p.overrideGroupId
          : null,
    });
  }
  return out;
}
