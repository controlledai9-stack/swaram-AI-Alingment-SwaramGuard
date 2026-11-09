import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Meta, Run } from "./types";

const RUN_KEY_PREFIX = "swaramguard.selectedRun";

interface AppState {
  runs: Run[];
  /** False until the first History load succeeds, so an empty list isn't mistaken for "no runs". */
  runsLoaded: boolean;
  /** Set only when loading the History list failed (other requests use apiError). */
  runsError: string | null;
  meta: Meta | null;
  health: { storage: string; workspace: string } | null;
  apiError: string | null;
  selectedRunId: string | null;
  selectRun: (id: string | null) => void;
  refreshRuns: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

function readStoredRun(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** `account` scopes the remembered run to the signed-in person (each account has its own History). */
export function AppStateProvider({ children, account = "local" }: { children: ReactNode; account?: string }) {
  const RUN_KEY = `${RUN_KEY_PREFIX}.${account}`;
  const [runs, setRuns] = useState<Run[]>([]);
  const [runsLoaded, setRunsLoaded] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [health, setHealth] = useState<AppState["health"]>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [selectedRunId, setSelected] = useState<string | null>(() => readStoredRun(RUN_KEY));

  const selectRun = useCallback((id: string | null) => {
    setSelected(id);
    try {
      if (id) localStorage.setItem(RUN_KEY, id);
      else localStorage.removeItem(RUN_KEY);
    } catch {
      /* storage unavailable: selection just won't survive reload */
    }
  }, [RUN_KEY]);

  const refreshRuns = useCallback(async () => {
    setRunsError(null);
    try {
      const list = await api.runs();
      setRuns(list);
      setRunsLoaded(true);
      setApiError(null);
      // Keep the chosen run if it still exists; never pick one automatically (runs are opened from History).
      setSelected((cur) => (cur && list.some((r) => r.run_id === cur) ? cur : null));
    } catch (e) {
      setApiError((e as Error).message);
      setRunsError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refreshRuns();
    api.meta().then(setMeta).catch((e) => setApiError(e.message));
    api.health().then(setHealth).catch(() => undefined);
  }, [refreshRuns]);

  return (
    <Ctx.Provider value={{ runs, runsLoaded, runsError, meta, health, apiError, selectedRunId, selectRun, refreshRuns }}>{children}</Ctx.Provider>
  );
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState outside provider");
  return v;
}

/** Load something for the selected run; re-runs when the run (or deps) change. */
export function useRunData<T>(loader: (runId: string) => Promise<T>, runId: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    if (!runId) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      setData(await loader(runId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, ...deps]);
  useEffect(() => {
    setData(null); // Clear stale data immediately upon runId change to prevent stale display
    reload();
  }, [reload]);
  return { data, setData, error, loading, reload };
}
