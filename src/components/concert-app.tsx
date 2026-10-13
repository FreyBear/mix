"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Lock,
  LockOpen,
  MoreHorizontal,
  Printer,
  Settings,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { useBootstrap, type Bootstrap } from "@/lib/client/use-bootstrap";
import { describeLent, formatDate } from "@/lib/client/format";
import { computeLayout } from "@/lib/layout";
import {
  autoSort,
  moveSinger,
  reconcile,
  setOverride,
  toggleBench,
  togglePin,
  toggleSolo,
  type DropTarget,
  type OpResult,
  type PlacementCtx,
  type PlacementState,
} from "@/lib/placement";
import type { Concert, Scene, SceneSettings } from "@/lib/types";
import { AttendanceDialog } from "./attendance-dialog";
import { BenchDrawer } from "./bench-drawer";
import { StageSetupCard } from "./stage-setup-card";
import { SongMenuDialog } from "./song-menu-dialog";
import { PinDialog } from "./pin-dialog";
import { ChangePasswordDialog } from "./change-password-dialog";
import { PrintSheet } from "./print-sheet";
import { SingerCard } from "./singer-card";
import { RowAdjustmentCard } from "./row-adjustment-card";
import type { RowAdjustment } from "@/lib/types";
import { StageCanvas, type StageHandle } from "./stage-canvas";
import { useToast } from "./toast";

interface ConcertData {
  concert: Concert;
  attendingIds: number[];
  scenes: Scene[];
}

const LS = {
  me: "mixup.me",
  concert: "mixup.concert",
  scene: (cid: number) => `mixup.scene.${cid}`,
};

function readLS(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* privat modus e.l. */
  }
}

function pickConcertId(concerts: Concert[]): number | null {
  if (concerts.length === 0) return null;
  const params = new URLSearchParams(window.location.search);
  const fromUrl = Number(params.get("c"));
  if (concerts.some((c) => c.id === fromUrl)) return fromUrl;
  const fromLs = Number(readLS(LS.concert));
  if (concerts.some((c) => c.id === fromLs)) return fromLs;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = concerts
    .filter((c) => c.date && c.date >= today)
    .sort((a, b) => (a.date! < b.date! ? -1 : 1));
  return (upcoming[0] ?? concerts[0]).id;
}

export default function ConcertApp() {
  const { data, error, reload } = useBootstrap();

  if (error && !data) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-danger">{error}</p>
        <button className="btn btn-primary" onClick={() => void reload()}>
          Prøv igjen
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-dvh items-center justify-center text-muted" role="status">
        Laster …
      </div>
    );
  }
  return <Viewer boot={data} reload={reload} />;
}

function Viewer({
  boot,
  reload,
}: {
  boot: Bootstrap;
  reload: () => Promise<Bootstrap | null>;
}) {
  const toast = useToast();
  const admin = boot.admin;

  const [concertId, setConcertId] = useState<number | null>(() => pickConcertId(boot.concerts));
  const [cd, setCd] = useState<ConcertData | null>(null);
  const cdRef = useRef<ConcertData | null>(null);
  const [sceneId, setSceneId] = useState<number | null>(null);
  const [meId, setMeId] = useState<number | null>(() => {
    const n = Number(readLS(LS.me));
    return boot.singers.some((s) => s.id === n) ? n : null;
  });
  const editMode = admin;
  const [showSetup, setShowSetup] = useState(false);
  const [showSongMenu, setShowSongMenu] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const stage = useRef<StageHandle | null>(null);

  // ---- Lagring ----------------------------------------------------------
  const localVersion = useRef(0);
  const pending = useRef(new Map<number, Scene>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushing = useRef(0);
  const reloadRef = useRef(reload);
  const toastRef = useRef(toast);
  useEffect(() => {
    reloadRef.current = reload;
    toastRef.current = toast;
  });

  const setCdBoth = useCallback((next: ConcertData | null) => {
    cdRef.current = next;
    setCd(next);
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const entries = [...pending.current.entries()];
    pending.current.clear();
    if (entries.length === 0) return;
    flushing.current++;
    setSaving(true);
    try {
      for (const [id, sc] of entries) {
        await api("PUT", `/api/scenes/${id}`, {
          title: sc.title,
          settings: sc.settings,
          placements: sc.placements,
        });
      }
    } catch (e) {
      toastRef.current(e instanceof Error ? e.message : "Kunne ikke lagre", "error");
      if (e instanceof ApiError && e.status === 401) {
        void reloadRef.current();
      }
    } finally {
      flushing.current--;
      if (flushing.current === 0) setSaving(false);
    }
  }, []);

  const commitScene = useCallback(
    (id: number, fn: (s: Scene) => Scene) => {
      const cur = cdRef.current;
      if (!cur) return;
      const scene = cur.scenes.find((s) => s.id === id);
      if (!scene) return;
      const updated = fn(scene);
      localVersion.current++;
      pending.current.set(id, updated);
      setCdBoth({ ...cur, scenes: cur.scenes.map((s) => (s.id === id ? updated : s)) });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 350);
    },
    [flush, setCdBoth],
  );

  // ---- Henting av konsert ----------------------------------------------
  const loadConcert = useCallback(
    async (id: number, initial: boolean) => {
      const version = localVersion.current;
      try {
        const res = await api<ConcertData>("GET", `/api/concerts/${id}`);
        if (version !== localVersion.current || pending.current.size > 0 || flushing.current > 0) {
          return;
        }
        setCdBoth(res);
        setLoadError(null);
        if (initial) {
          const params = new URLSearchParams(window.location.search);
          const fromUrl = Number(params.get("s"));
          const fromLs = Number(readLS(LS.scene(id)));
          const pick =
            res.scenes.find((s) => s.id === fromUrl) ??
            res.scenes.find((s) => s.id === fromLs) ??
            res.scenes[0];
          setSceneId(pick ? pick.id : null);
          setFitSignal((n) => n + 1);
        }
      } catch (e) {
        if (initial) setLoadError(e instanceof Error ? e.message : "Kunne ikke hente konserten");
      }
    },
    [setCdBoth],
  );

  useEffect(() => {
    if (concertId === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCdBoth(null);
    setSelectedId(null);
    void loadConcert(concertId, true);
  }, [concertId, loadConcert, setCdBoth]);

  // Jevnlig oppdatering slik at mobiler følger dirigentens endringer.
  useEffect(() => {
    if (concertId === null) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void loadConcert(concertId, false);
    };
    const id = setInterval(tick, 6000);
    const bootId = setInterval(() => {
      if (document.visibilityState === "visible") void reloadRef.current();
    }, 30000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      clearInterval(bootId);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [concertId, loadConcert]);

  // Hold URL og lokal lagring i takt med valgene.
  useEffect(() => {
    if (concertId === null) return;
    writeLS(LS.concert, String(concertId));
    const url = new URL(window.location.href);
    url.searchParams.set("c", String(concertId));
    if (sceneId !== null) {
      url.searchParams.set("s", String(sceneId));
      writeLS(LS.scene(concertId), String(sceneId));
    }
    window.history.replaceState(null, "", url.toString());
  }, [concertId, sceneId]);



  // ---- Avledede data ------------------------------------------------------
  const singers = useMemo(() => new Map(boot.singers.map((s) => [s.id, s])), [boot.singers]);
  const groups = useMemo(() => new Map(boot.groups.map((g) => [g.id, g])), [boot.groups]);
  const attending = useMemo(() => new Set(cd?.attendingIds ?? []), [cd?.attendingIds]);
  const scenes = cd?.scenes;
  const scene = scenes?.find((s) => s.id === sceneId) ?? scenes?.[0] ?? null;
  const sceneIndex = scene && scenes ? scenes.findIndex((s) => s.id === scene.id) : -1;
  const concert = cd?.concert ?? null;

  const validPlacements = useMemo(
    () =>
      (scene?.placements ?? []).filter((p) => singers.has(p.singerId) && attending.has(p.singerId)),
    [scene?.placements, singers, attending],
  );
  const placementMap = useMemo(
    () => new Map(validPlacements.map((p) => [p.singerId, p])),
    [validPlacements],
  );
  const layout = useMemo(() => {
    if (!concert || !scene) return null;
    return computeLayout(
      concert.stageWidth,
      concert.stageDepth,
      scene.settings,
      validPlacements.map((p) => ({ singerId: p.singerId, row: p.row, slot: p.slot, status: p.status })),
    );
  }, [concert, scene, validPlacements]);

  const ctx: PlacementCtx | null = useMemo(
    () =>
      concert
        ? { singers: boot.singers, groups: boot.groups, stageW: concert.stageWidth, stageD: concert.stageDepth }
        : null,
    [concert, boot.singers, boot.groups],
  );

  const benchEntries = useMemo(
    () =>
      validPlacements
        .filter((p) => p.status === "bench")
        .map((p) => singers.get(p.singerId)!)
        .sort((a, b) => a.nickname.localeCompare(b.nickname, "nb"))
        .map((s) => ({ singer: s, group: groups.get(s.voiceGroupId) })),
    [validPlacements, singers, groups],
  );

  const warnings = useMemo(() => {
    if (!layout) return [] as string[];
    const nick = (id: number) => singers.get(id)?.nickname ?? "?";
    const out: string[] = [];
    const collisions = layout.warnings.filter((w) => w.kind === "collision");
    collisions.slice(0, 4).forEach((w) => out.push(`${nick(w.singerIds[0])} og ${nick(w.singerIds[1])} står for tett`));
    if (collisions.length > 4) out.push(`… og ${collisions.length - 4} kollisjoner til`);
    const outside = layout.warnings.find((w) => w.kind === "outside");
    if (outside) {
      const names = outside.singerIds.slice(0, 4).map(nick).join(", ");
      out.push(`${names}${outside.singerIds.length > 4 ? " m.fl." : ""} står utenfor scenen`);
    }
    if (layout.warnings.some((w) => w.kind === "depth")) {
      out.push("Koret får ikke plass i scenedybden. Reduser antall rader eller amfi-krumningen.");
    }
    return out;
  }, [layout, singers]);

  const positionText = useCallback(
    (singerId: number): string => {
      const p = placementMap.get(singerId);
      if (!p) return "Deltar ikke i denne konserten";
      if (p.status === "bench") return "Pause i denne sangen (reservebenk)";
      if (!layout || !concert) return "";
      const node = layout.nodes.find((n) => n.singerId === singerId);
      if (!node) return "";
      const mates = layout.nodes
        .filter((n) => n.zone === node.zone && (node.zone === "solo" || n.row === node.row))
        .sort((a, b) => a.x - b.x);
      const rank = mates.findIndex((n) => n.singerId === singerId) + 1;
      return node.zone === "solo"
        ? `Solist, plass ${rank} fra venstre foran koret`
        : `Rad ${node.row + 1}, plass ${rank} fra venstre`;
    },
    [placementMap, layout, concert],
  );

  // ---- Redigering -----------------------------------------------------------
  const applyState = useCallback(
    (state: PlacementState) => {
      if (!scene) return;
      commitScene(scene.id, (s) => ({ ...s, placements: state.placements, settings: state.settings }));
    },
    [scene, commitScene],
  );

  const edit = useCallback(
    (fn: (st: PlacementState, c: PlacementCtx) => OpResult): boolean => {
      if (!scene || !ctx) return false;
      const res = fn({ placements: scene.placements, settings: scene.settings }, ctx);
      if (res.error) {
        toast(res.error, "error");
        return false;
      }
      applyState(res.state);
      return true;
    },
    [scene, ctx, applyState, toast],
  );

  const handleDrop = useCallback(
    (id: number, target: DropTarget) => {
      if (!editMode) return;
      if (edit((st, c) => moveSinger(st, id, target, c))) setSelectedId(null);
    },
    [editMode, edit],
  );

  const handleNodeTap = useCallback(
    (id: number) => {
      setShowSetup(false);
      setSelectedRow(null);
      if (!editMode || selectedId === null) {
        setSelectedId((cur) => (cur === id ? null : id));
        return;
      }
      if (selectedId === id) {
        setSelectedId(null);
        return;
      }
      if (edit((st, c) => moveSinger(st, selectedId, { type: "singer", id }, c))) setSelectedId(null);
    },
    [editMode, selectedId, edit],
  );

  const handleRowTap = useCallback(
    (row: number) => {
      if (!editMode) return;
      setShowSetup(false);
      setSelectedId(null);
      setSelectedRow((cur) => (cur === row ? null : row));
    },
    [editMode],
  );



  const handleSlotTap = useCallback(
    (row: number, slot: number) => {
      if (!editMode || selectedId === null) return;
      if (edit((st, c) => moveSinger(st, selectedId, { type: "slot", row, slot }, c))) setSelectedId(null);
    },
    [editMode, selectedId, edit],
  );

  const changeSettings = useCallback(
    (patchSettings: Partial<SceneSettings>) => {
      if (!scene || !ctx) return;
      const next = { ...scene.settings, ...patchSettings };
      if ("rows" in patchSettings || "rowsAuto" in patchSettings) {
        const nextWithoutAdj = { ...next, rowAdjustments: undefined };
        const res = autoSort(scene.placements, nextWithoutAdj, ctx, scene.settings.rows);
        applyState(res);
        setSelectedRow(null);
      } else {
        commitScene(scene.id, (s) => ({ ...s, settings: next }));
      }
    },
    [scene, ctx, applyState, commitScene],
  );

  const handleRowAdjustmentChange = useCallback(
    (adj: RowAdjustment) => {
      if (selectedRow === null || !scene) return;
      const current = scene.settings.rowAdjustments ?? {};
      const nextAdjustments = { ...current, [selectedRow]: adj };
      if (
        (adj.shift === 0 || adj.shift === undefined) &&
        (adj.spread === 100 || adj.spread === undefined)
      ) {
        delete nextAdjustments[selectedRow];
      }
      const clean = Object.keys(nextAdjustments).length > 0 ? nextAdjustments : undefined;
      changeSettings({ rowAdjustments: clean });
    },
    [selectedRow, scene, changeSettings],
  );

  const handleRowReset = useCallback(() => {
    if (selectedRow === null || !scene || !scene.settings.rowAdjustments?.[selectedRow]) return;
    const current = { ...scene.settings.rowAdjustments };
    delete current[selectedRow];
    const clean = Object.keys(current).length > 0 ? current : undefined;
    changeSettings({ rowAdjustments: clean });
  }, [selectedRow, scene, changeSettings]);

  const doAutoSort = () => {
    if (!scene || !ctx) return;
    if (!window.confirm("Auto-sortere oppstillingen etter stemmegruppe og høyde? Låste plasser blir stående.")) return;
    setSelectedRow(null);
    applyState(autoSort(scene.placements, { ...scene.settings, rowAdjustments: undefined }, ctx));
  };

  const doCopyPrev = () => {
    if (!scene || !scenes || !ctx || sceneIndex < 1) return;
    if (!window.confirm("Erstatte denne oppstillingen med oppstillingen fra forrige sang?")) return;
    const prev = scenes[sceneIndex - 1];
    applyState(reconcile({ placements: prev.placements, settings: prev.settings }, attending, ctx));
    toast("Kopierte forrige oppstilling", "success");
  };

  const newScene = async (copy: boolean) => {
    if (!concert) return;
    await flush();
    try {
      const res = await api<{ sceneId: number; scenes: Scene[] }>("POST", `/api/concerts/${concert.id}/scenes`, {
        title: "Ny sang",
        copy,
      });
      localVersion.current++;
      setCdBoth({ ...cdRef.current!, scenes: res.scenes });
      setSceneId(res.sceneId);
      setSelectedId(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Kunne ikke lage ny sang", "error");
    }
  };

  const deleteScene = async () => {
    if (!scene || !scenes) return;
    if (!window.confirm(`Slette «${scene.title}»?`)) return;
    await flush();
    try {
      const res = await api<{ scenes: Scene[] }>("DELETE", `/api/scenes/${scene.id}`);
      localVersion.current++;
      setCdBoth({ ...cdRef.current!, scenes: res.scenes });
      setSceneId(res.scenes[Math.max(0, Math.min(sceneIndex, res.scenes.length - 1))]?.id ?? null);
      setSelectedId(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Kunne ikke slette", "error");
    }
  };

  const moveScene = async (dir: -1 | 1) => {
    if (!scenes || !concert || sceneIndex < 0) return;
    const j = sceneIndex + dir;
    if (j < 0 || j >= scenes.length) return;
    await flush();
    const order = scenes.map((s) => s.id);
    [order[sceneIndex], order[j]] = [order[j], order[sceneIndex]];
    try {
      const res = await api<{ scenes: Scene[] }>("PUT", `/api/concerts/${concert.id}/scenes`, { order });
      localVersion.current++;
      setCdBoth({ ...cdRef.current!, scenes: res.scenes });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Kunne ikke flytte", "error");
    }
  };



  const openAttendance = async () => {
    await flush();
    setShowAttendance(true);
  };

  // ---- Valg og navigasjon -----------------------------------------------------
  const chooseMe = (value: string) => {
    const id = value === "" ? null : Number(value);
    setMeId(id);
    writeLS(LS.me, id === null ? null : String(id));
  };

  const goScene = (dir: -1 | 1) => {
    if (!scenes || sceneIndex < 0) return;
    const next = scenes[sceneIndex + dir];
    if (next) {
      setSceneId(next.id);
      setSelectedId(null);
    }
  };

  const logout = async () => {
    try {
      await api("DELETE", "/api/auth");
    } catch {
      /* ignorer */
    }
    setShowSetup(false);
    setShowSongMenu(false);
    setSelectedId(null);
    setSelectedRow(null);
    await reload();
  };

  // ---- Visning ------------------------------------------------------------------
  const sortedSingers = useMemo(
    () => boot.singers.filter((s) => s.isActive).sort((a, b) => a.fullName.localeCompare(b.fullName, "nb")),
    [boot.singers],
  );
  const sortedGroupList = useMemo(
    () => [...boot.groups].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [boot.groups],
  );

  const mePlacement = meId !== null ? placementMap.get(meId) : undefined;
  const meSinger = meId !== null ? singers.get(meId) : undefined;
  let barText: React.ReactNode;
  if (!meSinger) {
    barText = "Velg hvem du er øverst for å se hvor du skal stå.";
  } else if (!mePlacement) {
    barText = `${meSinger.nickname}: du deltar ikke i denne konserten.`;
  } else if (mePlacement.status === "bench") {
    barText = "Du har pause i denne sangen (reservebenk).";
  } else {
    const pos = positionText(meSinger.id);
    const eff = groups.get(mePlacement.overrideGroupId ?? meSinger.voiceGroupId);
    const lent = describeLent(meSinger, mePlacement.overrideGroupId, groups);
    barText = (
      <>
        {mePlacement.status === "solo" ? "Du er " : "Du står på "}
        <strong>{mePlacement.status === "solo" ? pos.replace(/^Solist/, "solist") : pos}</strong> (
        {lent ?? eff?.name ?? ""})
      </>
    );
  }

  const selectedSinger = selectedId !== null ? singers.get(selectedId) : undefined;
  const selectedPlacement = selectedId !== null ? placementMap.get(selectedId) : undefined;

  if (concertId === null || boot.concerts.length === 0) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold">Ingen konserter ennå</h1>
        <p className="max-w-sm text-sm text-muted">
          Logg inn som dirigent og opprett en konsert i administrasjonspanelet.
        </p>
        <div className="flex gap-2">
          {admin ? (
            <Link href="/admin" className="btn btn-primary">
              <Settings className="h-4 w-4" /> Administrasjon
            </Link>
          ) : (
            <button className="btn btn-primary" onClick={() => setShowPin(true)}>
              <Lock className="h-4 w-4" /> Dirigentlås
            </button>
          )}
        </div>


        {showPin && (
          <PinDialog
            onClose={() => setShowPin(false)}
            onSuccess={() => {
              setShowPin(false);
              void reload();
            }}
          />
        )}
        {boot.admin && boot.mustChangePassword && (
          <ChangePasswordDialog
            role={boot.superadmin ? "superadmin" : "conductor"}
            isMandatory
            onSuccess={() => void reload()}
            onClose={() => void logout()}
          />
        )}
      </div>
    );
  }



  return (
    <>
      <div className="no-print flex h-dvh flex-col overflow-hidden">
        <header className="border-b border-line bg-surface px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-accent">Mixup</span>
                {boot.concerts.length > 1 ? (
                  <select
                    aria-label="Konsert"
                    className="input h-9 max-w-[16rem] truncate py-1"
                    value={concertId}
                    onChange={(e) => {
                      setConcertId(Number(e.target.value));
                      setSceneId(null);
                    }}
                  >
                    {boot.concerts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.date ? ` (${formatDate(c.date)})` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="truncate text-sm font-semibold">
                    {concert?.name}
                    {concert?.date ? ` · ${formatDate(concert.date)}` : ""}
                  </span>
                )}
              </div>
            </div>
            <button className="btn-icon" onClick={() => window.print()} aria-label="Skriv ut" title="Skriv ut">
              <Printer className="h-5 w-5" />
            </button>
            {admin ? (
              <>
                <button
                  className="btn-icon"
                  onClick={() => void openAttendance()}
                  aria-label="Deltakelse og fravær"
                  title="Deltakelse og fravær"
                >
                  <ListChecks className="h-5 w-5" />
                </button>
                <Link href="/admin" className="btn-icon" aria-label="Administrasjon" title="Administrasjon">
                  <Settings className="h-5 w-5" />
                </Link>
                <button
                  className="btn-icon text-accent"
                  onClick={() => void logout()}
                  aria-label="Lås dirigentmodus (tilbake til sanger-visning)"
                  title="Lås dirigentmodus"
                >
                  <LockOpen className="h-5 w-5" />
                </button>
              </>
            ) : (
              <button
                className="btn-icon"
                onClick={() => setShowPin(true)}
                aria-label="Dirigentlås (skriv inn PIN)"
                title="Dirigentlås (skriv inn PIN)"
              >
                <Lock className="h-5 w-5" />
              </button>
            )}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <select
              aria-label="Hvem er du?"
              className="input h-10 min-w-0 flex-1 py-1"
              value={meId ?? ""}
              onChange={(e) => chooseMe(e.target.value)}
            >
              <option value="">Hvem er du?</option>
              {sortedGroupList.map((g) => {
                const list = sortedSingers.filter((s) => s.voiceGroupId === g.id);
                if (!list.length) return null;
                return (
                  <optgroup key={g.id} label={g.name}>
                    {list.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>

            <div className="flex min-w-0 flex-1 items-center gap-1">
              <button
                className="btn-icon h-10 w-10 shrink-0"
                onClick={() => goScene(-1)}
                disabled={sceneIndex <= 0}
                aria-label="Forrige sang"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <select
                aria-label="Sang"
                className="input h-10 min-w-0 flex-1 py-1"
                value={scene?.id ?? ""}
                onChange={(e) => {
                  setSceneId(Number(e.target.value));
                  setSelectedId(null);
                  setSelectedRow(null);
                  setShowSetup(false);
                }}
              >
                {scenes?.map((s, i) => (
                  <option key={s.id} value={s.id}>
                    {i + 1}. {s.title}
                  </option>
                ))}
              </select>
              <button
                className="btn-icon h-10 w-10 shrink-0"
                onClick={() => goScene(1)}
                disabled={!scenes || sceneIndex >= scenes.length - 1}
                aria-label="Neste sang"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              {admin && scene && (
                <button
                  className="btn-icon h-10 w-10 shrink-0 text-accent hover:bg-accent/10"
                  onClick={() => setShowSongMenu(true)}
                  aria-label="Administrer sanger"
                  title="Administrer sanger"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1">
          <main className="relative min-w-0 flex-1 bg-bg">
            {concert && scene && layout ? (
              <StageCanvas
                className="absolute inset-0"
                handleRef={stage}
                stageW={concert.stageWidth}
                stageD={concert.stageDepth}
                choirWidthPct={scene.settings.choirWidthPct}
                layout={layout}
                placements={placementMap}
                singers={singers}
                groups={groups}
                meId={meId}
                editMode={editMode}
                selectedId={selectedId}
                selectedRow={selectedRow}
                rowAdjustments={scene.settings.rowAdjustments}
                fitSignal={fitSignal}
                onNodeTap={handleNodeTap}
                onSlotTap={handleSlotTap}
                onRowTap={handleRowTap}
                onBackgroundTap={() => {
                  setSelectedId(null);
                  setSelectedRow(null);
                  setShowSetup(false);
                }}
                onDrop={handleDrop}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted" role="status">
                {loadError ?? "Laster oppstilling …"}
              </div>
            )}

            <div className="absolute top-2 left-2 flex flex-col items-start gap-2">
              {warnings.length > 0 && (
                <button
                  className="chip border-danger/50 bg-surface/90 text-danger backdrop-blur"
                  onClick={() => {
                    toast(warnings.join(". "), "error");
                  }}
                  aria-label={`${warnings.length} advarsler`}
                >
                  <TriangleAlert className="h-3.5 w-3.5" /> {warnings.length}{" "}
                  {warnings.length === 1 ? "advarsel" : "advarsler"}
                </button>
              )}
              {saving && <span className="chip bg-surface/90 backdrop-blur">Lagrer …</span>}
            </div>

            {editMode && !showSetup && !selectedSinger && selectedRow === null && (
              <button
                className="btn absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full border border-line bg-surface/90 px-3.5 py-2 text-xs font-semibold text-fg shadow-lg backdrop-blur transition-all hover:bg-surface active:scale-95"
                onClick={() => {
                  setSelectedId(null);
                  setSelectedRow(null);
                  setShowSetup(true);
                }}
                aria-label="Form og oppstilling"
                title="Form og oppstilling"
              >
                <SlidersHorizontal className="h-4 w-4 text-accent" />
                <span>Form og oppstilling</span>
              </button>
            )}

            {editMode && showSetup && !selectedSinger && selectedRow === null && scene && (
              <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex justify-center">
                <StageSetupCard
                  settings={scene.settings}
                  onSettings={changeSettings}
                  onAutoSort={doAutoSort}
                  onClose={() => setShowSetup(false)}
                />
              </div>
            )}

            {editMode && selectedRow !== null && !selectedSinger && scene && (
              <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex justify-center">
                <RowAdjustmentCard
                  row={selectedRow}
                  singerCount={
                    scene.placements.filter((p) => p.status === "choir" && p.row === selectedRow).length
                  }
                  adjustment={scene.settings.rowAdjustments?.[selectedRow]}
                  onChange={handleRowAdjustmentChange}
                  onReset={handleRowReset}
                  onClose={() => setSelectedRow(null)}
                />
              </div>
            )}

            {selectedSinger && selectedPlacement && (
              <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex justify-center">
                <SingerCard
                  singer={selectedSinger}
                  groups={boot.groups}
                  placement={selectedPlacement}
                  positionText={positionText(selectedSinger.id)}
                  editMode={editMode}
                  onClose={() => setSelectedId(null)}
                  onSolo={() => edit((st, c) => toggleSolo(st, selectedSinger.id, c))}
                  onBench={() => {
                    if (edit((st, c) => toggleBench(st, selectedSinger.id, c))) setSelectedId(null);
                  }}
                  onPin={() => edit((st) => togglePin(st, selectedSinger.id))}
                  onOverride={(gid) => edit((st, c) => setOverride(st, selectedSinger.id, gid, c))}
                />
              </div>
            )}
          </main>


        </div>

        <BenchDrawer
          entries={benchEntries}
          editMode={editMode}
          selectedId={selectedId}
          meId={meId}
          stage={stage}
          onTapSinger={handleNodeTap}
          onZoneTap={() => {
            if (selectedId !== null && edit((st, c) => moveSinger(st, selectedId, { type: "bench" }, c))) {
              setSelectedId(null);
            }
          }}
          onDrop={handleDrop}
        />

        <footer
          className="safe-bottom border-t border-line bg-surface px-4 py-3 text-center text-sm"
          style={meSinger && mePlacement && mePlacement.status !== "bench" ? { borderTopColor: "var(--me)", borderTopWidth: 3 } : undefined}
          aria-live="polite"
        >
          {barText}
        </footer>



        {showPin && (
          <PinDialog
            onClose={() => setShowPin(false)}
            onSuccess={async () => {
              setShowPin(false);
              await reload();
              toast("Dirigentmodus er låst opp", "success");
            }}
          />
        )}
        {boot.admin && boot.mustChangePassword && (
          <ChangePasswordDialog
            role={boot.superadmin ? "superadmin" : "conductor"}
            isMandatory
            onSuccess={() => void reload()}
            onClose={() => void logout()}
          />
        )}
        {showAttendance && concert && cd && (
          <AttendanceDialog
            concert={concert}
            singers={boot.singers}
            groups={boot.groups}
            attendingIds={cd.attendingIds}
            onClose={() => setShowAttendance(false)}
            onUpdated={(u) => {
              localVersion.current++;
              setCdBoth({ ...cdRef.current!, attendingIds: u.attendingIds, scenes: u.scenes });
            }}
          />
        )}
        {showSongMenu && scene && (
          <SongMenuDialog
            key={scene.id}
            scene={scene}
            sceneIndex={sceneIndex}
            sceneCount={scenes?.length ?? 1}
            hasPrev={sceneIndex > 0}
            onTitle={(title) => commitScene(scene.id, (s) => ({ ...s, title }))}
            onCopyPrev={doCopyPrev}
            onNewScene={(copy) => void newScene(copy)}
            onDeleteScene={() => void deleteScene()}
            onMove={(d) => void moveScene(d)}
            onClose={() => setShowSongMenu(false)}
          />
        )}
      </div>

      {concert && scene && layout && (
        <PrintSheet
          concert={concert}
          scene={scene}
          sceneIndex={sceneIndex}
          layout={layout}
          placements={placementMap}
          singers={singers}
          groups={groups}
        />
      )}
    </>
  );
}

