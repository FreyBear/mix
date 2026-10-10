export interface ProfileGroup {
  name: string;
  abbr: string;
  color: string;
}

/** Forhåndsdefinerte stemmegruppe-profiler. Alt kan endres fritt etterpå. */
export const VOICE_PROFILES: Record<string, { label: string; groups: ProfileGroup[] }> = {
  SATB: {
    label: "SATB (blandet kor)",
    groups: [
      { name: "Sopran", abbr: "S", color: "#e11d48" },
      { name: "Alt", abbr: "A", color: "#f59e0b" },
      { name: "Tenor", abbr: "T", color: "#2563eb" },
      { name: "Bass", abbr: "B", color: "#16a34a" },
    ],
  },
  SSAA: {
    label: "SSAA (damekor)",
    groups: [
      { name: "Sopran 1", abbr: "S1", color: "#e11d48" },
      { name: "Sopran 2", abbr: "S2", color: "#f472b6" },
      { name: "Alt 1", abbr: "A1", color: "#f59e0b" },
      { name: "Alt 2", abbr: "A2", color: "#a16207" },
    ],
  },
  TTBB: {
    label: "TTBB (herrekor)",
    groups: [
      { name: "Tenor 1", abbr: "T1", color: "#2563eb" },
      { name: "Tenor 2", abbr: "T2", color: "#06b6d4" },
      { name: "Bass 1", abbr: "B1", color: "#16a34a" },
      { name: "Bass 2", abbr: "B2", color: "#7c3aed" },
    ],
  },
  SSAATTBB: {
    label: "S1 S2 A1 A2 T1 T2 B1 B2 (delt blandet kor)",
    groups: [
      { name: "Sopran 1", abbr: "S1", color: "#e11d48" },
      { name: "Sopran 2", abbr: "S2", color: "#f472b6" },
      { name: "Alt 1", abbr: "A1", color: "#f59e0b" },
      { name: "Alt 2", abbr: "A2", color: "#a16207" },
      { name: "Tenor 1", abbr: "T1", color: "#2563eb" },
      { name: "Tenor 2", abbr: "T2", color: "#06b6d4" },
      { name: "Bass 1", abbr: "B1", color: "#16a34a" },
      { name: "Bass 2", abbr: "B2", color: "#7c3aed" },
    ],
  },
};
