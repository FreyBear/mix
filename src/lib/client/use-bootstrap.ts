"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Concert, Singer, Template, Venue, VoiceGroup } from "../types";

export interface Bootstrap {
  admin: boolean;
  superadmin: boolean;
  mustChangePassword: boolean;
  role: "none" | "conductor" | "superadmin";
  groups: VoiceGroup[];
  singers: Singer[];
  venues: Venue[];
  concerts: Concert[];
  templates: Template[];
}

export function useBootstrap() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const d = await api<Bootstrap>("GET", "/api/bootstrap");
      setData(d);
      setError(null);
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke hente data");
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    api<Bootstrap>("GET", "/api/bootstrap")
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Kunne ikke hente data");
      });
    return () => {
      alive = false;
    };
  }, []);

  /** Slår sammen delvise oppdateringer fra API-svar (f.eks. { singers }). */
  const patch = useCallback((p: Partial<Bootstrap>) => {
    setData((cur) => (cur ? { ...cur, ...p } : cur));
  }, []);

  return { data, error, reload, patch };
}
