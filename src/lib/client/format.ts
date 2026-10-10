import type { Singer, VoiceGroup } from "../types";

/** Initialer basert på kallenavn: «Ola Nord» → «ON», «Ingrid» → «In». */
export function initials(nickname: string): string {
  const words = nickname
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const w = words[0];
  return w.length === 1 ? w.toUpperCase() : w[0].toUpperCase() + w[1].toLowerCase();
}

/** Velger svart/hvit tekst som gir best kontrast mot en bakgrunnsfarge. */
export function contrastText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? "#111827" : "#ffffff";
}

export function formatDate(date: string | null): string {
  if (!date) return "";
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" });
}

export function describeLent(
  singer: Singer,
  groupId: number | null,
  groups: Map<number, VoiceGroup>,
): string | null {
  if (groupId === null || groupId === singer.voiceGroupId) return null;
  const now = groups.get(groupId);
  const home = groups.get(singer.voiceGroupId);
  if (!now || !home) return null;
  return `Synger ${now.abbr} (Fast: ${home.abbr})`;
}
