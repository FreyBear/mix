"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FlipHorizontal2,
  LocateFixed,
  Lock,
  LockOpen,
  Maximize,
  Pencil,
  Plus,
  Minus,
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
import type { Concert, Scene, SceneSettings, Template } from "@/lib/types";
import { AttendanceDialog } from "./attendance-dialog";
import { BenchDrawer } from "./bench-drawer";
import { EditPanel } from "./edit-panel";
import { PinDialog } from "./pin-dialog";
import { PrintSheet } from "./print-sheet";
import { SingerCard } from "./singer-card";
import { StageCanvas, type StageHandle } from "./stage-canvas";
import { useToast } from "./toast";

interface ConcertData {
  concert: Concert;
  attendingIds: number[];
  scenes: Scene[];
}

const LS = {
  me: "mixup.me",
  mirror: "mixup.mirror",
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
  const { data, error, reload, patch } = useBootstrap();

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
  return <Viewer boot={data} reload={reload} patch={patch} />;
}

function Viewer({
  boot,
  reload,
  patch,
}: {
  boot: Bootstrap;
  reload: () => Promise<Bootstrap | null>;
  patch: (p: Partial<Bootstrap>) => void;
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
  const [mirrorPref, setMirrorPref] = useState<boolean | null>(() => {
    const v = readLS(LS.mirror);
    return v === "1" ? true : v === "0" ? false : null;
  });
  const [editMode, setEditMode] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
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
        setEditMode(false);
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

  // Dirigentmodus kan ikke bli stående hvis innloggingen utløper.
  useEffect(() => {
    if (!admin && editMode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditMode(false);
      setPanelOpen(false);
    }
  }, [admin, editMode]);

  // ---- Avledede data ------------------------------------------------------
  const singers = useMemo(() => new Map(boot.singers.map((s) => [s.id, s])), [boot.singers]);
  const groups = useMemo(() => new Map(boot.groups.map((g) => [g.id, g])), [boot.groups]);
  const attending = useMemo(() => new Set(cd?.attendingIds ?? []), [cd?.attendingIds]);
  const scenes = cd?.scenes;
  const scene = scenes?.find((s) => s.id === sceneId) ?? scenes?.[0] ?? null;
  const sceneIndex = scene && scenes ? scenes.findIndex((s) => s.id === scene.id) : -1;
  const concert = cd?.concert ?? null;
  const mirror = mirrorPref ?? (meId !== null && !admin);

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
      const dx = (x: number) => (mirror ? concert.stageWidth - x : x);
      const mates = layout.nodes
        .filter((n) => n.zone === node.zone && (node.zone === "solo" || n.row === node.row))
        .sort((a, b) => dx(a.x) - dx(b.x));
      const rank = mates.findIndex((n) => n.singerId === singerId) + 1;
      return node.zone === "solo"
        ? `Solist, plass ${rank} fra venstre foran koret`
        : `Rad ${node.row + 1}, plass ${rank} fra venstre`;
    },
    [placementMap, layout, concert, mirror],
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
        const res = autoSort(scene.placements, next, ctx);
        applyState(res);
      } else {
        commitScene(scene.id, (s) => ({ ...s, settings: next }));
      }
    },
    [scene, ctx, applyState, commitScene],
  );

  const doAutoSort = () => {
    if (!scene || !ctx) return;
    if (!window.confirm("Auto-sortere oppstillingen etter stemmegruppe og høyde? Låste plasser blir stående.")) return;
    applyState(autoSort(scene.placements, scene.settings, ctx));
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

  const saveTemplate = async (name: string) => {
    if (!scene) return;
    await flush();
    try {
      const res = await api<{ templates: Template[] }>("POST", "/api/templates", { name, sceneId: scene.id });
      patch({ templates: res.templates });
      toast("Mal lagret", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Kunne ikke lagre mal", "error");
    }
  };

  const applyTemplate = (t: Template) => {
    if (!scene || !ctx) return;
    if (!window.confirm(`Bruke malen «${t.name}» på denne sangen?`)) return;
    applyState(reconcile({ placements: t.placements, settings: t.settings }, attending, ctx));
    toast(`Brukte malen «${t.name}»`, "success");
  };

  const deleteTemplate = async (t: Template) => {
    if (!window.confirm(`Slette malen «${t.name}»?`)) return;
    try {
      const res = await api<{ templates: Template[] }>("DELETE", `/api/templates/${t.id}`);
      patch({ templates: res.templates });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Kunne ikke slette mal", "error");
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

  const toggleMirror = () => {
    const next = !mirror;
    setMirrorPref(next);
    writeLS(LS.mirror, next ? "1" : "0");
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
    setEditMode(false);
    setPanelOpen(false);
    await reload();
  };

  const enterEdit = () => {
    setEditMode((on) => {
      const next = !on;
      setPanelOpen(next && window.innerWidth >= 1024);
      setSelectedId(null);
      return next;
    });
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
      </div>
    );
  }

  const panel =
    scene && concert ? (
      <EditPanel
        scene={scene}
        sceneIndex={sceneIndex}
        sceneCount={scenes?.length ?? 1}
        hasPrev={sceneIndex > 0}
        templates={boot.templates}
        warnings={warnings}
        saving={saving}
        onTitle={(title) => commitScene(scene.id, (s) => ({ ...s, title }))}
        onSettings={changeSettings}
        onAutoSort={doAutoSort}
        onCopyPrev={doCopyPrev}
        onNewScene={(copy) => void newScene(copy)}
        onDeleteScene={() => void deleteScene()}
        onMove={(d) => void moveScene(d)}
        onSaveTemplate={(n) => void saveTemplate(n)}
        onApplyTemplate={applyTemplate}
        onDeleteTemplate={(t) => void deleteTemplate(t)}
        onAttendance={() => void openAttendance()}
        onClose={() => setPanelOpen(false)}
      />
    ) : null;

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
            <button
              className="btn-icon"
              onClick={toggleMirror}
              aria-label={mirror ? "Sett fra scenen. Trykk for å se fra salen" : "Sett fra salen. Trykk for å se fra scenen"}
              title={mirror ? "Sett fra scenen" : "Sett fra salen"}
            >
              <FlipHorizontal2 className="h-5 w-5" />
            </button>
            <button className="btn-icon" onClick={() => window.print()} aria-label="Skriv ut" title="Skriv ut">
              <Printer className="h-5 w-5" />
            </button>
            {admin ? (
              <>
                <button
                  className={`btn-icon ${editMode ? "!bg-accent !text-accent-fg" : ""}`}
                  onClick={enterEdit}
                  aria-pressed={editMode}
                  aria-label="Rediger oppstilling"
                  title="Rediger oppstilling"
                >
                  <Pencil className="h-5 w-5" />
                </button>
                <Link href="/admin" className="btn-icon" aria-label="Administrasjon" title="Administrasjon">
                  <Settings className="h-5 w-5" />
                </Link>
                <button className="btn-icon" onClick={() => void logout()} aria-label="Lås dirigentmodus" title="Lås">
                  <LockOpen className="h-5 w-5" />
                </button>
              </>
            ) : (
              <button className="btn-icon" onClick={() => setShowPin(true)} aria-label="Dirigentlås" title="Dirigentlås">
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
                mirror={mirror}
                meId={meId}
                editMode={editMode}
                selectedId={selectedId}
                fitSignal={fitSignal}
                onNodeTap={handleNodeTap}
                onSlotTap={handleSlotTap}
                onBackgroundTap={() => setSelectedId(null)}
                onDrop={handleDrop}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted" role="status">
                {loadError ?? "Laster oppstilling …"}
              </div>
            )}

            <div className="absolute top-2 right-2 flex flex-col gap-2">
              <button className="btn-icon" onClick={() => stage.current?.zoomBy(1.4)} aria-label="Zoom inn">
                <Plus className="h-5 w-5" />
              </button>
              <button className="btn-icon" onClick={() => stage.current?.zoomBy(1 / 1.4)} aria-label="Zoom ut">
                <Minus className="h-5 w-5" />
              </button>
              <button className="btn-icon" onClick={() => stage.current?.fit()} aria-label="Nullstill zoom" title="Nullstill zoom">
                <Maximize className="h-5 w-5" />
              </button>
              {meId !== null && mePlacement && mePlacement.status !== "bench" && (
                <button
                  className="btn-icon !bg-[var(--me)] !text-[#2e1065]"
                  onClick={() => stage.current?.centerOn(meId)}
                  aria-label="Sentrer på meg"
                  title="Sentrer på meg"
                >
                  <LocateFixed className="h-5 w-5" />
                </button>
              )}
            </div>

            <div className="absolute top-2 left-2 flex flex-col items-start gap-2">
              {warnings.length > 0 && (
                <button
                  className="chip border-danger/50 bg-surface/90 text-danger backdrop-blur"
                  onClick={() => {
                    if (admin) {
                      setEditMode(true);
                      setPanelOpen(true);
                    } else toast(warnings.join(". "), "error");
                  }}
                  aria-label={`${warnings.length} advarsler`}
                >
                  <TriangleAlert className="h-3.5 w-3.5" /> {warnings.length}{" "}
                  {warnings.length === 1 ? "advarsel" : "advarsler"}
                </button>
              )}
              {saving && <span className="chip bg-surface/90 backdrop-blur">Lagrer …</span>}
            </div>

            {editMode && !panelOpen && (
              <button
                className="btn btn-primary absolute bottom-3 left-3 shadow-lg"
                onClick={() => setPanelOpen(true)}
              >
                <SlidersHorizontal className="h-4 w-4" /> Innstillinger
              </button>
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

          {editMode && panelOpen && (
            <aside className="hidden w-96 shrink-0 border-l border-line bg-surface lg:block">{panel}</aside>
          )}
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

        {editMode && panelOpen && (
          <div className="fixed inset-x-0 bottom-0 z-40 max-h-[72dvh] overflow-hidden rounded-t-2xl border-t border-line bg-surface shadow-2xl lg:hidden">
            {panel}
          </div>
        )}

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

