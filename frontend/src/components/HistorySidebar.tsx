import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronUp, History, KeyRound, LogOut, PanelLeftClose, PanelLeftOpen, PlayCircle, Plus, Search, Trash2, X } from "lucide-react";
import { api } from "../api";
import { firebaseEnabled, signOut, useFirebaseUser } from "../lib/firebase";
import { GEMINI_KEY_CHANGED, getOwnGeminiKey, maskKey, setOwnGeminiKey } from "../lib/geminiKey";
import { useAppState, useRunData } from "../state";
import type { Run } from "../types";

/** The "How to use" video. Set VITE_HOW_TO_VIDEO_URL in frontend/.env.local (a YouTube link). */
const HOW_TO_VIDEO = (import.meta.env.VITE_HOW_TO_VIDEO_URL as string | undefined) || "";

function title(r: Run): string {
  return r.name?.trim() || r.scenario_id.replace(/^ingest:/, "").replace(/_/g, " ");
}

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function group(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  const week = new Date(today);
  week.setDate(today.getDate() - 7);
  return d > week ? "Previous 7 days" : "Older";
}

function HowToUse({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="w-full max-w-[460px] rounded-[var(--r-card)] border border-[var(--hairline)] bg-[var(--card)] p-6 shadow-[var(--shadow-1)]"
           onClick={(e) => e.stopPropagation()} role="dialog" aria-label="How to use SwaramGuard">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-semibold text-[var(--text)]">How to use SwaramGuard</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[var(--text-3)] hover:text-[var(--text)]"><X size={18} /></button>
        </div>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-[14px] text-[var(--text-2)]">
          <li><b className="text-[var(--text)]">New run</b>: name it, pick a scenario (or write a task for AI agents), and start it on Agent Runtime.</li>
          <li>Watch it live: anything blocked or contained shows up first.</li>
          <li><b className="text-[var(--text)]">Incidents</b>: read the evidence and decide: release the agent or keep it contained.</li>
          <li>Every run is saved. Open any of them from <b className="text-[var(--text)]">History</b>; every page switches to that run.</li>
        </ol>
        {HOW_TO_VIDEO ? (
          <a href={HOW_TO_VIDEO} target="_blank" rel="noreferrer"
             className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-[14px] font-medium text-white">
            <PlayCircle size={16} /> Watch the video
          </a>
        ) : (
          <p className="mt-5 text-[13px] text-[var(--text-3)]">Video walkthrough coming soon.</p>
        )}
      </div>
    </div>
  );
}

function useOwnKey(): string {
  const [key, setKey] = useState(getOwnGeminiKey);
  useEffect(() => {
    const on = () => setKey(getOwnGeminiKey());
    window.addEventListener(GEMINI_KEY_CHANGED, on);
    return () => window.removeEventListener(GEMINI_KEY_CHANGED, on);
  }, []);
  return key;
}

function Usage() {
  const own = useOwnKey();
  const q = useRunData(() => api.geminiQuota(), "sidebar-quota", [own]);
  const d = q.data;
  if (own) {
    return (
      <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-2)]" aria-label="Gemini usage today">
        <KeyRound size={13} /> AI runs use your own Gemini key
      </div>
    );
  }
  if (!d) return null;
  if (!d.configured) return <p className="text-[12px] text-[var(--text-3)]">Gemini: not connected yet</p>;
  const used = d.exhausted ? 1 : Math.min(1, d.calls_today / Math.max(1, d.daily_limit));
  return (
    <div aria-label="Gemini usage today">
      <div className="flex justify-between text-[12px] text-[var(--text-2)]">
        <span>Gemini today</span>
        <span className="tabular-nums">{d.remaining_today} / {d.daily_limit} left</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--hairline-subtle)]">
        <div className={`h-full rounded-full ${used < 0.9 ? "bg-[var(--accent)]" : "bg-[var(--crit)]"}`} style={{ width: `${used * 100}%` }} />
      </div>
    </div>
  );
}

function OwnKeyDialog({ onClose }: { onClose: () => void }) {
  const saved = useOwnKey();
  const [value, setValue] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "checking" | "ok" | "error"; msg?: string }>({ kind: "idle" });
  const candidate = value.trim();

  async function test() {
    setState({ kind: "checking" });
    try {
      const r = await api.checkGeminiKey(candidate);
      setState(r.ok ? { kind: "ok", msg: "The key works." } : { kind: "error", msg: r.error ?? "Google rejected the key." });
    } catch (e) {
      setState({ kind: "error", msg: (e as Error).message });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="w-full max-w-[440px] rounded-[var(--r-card)] border border-[var(--hairline)] bg-[var(--card)] p-6 shadow-[var(--shadow-1)]"
           onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Use your own Gemini key">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-semibold text-[var(--text)]">Use your own Gemini key</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[var(--text-3)] hover:text-[var(--text)]"><X size={18} /></button>
        </div>
        <p className="mt-2 text-[13px] text-[var(--text-2)]">
          AI runs you start will use your key and your Google quota instead of the shared one. The key stays in this
          browser and is sent only with your requests; SwaramGuard never saves it.
          Get one at <a className="text-[var(--accent)] underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>.
        </p>
        {saved && (
          <div className="mt-4 flex items-center justify-between rounded-lg bg-[var(--hairline-subtle)] px-3 py-2 text-[13px]">
            <span className="text-[var(--text)]">Using <code className="font-mono">{maskKey(saved)}</code></span>
            <button type="button" onClick={() => { setOwnGeminiKey(""); setState({ kind: "idle" }); }}
                    className="text-[var(--crit)] hover:underline">Remove</button>
          </div>
        )}
        <label htmlFor="own-gemini-key" className="mt-4 block text-[13px] font-medium text-[var(--text)]">
          {saved ? "Replace with another key" : "Your Gemini API key"}
        </label>
        <input id="own-gemini-key" type="password" autoComplete="off" spellCheck={false} value={value}
               onChange={(e) => { setValue(e.target.value); setState({ kind: "idle" }); }}
               placeholder="Paste your key"
               className="mt-1 h-10 w-full rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-3 font-mono text-[13px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none" />
        {state.msg && (
          <p className={`mt-2 text-[13px] ${state.kind === "ok" ? "text-[var(--ok)]" : "text-[var(--crit)]"}`}>{state.msg}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={test} disabled={candidate.length < 20 || state.kind === "checking"}
                  className="rounded-full border border-[var(--hairline)] px-4 py-1.5 text-[14px] text-[var(--text)] hover:bg-[var(--hairline-subtle)] disabled:opacity-50">
            {state.kind === "checking" ? "Checking…" : "Test key"}
          </button>
          <button type="button" disabled={candidate.length < 20}
                  onClick={() => { setOwnGeminiKey(candidate); setValue(""); onClose(); }}
                  className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-[14px] font-medium text-white disabled:opacity-50">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Account({ onHowTo }: { onHowTo: () => void }) {
  const user = useFirebaseUser();
  const me = useRunData(() => api.whoami(), "whoami");
  const own = useOwnKey();
  const [menu, setMenu] = useState(false);
  const [keyDialog, setKeyDialog] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [menu]);
  const name = user?.displayName || me.data?.display_name || me.data?.name || "Local mode";
  const email = user?.email || (me.data?.auth ? me.data?.name : "No sign-in configured");
  const picture = user?.photoURL || me.data?.picture || null;
  const item = "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-[var(--text)] hover:bg-[var(--hairline-subtle)]";
  return (
    <div ref={box} className="relative">
      {menu && (
        <div role="menu" className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-[var(--hairline)] bg-[var(--card)] p-1.5 shadow-[var(--shadow-1)]">
          <button type="button" role="menuitem" className={item} onClick={() => { setMenu(false); setKeyDialog(true); }}>
            <KeyRound size={15} /> {own ? "Your Gemini key" : "Use my own Gemini key"}
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => { setMenu(false); onHowTo(); }}>
            <PlayCircle size={15} /> How to use
          </button>
          {firebaseEnabled && user && (
            <button type="button" role="menuitem" className={`${item} text-[var(--crit)]`} onClick={() => signOut()}>
              <LogOut size={15} /> Sign out
            </button>
          )}
        </div>
      )}
      <button type="button" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}
              className={`flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-[var(--hairline-subtle)] ${menu ? "bg-[var(--hairline-subtle)]" : ""}`}>
      {picture ? (
        <img src={picture} alt="" className="h-8 w-8 shrink-0 rounded-full" referrerPolicy="no-referrer" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--hairline-subtle)] text-[13px] font-semibold text-[var(--text-2)]">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-[var(--text)]">{name}</div>
        <div className="truncate text-[12px] text-[var(--text-3)]">{email}{me.data?.role && me.data.role !== "local" ? ` · ${me.data.role}` : ""}</div>
      </div>
      <ChevronUp size={15} className={`shrink-0 text-[var(--text-3)] transition-transform ${menu ? "" : "rotate-180"}`} />
      </button>
      {keyDialog && <OwnKeyDialog onClose={() => setKeyDialog(false)} />}
    </div>
  );
}

/** ChatGPT-style history: every saved run, newest first. Opening one switches every page to that run. */
export function HistorySidebar() {
  const { runs, selectedRunId, selectRun, refreshRuns } = useAppState();
  const [open, setOpen] = useState(true);
  const [confirming, setConfirming] = useState<Run | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function remove(r: Run) {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteRun(r.run_id);
      if (r.run_id === selectedRunId) selectRun(null);
      setConfirming(null);
      await refreshRuns();
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }
  const [query, setQuery] = useState("");
  const [howTo, setHowTo] = useState(false);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = runs.filter((r) => !q || title(r).toLowerCase().includes(q) || r.scenario_id.toLowerCase().includes(q));
    const out: [string, Run[]][] = [];
    for (const r of shown) {
      const g = group(r.created_at);
      const last = out[out.length - 1];
      if (last && last[0] === g) last[1].push(r);
      else out.push([g, [r]]);
    }
    return out;
  }, [runs, query]);

  if (!open) {
    return (
      <aside className="sticky top-0 hidden h-screen w-12 shrink-0 flex-col items-center gap-3 border-r border-[var(--hairline)] bg-[var(--card)] py-3 md:flex">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open history" title="Open history"
                className="rounded-md p-1.5 text-[var(--text-2)] hover:bg-[var(--hairline-subtle)]"><PanelLeftOpen size={18} /></button>
        <button type="button" onClick={() => { selectRun(null); window.location.hash = "#/live"; }} aria-label="New run" title="New run"
                className="rounded-md p-1.5 text-[var(--text-2)] hover:bg-[var(--hairline-subtle)]"><Plus size={18} /></button>
      </aside>
    );
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col border-r border-[var(--hairline)] bg-[var(--card)] md:flex"
           aria-label="Run history">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <button type="button" onClick={() => { selectRun(null); window.location.hash = "#/live"; }}
                className="inline-flex flex-1 items-center gap-2 rounded-lg border border-[var(--hairline)] px-3 py-2 text-[13px] font-medium text-[var(--text)] hover:bg-[var(--hairline-subtle)]">
          <Plus size={15} /> New run
        </button>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close history" title="Close history"
                className="rounded-md p-1.5 text-[var(--text-3)] hover:bg-[var(--hairline-subtle)]"><PanelLeftClose size={17} /></button>
      </div>
      <label className="mx-3 mt-3 flex items-center gap-2 rounded-lg bg-[var(--hairline-subtle)] px-2.5 py-1.5 text-[13px] text-[var(--text-3)]">
        <Search size={14} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search runs"
               className="w-full bg-transparent text-[var(--text)] outline-none placeholder:text-[var(--text-3)]" />
      </label>

      <nav className="mt-3 flex-1 overflow-y-auto px-2 pb-3">
        <div className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
          <History size={12} /> History
        </div>
        {runs.length === 0 && <p className="px-2 py-3 text-[13px] text-[var(--text-3)]">No runs yet. Start one with New run.</p>}
        {groups.map(([g, rs]) => (
          <div key={g} className="mb-2">
            <div className="px-2 pt-2 pb-1 text-[11px] text-[var(--text-3)]">{g}</div>
            {rs.map((r) => {
              const active = r.run_id === selectedRunId;
              const alerts = r.counts?.alerts ?? 0;
              return (
                <div key={r.run_id} className="group relative">
                  <button type="button" onClick={() => selectRun(r.run_id)} aria-current={active ? "true" : undefined}
                          className={`block w-full rounded-lg py-1.5 pl-2 pr-8 text-left transition-colors ${
                            active ? "bg-[#E3E3E8] shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-[var(--hairline-subtle)]"}`}>
                    <div className={`truncate text-[13px] ${active ? "font-semibold text-[var(--text)]" : "text-[var(--text)]"}`}>{title(r)}</div>
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
                      <span>{when(r.created_at)}</span>
                      <span>·</span>
                      <span>{r.agent_count} agents</span>
                      {alerts > 0 && (<><span>·</span><span className="text-[var(--crit)]">{alerts} incident{alerts === 1 ? "" : "s"}</span></>)}
                    </div>
                  </button>
                  <button type="button" onClick={() => { setDeleteError(null); setConfirming(r); }}
                          aria-label={`Delete ${title(r)}`} title="Delete run"
                          className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-3)] hover:bg-white hover:text-[var(--crit)] ${
                            active ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="space-y-3 border-t border-[var(--hairline)] px-3 py-3">
        <button type="button" onClick={() => setHowTo(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-[var(--text-2)] hover:bg-[var(--hairline-subtle)] hover:text-[var(--text)]">
          <PlayCircle size={15} /> How to use
        </button>
        <Usage />
        <Account onHowTo={() => setHowTo(true)} />
      </div>
      {howTo && <HowToUse onClose={() => setHowTo(false)} />}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => !deleting && setConfirming(null)}>
          <div className="w-full max-w-[400px] rounded-[var(--r-card)] border border-[var(--hairline)] bg-[var(--card)] p-6 shadow-[var(--shadow-1)]"
               onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label="Delete run">
            <h2 className="text-[17px] font-semibold text-[var(--text)]">Delete "{title(confirming)}"?</h2>
            <p className="mt-2 text-[14px] text-[var(--text-2)]">
              This permanently deletes the run and all its events, incidents, responses and reviews. It can't be undone.
            </p>
            {deleteError && <p className="mt-3 text-[13px] text-[var(--crit)]">{deleteError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(null)} disabled={deleting}
                      className="rounded-full border border-[var(--hairline)] px-4 py-1.5 text-[14px] text-[var(--text)] hover:bg-[var(--hairline-subtle)]">
                Cancel
              </button>
              <button type="button" onClick={() => remove(confirming)} disabled={deleting}
                      className="rounded-full bg-[var(--crit)] px-4 py-1.5 text-[14px] font-medium text-white disabled:opacity-60">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
