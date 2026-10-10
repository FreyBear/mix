import type { VoiceGroup } from "./types";

export interface ParsedSinger {
  fullName: string;
  nickname: string;
  voiceGroupId: number;
  height: number;
  isActive: boolean;
}

export interface ImportResult {
  rows: ParsedSinger[];
  skipped: { line: number; text: string; reason: string }[];
}

const FIELD_KEYS: Record<string, string> = {
  navn: "fullName",
  fullname: "fullName",
  fulltnavn: "fullName",
  name: "fullName",
  kallenavn: "nickname",
  nickname: "nickname",
  kortnavn: "nickname",
  stemme: "voice",
  stemmegruppe: "voice",
  gruppe: "voice",
  voice: "voice",
  voicegroup: "voice",
  hoyde: "height",
  høyde: "height",
  height: "height",
  aktiv: "active",
  active: "active",
  isactive: "active",
};

function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 5).join("\n");
  const counts: Record<string, number> = {
    "\t": (sample.match(/\t/g) ?? []).length,
    ";": (sample.match(/;/g) ?? []).length,
    ",": (sample.match(/,/g) ?? []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delim && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Tolker CSV eller innlimt tekst: Navn; Kallenavn; Stemmegruppe; Høyde; Aktiv. */
export function parseSingerImport(text: string, groups: VoiceGroup[]): ImportResult {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd());
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  const result: ImportResult = { rows: [], skipped: [] };
  if (nonEmpty.length === 0) return result;
  const delim = detectDelimiter(nonEmpty);

  let order = ["fullName", "nickname", "voice", "height", "active"];
  const firstCells = splitLine(nonEmpty[0], delim).map((c) => c.toLowerCase().replace(/\s+/g, ""));
  const mapped = firstCells.map((c) => FIELD_KEYS[c]);
  let startIdx = 0;
  if (mapped.filter(Boolean).length >= 2 && mapped.includes("fullName")) {
    order = mapped.map((m) => m ?? "");
    startIdx = 1;
  }

  const byKey = new Map<string, number>();
  for (const g of groups) {
    byKey.set(g.abbr.toLowerCase(), g.id);
    byKey.set(g.name.toLowerCase(), g.id);
  }

  let lineNo = 0;
  let seen = 0;
  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    if (!raw.trim()) continue;
    lineNo = li + 1;
    seen++;
    if (seen <= startIdx) continue;
    const cells = splitLine(raw, delim);
    const get = (field: string) => {
      const i = order.indexOf(field);
      return i >= 0 ? (cells[i] ?? "").trim() : "";
    };
    const fullName = get("fullName");
    if (!fullName) {
      result.skipped.push({ line: lineNo, text: raw, reason: "Mangler navn" });
      continue;
    }
    const voice = get("voice");
    const groupId = byKey.get(voice.toLowerCase());
    if (!groupId) {
      result.skipped.push({
        line: lineNo,
        text: raw,
        reason: voice ? `Ukjent stemmegruppe «${voice}»` : "Mangler stemmegruppe",
      });
      continue;
    }
    const h = Number(get("height").replace(",", "."));
    const activeRaw = get("active").toLowerCase();
    result.rows.push({
      fullName,
      nickname: get("nickname") || fullName.split(/\s+/)[0],
      voiceGroupId: groupId,
      height: Number.isFinite(h) && h >= 100 && h <= 250 ? Math.round(h) : 170,
      isActive: !["nei", "no", "false", "0", "n"].includes(activeRaw),
    });
  }
  return result;
}
