"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

/** Load JSON on mount and (optionally) every `everyMs`. Keeps old data visible while refreshing. */
export function useLoad<T>(path: string | null, everyMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    if (!path) return;
    try { const d = await api<T>(path); if (alive.current) { setData(d); setError(""); } }
    catch (e) { if (alive.current) setError(e instanceof ApiError ? e.message : "Could not load."); }
    finally { if (alive.current) setLoading(false); }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    setLoading(true);
    reload();
    const t = everyMs ? setInterval(() => { if (!document.hidden) reload(); }, everyMs) : undefined;
    return () => { alive.current = false; if (t) clearInterval(t); };
  }, [reload, everyMs]);

  return { data, error, loading, reload };
}
