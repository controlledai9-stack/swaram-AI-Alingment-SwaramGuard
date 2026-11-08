import { useMemo, useState } from "react";
import { History, LogOut, PanelLeftClose, PanelLeftOpen, PlayCircle, Plus, Search, X } from "lucide-react";
import { api } from "../api";
import { firebaseEnabled, signOut, useFirebaseUser } from "../lib/firebase";
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

function Usage() {
  const q = useRunData(() => api.geminiQuota(), "sidebar-quota");
  const d = q.data;
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

function Account() {
  const user = useFirebaseUser();
  const me = useRunData(() => api.whoami(), "whoami");
  const name = user?.displayName || me.data?.display_name || me.data?.name || "Local mode";
  const email = user?.email || (me.data?.auth ? me.data?.name : "No sign-in configured");
  const picture = user?.photoURL || me.data?.picture || null;
  return (
    <div className="flex items-center gap-2.5">
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
      {firebaseEnabled && user && (
        <button type="button" onClick={() => signOut()} title="Sign out" aria-label="Sign out"
                className="rounded-md p-1.5 text-[var(--text-3)] hover:bg-[var(--hairline-subtle)] hover:text-[var(--text)]">
          <LogOut size={15} />
        </button>
      )}
    </div>
  );
}

/** ChatGPT-style history: every saved run, newest first. Opening one switches every page to that run. */
export function HistorySidebar() {
  const { runs, selectedRunId, selectRun } = useAppState();
  const [open, setOpen] = useState(true);
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
                <button key={r.run_id} type="button" onClick={() => selectRun(r.run_id)} aria-current={active ? "true" : undefined}
                        className={`block w-full rounded-lg px-2 py-1.5 text-left transition-colors ${
                          active ? "bg-[var(--accent)]/10" : "hover:bg-[var(--hairline-subtle)]"}`}>
                  <div className={`truncate text-[13px] ${active ? "font-medium text-[var(--accent)]" : "text-[var(--text)]"}`}>{title(r)}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
                    <span>{when(r.created_at)}</span>
                    <span>·</span>
                    <span>{r.agent_count} agents</span>
                    {alerts > 0 && (<><span>·</span><span className="text-[var(--crit)]">{alerts} incident{alerts === 1 ? "" : "s"}</span></>)}
                  </div>
                </button>
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
        <Account />
      </div>
      {howTo && <HowToUse onClose={() => setHowTo(false)} />}
    </aside>
  );
}
