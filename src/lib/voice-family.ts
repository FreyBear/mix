import type { VoiceGroup } from "./types";

export type VoiceFamilyKey =
  | "sopran"
  | "mezzosopran"
  | "alt"
  | "kontraalt"
  | "tenor"
  | "baryton"
  | "bass"
  | "other";

export interface VoiceFamilyMeta {
  key: VoiceFamilyKey;
  label: string;
  shortLabel: string;
  weight: number;
}

export const VOICE_FAMILIES: VoiceFamilyMeta[] = [
  { key: "sopran", label: "Sopran", shortLabel: "S", weight: 10 },
  { key: "mezzosopran", label: "Mezzosopran", shortLabel: "MS", weight: 20 },
  { key: "alt", label: "Alt", shortLabel: "A", weight: 30 },
  { key: "kontraalt", label: "Kontraalt", shortLabel: "CA", weight: 40 },
  { key: "tenor", label: "Tenor", shortLabel: "T", weight: 50 },
  { key: "baryton", label: "Baryton", shortLabel: "Bar", weight: 60 },
  { key: "bass", label: "Bass", shortLabel: "B", weight: 70 },
  { key: "other", label: "Annet", shortLabel: "Annet", weight: 90 },
];

const FAMILY_MAP = new Map<VoiceFamilyKey, VoiceFamilyMeta>(
  VOICE_FAMILIES.map((f) => [f.key, f]),
);

/**
 * Identifiserer stemmefamilie for en stemmegruppe.
 * Sjekker eksplisitt kategori først, deretter navn og forkortelse.
 * Håndterer både standard SATB, SSAATTBB, samt utvidede grupper
 * som Mezzosopran, Kontraalt og Baryton.
 */
export function identifyVoiceFamily(
  group: Pick<VoiceGroup, "name" | "abbr"> & { category?: string | null },
): VoiceFamilyKey {
  if (group.category && FAMILY_MAP.has(group.category as VoiceFamilyKey)) {
    return group.category as VoiceFamilyKey;
  }

  const name = group.name.trim().toLowerCase();
  const abbr = group.abbr.trim().toLowerCase();

  // 1. Mezzosopran (sjekkes før Sopran)
  if (
    abbr.startsWith("ms") ||
    abbr.startsWith("mezzo") ||
    name.startsWith("mezzo") ||
    name.includes("mezzosopran") ||
    name.includes("mezzo-sopran")
  ) {
    return "mezzosopran";
  }

  // 2. Kontraalt (sjekkes før Alt)
  if (
    abbr.startsWith("ca") ||
    abbr.startsWith("ka") ||
    name.startsWith("kontra") ||
    name.startsWith("contra") ||
    name.includes("kontraalt") ||
    name.includes("contralto")
  ) {
    return "kontraalt";
  }

  // 3. Baryton (sjekkes før Bass)
  if (
    abbr.startsWith("bar") ||
    name.startsWith("baryton") ||
    name.startsWith("bariton") ||
    name.includes("baritone")
  ) {
    return "baryton";
  }

  // 4. Sopran
  if (abbr.startsWith("s") || name.startsWith("sopran") || name.startsWith("soprano")) {
    return "sopran";
  }

  // 5. Alt
  if (abbr.startsWith("a") || name.startsWith("alt") || name.startsWith("alto")) {
    return "alt";
  }

  // 6. Tenor
  if (abbr.startsWith("t") || name.startsWith("tenor")) {
    return "tenor";
  }

  // 7. Bass
  if (abbr.startsWith("b") || name.startsWith("bass") || name.startsWith("basso")) {
    return "bass";
  }

  return "other";
}

/**
 * Returnerer delstemme-nummer (f.eks. S1 -> 1, S2 -> 2, Sopran (udelt) -> 9).
 * Dette sikrer at 1 kommer før 2, og udelt samles logisk inntil.
 */
export function subVoiceRank(group: Pick<VoiceGroup, "name" | "abbr">): number {
  const text = `${group.abbr} ${group.name}`.toLowerCase();
  if (/\b1\b|1(?![0-9])/.test(text)) return 1;
  if (/\b2\b|2(?![0-9])/.test(text)) return 2;
  if (/\b3\b|3(?![0-9])/.test(text)) return 3;
  if (/\b4\b|4(?![0-9])/.test(text)) return 4;
  return 9; // Udelt eller uspesifisert
}

/**
 * Sammenligner to stemmegrupper slik at:
 * 1. Hovedstemmer ordnes i naturlig kormusikk-rekkefølge (Sopran -> Mezzo -> Alt -> CA -> Tenor -> Baryton -> Bass).
 * 2. Innad i samme familie ordnes undergruppene (S1 -> S2 -> S).
 * 3. Ved likhet brukes sortOrder, deretter navn og ID.
 */
export function compareVoiceGroups(a: VoiceGroup, b: VoiceGroup): number {
  const famA = identifyVoiceFamily(a);
  const famB = identifyVoiceFamily(b);

  const weightA = FAMILY_MAP.get(famA)?.weight ?? 99;
  const weightB = FAMILY_MAP.get(famB)?.weight ?? 99;

  if (weightA !== weightB) {
    return weightA - weightB;
  }

  // Samme familie: sorter undergrupper (1, 2, udelt)
  const rankA = subVoiceRank(a);
  const rankB = subVoiceRank(b);
  if (rankA !== rankB) {
    return rankA - rankB;
  }

  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }

  const nameDiff = a.name.localeCompare(b.name, "nb");
  if (nameDiff !== 0) return nameDiff;

  return a.id - b.id;
}

export interface GroupedFamily {
  family: VoiceFamilyMeta;
  groups: VoiceGroup[];
}

/**
 * Grupperer en liste med stemmegrupper per stemmefamilie.
 * Nyttig for nedtrekksmenyer (optgroup) og oppdelte visninger.
 */
export function groupVoiceGroupsByFamily(groups: VoiceGroup[]): GroupedFamily[] {
  const sorted = [...groups].sort(compareVoiceGroups);
  const map = new Map<VoiceFamilyKey, VoiceGroup[]>();

  for (const g of sorted) {
    const famKey = identifyVoiceFamily(g);
    if (!map.has(famKey)) map.set(famKey, []);
    map.get(famKey)!.push(g);
  }

  const result: GroupedFamily[] = [];
  for (const meta of VOICE_FAMILIES) {
    const list = map.get(meta.key);
    if (list && list.length > 0) {
      result.push({ family: meta, groups: list });
    }
  }

  return result;
}

/**
 * Sjekker om en sanger matcher et filter.
 * Filteret kan være:
 * - "all": Alle sangere
 * - number: Spesifikk stemmegruppe-ID (f.eks. 5 for Sopran 1)
 * - "family:<key>": Hele familien (f.eks. "family:sopran" matcher S1, S2 og S)
 */
export function matchesGroupFilter(
  voiceGroupId: number,
  filter: number | string,
  groupMap: Map<number, VoiceGroup>,
): boolean {
  if (filter === "all") return true;

  if (typeof filter === "number") {
    return voiceGroupId === filter;
  }

  if (filter.startsWith("family:")) {
    const targetFamily = filter.slice("family:".length);
    const group = groupMap.get(voiceGroupId);
    if (!group) return false;
    return identifyVoiceFamily(group) === targetFamily;
  }

  const asNum = Number(filter);
  if (!Number.isNaN(asNum)) {
    return voiceGroupId === asNum;
  }

  return true;
}
