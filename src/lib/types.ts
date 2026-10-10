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

export interface SceneSettings {
  /** Korets maksimale bredde i prosent av scenen (30-100). */
  choirWidthPct: number;
  shape: Shape;
  /** Bue/amfi-krumning: 0 = rette rader, opp til 100 (krapp). `shape` utledes fra denne. */
  arc: number;
  /** Forskyv annenhver rad en halv plassbredde. */
  zigzag: boolean;
  rowsAuto: boolean;
  rows: number;
  /** Antall plasser (kolonner) per rad i rutenettet. */
  slots: number;
  soloLayout: SoloLayout;
  /** Behold solistens opprinnelige korplass som tomt spor. */
  soloKeepGap: boolean;
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
export function sanitizeSettings(raw: unknown): SceneSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  // Eldre data hadde en egen bryter for rette rader; «rows» betyr da arc = 0.
  const arc = r.shape === "rows" ? 0 : clamp(Math.round(num(r.arc, d.arc)), 0, 100);
  return {
    choirWidthPct: clamp(Math.round(num(r.choirWidthPct, d.choirWidthPct)), 30, 100),
    shape: arc > 0 ? "arc" : "rows",
    arc,
    zigzag: r.zigzag === true,
    rowsAuto: r.rowsAuto !== false,
    rows: clamp(Math.round(num(r.rows, d.rows)), 1, 10),
    slots: clamp(Math.round(num(r.slots, d.slots)), 1, 60),
    soloLayout:
      r.soloLayout === "spread" || r.soloLayout === "pairs" ? r.soloLayout : "center",
    soloKeepGap: r.soloKeepGap === true,
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
