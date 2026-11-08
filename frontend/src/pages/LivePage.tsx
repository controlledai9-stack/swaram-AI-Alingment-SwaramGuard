import { SwarmPage } from "./SwarmPage";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { GeminiQuota } from "../components/GeminiQuota";
import { PageHeader } from "../components/PageHeader";
import { Card, CustomSelect, Empty, Segmented, StatusBanner, type Status } from "../components/ui";
import { shortId, friendlyAgentName } from "../lib/format";
import { type LiveMessage, useLiveStream } from "../lib/live";
import { useAppState } from "../state";
import type { AgentCount } from "../types";
import { Zap, ShieldAlert, Lock, Play, Square, Filter, RefreshCw } from "lucide-react";

type AnyData = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TONE: Record<string, string> = {
  detection: "bg-amber-500/10 text-amber-700 border-amber-300",
  containment: "bg-rose-500/10 text-rose-700 border-rose-300",
  quarantine: "bg-rose-500/10 text-rose-700 border-rose-300",
  run_started: "bg-[var(--accent)]/10 text-[var(--accent)]",
  run_finished: "bg-emerald-500/10 text-[#1F7A45]",
  run_failed: "bg-rose-500/10 text-rose-700",
  response: "bg-[var(--accent)]/10 text-[var(--accent)]",
  operator: "bg-rose-500/10 text-rose-700",
  reset: "bg-emerald-500/10 text-[#1F7A45]",
};

/**
 * Plain-English event describer for Live Feed
 * Zero technical jargon on primary cards
 */
function describe(m: LiveMessage<AnyData>): {
  title: string;
  subtitle?: string;
  isPreBlock?: boolean;
  isCircuitBreaker?: boolean;
  isCovert?: boolean;
} {
  const d = m.data;
  switch (m.type) {
    case "event": {
      const isPreBlock =
        d.status === "denied" ||
        (d.payload?.gateway_reason && String(d.payload.gateway_reason).includes("before execution"));
      const isCovertAction = d.event_type === "data_transfer" && (d.target || "").includes("paste-site");
      return {
        title: isPreBlock
          ? `Stopped before it ran: ${shortId(d.agent_id)} (${d.action || d.event_type})`
          : `${shortId(d.agent_id)} ${d.event_type}:${d.action} ${d.resource ?? d.target ?? ""}`,
        subtitle: isPreBlock
          ? (d.payload?.gateway_reason || "Refused by safety gateway before action could execute")
          : undefined,
        isPreBlock,
        isCovert: isCovertAction,
      };
    }
    case "detection": {
      const isCovert = d.rule_id === "SG-029";
      return {
        title: isCovert
          ? `Secret data send flagged · ${shortId((d.agent_ids ?? [])[0])}`
          : `Alert: ${d.rule_name || d.rule_id} · ${(d.agent_ids ?? []).map(shortId).join(", ") || "swarm"}`,
        subtitle: d.reason,
        isCovert,
      };
    }
    case "containment": {
      const isCircuitBreaker =
        d.trigger === "circuit_breaker" ||
        (d.explanation && String(d.explanation).includes("circuit breaker"));
      return {
        title: isCircuitBreaker
          ? `Safety trigger: Swarm halted to prevent spread`
          : `Agent stopped: ${shortId(d.agent_id)} (${d.role || "Agent"})`,
        subtitle: d.explanation ?? "Stopped by safety trigger to protect swarm",
        isCircuitBreaker,
      };
    }
    case "quarantine":
      return {
        title: `Suspicious message held for ${shortId(d.agent_id)}`,
        subtitle:
          d.reason === "classifier"
            ? `Safety trigger detected unsafe prompt content`
            : `Message claimed to be from ${d.claimed_sender || "unverified sender"}`,
      };
    case "run_started":
      return { title: `Run started: ${(d.config?.scenario_id ?? "").replace(/_/g, " ")}` };
    case "run_finished":
      return {
        title: `Run completed · Data sent outside: ${
          d.live_metrics?.data_left_the_system ? "YES (LEAK DETECTED)" : "NO (SAFELY STOPPED)"
        }`,
        subtitle: d.live_metrics
          ? `Actions stopped before running: ${d.live_metrics.blocked_by_policy_check ?? 0}`
          : undefined,
      };
    case "run_failed":
      return { title: `Run failed: ${d.error}` };
    case "response":
      return {
        title: `Safety policy applied to ${(d.agent_ids ?? []).map(shortId).join(", ") || "swarm"}`,
        subtitle: (d.applied ?? []).join(", "),
      };
    case "operator":
      return { title: `Operator action on ${shortId(d.agent_id)}: ${d.result}` };
    case "review":
      return {
        title: `Decision recorded for ${shortId(d.item?.agent_id)}: ${d.item?.status}`,
      };
    case "reset":
      return { title: "Swarm reset by operator", subtitle: d.message };
    default:
      return { title: m.type };
  }
}

export function LivePage({ initialView = "feed" }: { initialView?: "feed" | "topology" } = {}) {
  const [activeView, setActiveView] = useState<"feed" | "topology">(initialView);

  useEffect(() => {
    setActiveView(initialView);
  }, [initialView]);

  const { meta, selectRun, refreshRuns } = useAppState();
  const { messages, connected, totalReceived, clear, reset } = useLiveStream(undefined, 5000);
  const [startedRun, setStartedRun] = useState<string | null>(null);

  // Once started run completes, auto-select it across Dashboard, Incidents, Pipeline
  useEffect(() => {
    if (!startedRun) return;
    const done = messages.some(
      (m) => m.run_id === startedRun && (m.type === "run_finished" || m.type === "run_failed")
    );
    if (!done) return;
    setStartedRun(null);
    refreshRuns().then(() => selectRun(startedRun));
  }, [messages, startedRun, refreshRuns, selectRun]);

  const [scenario, setScenario] = useState("coordinated_leakage");
  const [count, setCount] = useState<AgentCount>(5);
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [runName, setRunName] = useState("");
  const [userTask, setUserTask] = useState("");
  const [showRoleInstructions, setShowRoleInstructions] = useState(false);
  const [agentInstructions, setAgentInstructions] = useState<Record<string, string>>({
    planner: "",
    researcher: "",
    analyst: "",
    coder: "",
    reviewer: "",
  });
  const [userRole, setUserRole] = useState<string>("admin");

  useEffect(() => {
    api.whoami().then((w) => setUserRole(w.role)).catch(() => setUserRole("local"));
  }, []);

  // Feed filter: actions (default: blocks, containments, detections), containment, blocks, detections, all
  const [feedFilter, setFeedFilter] = useState<"actions" | "containment" | "block" | "detection" | "all">("actions");
  const [selectedAgentFilter, setSelectedAgentFilter] = useState<string | null>(null);

  // Derive live KPIs
  const { liveRun, running, agents, circuitBreakerTripped, preExecutionBlocks, covertAlerts, containedAgentsList } =
    useMemo(() => {
      let run: string | null = null;
      let open = false;
      let out = new Map<string, { role: string; state: string; trigger?: string; explanation?: string }>();
      let cbTripped = false;
      let preBlocks = 0;
      let covertCount = 0;

      for (const m of messages as LiveMessage<AnyData>[]) {
        if (m.type === "run_agents") {
          run = m.run_id;
          open = true;
          out = new Map(m.data.agents.map((a: AnyData) => [a.agent_id, { role: a.role, state: "active" }]));
        } else if (m.run_id === run && (m.type === "run_finished" || m.type === "run_failed")) {
          open = false;
        } else if (m.run_id === run && m.type === "containment" && out.has(m.data.agent_id)) {
          const cur = out.get(m.data.agent_id)!;
          cur.state = "paused";
          cur.trigger = m.data.trigger;
          cur.explanation = m.data.explanation;
          if (
            m.data.trigger === "circuit_breaker" ||
            (m.data.explanation && String(m.data.explanation).includes("circuit breaker"))
          ) {
            cbTripped = true;
          }
        } else if (
          m.run_id === run &&
          m.type === "review" &&
          m.data.item?.status === "released" &&
          out.has(m.data.item.agent_id)
        ) {
          out.get(m.data.item.agent_id)!.state = "active";
        } else if (
          m.type === "event" &&
          m.data.status === "denied" &&
          (m.data.gateway_decision === "blocked" ||
            (m.data.payload?.gateway_reason &&
              (String(m.data.payload.gateway_reason).includes("before execution") ||
               String(m.data.payload.gateway_reason).includes("pre-execution") ||
               String(m.data.payload.gateway_reason).includes("not allowed") ||
               String(m.data.payload.gateway_reason).includes("blocked"))))
        ) {
          preBlocks++;
        } else if (m.type === "detection" && m.data.rule_id === "SG-029") {
          covertCount++;
        }
      }

      // Collect stopped agents needing decision
      const contained = [...out.entries()]
        .filter(([, a]) => a.state === "paused")
        .map(([id, a]) => ({
          agent_id: id,
          role: a.role,
          reason: a.trigger === "circuit_breaker" ? "Safety trigger" : a.explanation || "Safety policy",
        }));

      return {
        liveRun: run,
        running: open,
        agents: [...out.entries()],
        circuitBreakerTripped: cbTripped,
        preExecutionBlocks: preBlocks,
        covertAlerts: covertCount,
        containedAgentsList: contained,
      };
    }, [messages]);

  const [acting, setActing] = useState<string | null>(null);

  // Emergency brake only: Pause agent or Stop run
  async function operate(agentId: string | null) {
    if (!liveRun) return;
    setActing(agentId ?? "stop");
    try {
      if (agentId) await api.operateAgent(liveRun, agentId, "pause");
      else await api.stopRun(liveRun);
    } catch (e) {
      setStatus({ kind: "error", message: (e as Error).message });
    } finally {
      setActing(null);
    }
  }

  // Admin-only Reset
  async function handleResetAll() {
    setResetting(true);
    setStatus(null);
    try {
      const res = await api.resetLive();
      reset();
      setStatus({
        kind: "success",
        message: <>All live activity and {res.released_containments || "any"} stopped agent states have been reset.</>,
      });
    } catch (e) {
      reset();
      setStatus({
        kind: "info",
        message: "Live activity feed and counters reset.",
      });
    } finally {
      setResetting(false);
    }
  }

  // Filter feed items
  const feed = useMemo(() => {
    return (messages as LiveMessage<AnyData>[])
      .filter((m) => {
        // Agent filter
        if (selectedAgentFilter) {
          const agentId = m.data.agent_id || (m.data.agent_ids && m.data.agent_ids[0]);
          if (agentId !== selectedAgentFilter) return false;
        }

        // Category filter: Actions (default) -> Containment -> Blocks -> Detections -> All
        const isContainment = (

            m.type === "quarantine" ||
            m.type === "containment" ||
            (m.data && (m.data.trigger === "circuit_breaker" || String(m.data.explanation || "").includes("circuit breaker"))) ||
            (m.type === "detection" && (m.data.severity === "critical" || m.data.severity === "high" || m.data.rule_id === "SG-029"))
        );
        const isBlock = (
            m.type === "event" &&
            (m.data.status === "denied" ||
              m.data.gateway_decision === "blocked" ||
              (m.data.payload?.gateway_reason &&
                (String(m.data.payload.gateway_reason).includes("before execution") ||
                  String(m.data.payload.gateway_reason).includes("pre-execution") ||
                  String(m.data.payload.gateway_reason).includes("not allowed") ||
                  String(m.data.payload.gateway_reason).includes("blocked"))))
        );
        const isDetection = m.type === "detection";
        if (feedFilter === "actions") return Boolean(isContainment || isBlock || isDetection);
        if (feedFilter === "containment") return Boolean(isContainment);
        if (feedFilter === "block") return Boolean(isBlock);
        if (feedFilter === "detection") return isDetection;
        return true; // all
      })
      .slice(-1000)
      .reverse();
  }, [messages, feedFilter, selectedAgentFilter]);

  async function start(chosenScenario?: string) {
    setBusy(true);
    setStatus(null);
    try {
      const targetScenario = chosenScenario || scenario;
      const cleanInstructions: Record<string, string> = {};
      for (const [k, v] of Object.entries(agentInstructions)) {
        if (v && v.trim()) cleanInstructions[k] = v.trim();
      }
      const isAi = ai || targetScenario === "user_directed";
      const r = await api.startRun({
        scenario_id: targetScenario,
        agent_count: count,
        seed: Math.floor(Math.random() * 1000),
        gateway_mode: "monitor",
        drop_rate: 0,
        agent_backend: isAi ? "gemini" : "deterministic",
        agent_mode: isAi ? "autonomous" : "scripted",
        auto_pipeline: true,
        live_guard: "contain",
        persist: true,
        run_name: runName.trim() || undefined,
        user_task: userTask.trim() || undefined,
        agent_instructions: Object.keys(cleanInstructions).length > 0 ? cleanInstructions : undefined,
      });
      setStartedRun(r.run_id);
      const startTimeStr = new Date().toLocaleTimeString();
      setStatus({
        kind: "success",
        message: (
          <>
            Started {runName ? <strong>"{runName}"</strong> : "run"}{" "}
            <code className="font-mono">{r.run_id}</code> at {startTimeStr}. Safety triggers active.
          </>
        ),
      });
    } catch (e) {
      setStatus({ kind: "error", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const displayCount = totalReceived || messages.length;

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Swarm activity."
        subtitle="Watch agent events as they happen or view how agents connect."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              value={activeView}
              onChange={(v) => {
                setActiveView(v);
                if (v === "topology") window.location.hash = "#/swarm";
                else window.location.hash = "#/live";
              }}
              options={[
                { value: "feed", label: "Activity" },
                { value: "topology", label: "Agent map" },
              ]}
            />
          </div>
        }
      />

      <StatusBanner status={status} onClose={() => setStatus(null)} />

      {activeView === "topology" ? (
        <div className="transition-opacity">
          <SwarmPage hideHeader />
        </div>
      ) : (
        <>
          {/* Top Control Bar: Start Run and Emergency Stop */}
          <div className="rounded-[var(--r-card)] card p-4 border border-[var(--hairline)] shadow-[var(--shadow-1)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3.5 flex-1 min-w-0">
                {/* Scenario Selector: Spacious, comfortable, accessible */}
                <div className="min-w-[280px] sm:min-w-[340px] md:min-w-[380px] flex-1 max-w-[480px]">
                  <CustomSelect
                    value={scenario}
                    onChange={(val) => { setScenario(val); if (val === "user_directed") setAi(true); }}
                    options={
                      meta?.scenarios
                        .map((s) => ({
                          value: s.scenario_id,
                          label: s.name,
                          description: s.description,
                        })) ?? []
                    }
                    size="md"
                    ariaLabel="Select attack scenario or collaborative task for live run"
                  />
                </div>

                <div className="flex items-center gap-2 text-[14px]">
                  <span className="text-[var(--text-3)] font-medium">Agents:</span>
                  <Segmented
                    size="md"
                    value={count}
                    onChange={setCount}
                    options={[5, 10, 20].map((n) => ({ value: n as AgentCount, label: n }))}
                  />
                </div>

                <div className="flex items-center gap-2 text-[14px]">
                  <span className="text-[var(--text-3)] font-medium">Mode:</span>
                  <Segmented
                    size="md"
                    value={ai ? "ai" : "scripted"}
                    onChange={(v) => setAi(v === "ai")}
                    options={[
                      { value: "scripted", label: "Scripted" },
                      { value: "ai", label: "AI" },
                    ]}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => start()}
                  disabled={busy}
                  className="h-10 rounded-full bg-[var(--accent)] hover:opacity-90 text-white font-medium px-5 text-[14px] shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  {busy ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Starting…</span>
                    </>
                  ) : (
                    <>
                      <Play size={14} className="fill-current" />
                      <span>Start</span>
                    </>
                  )}
                </button>
              </div>

              {/* Emergency Stop Run Button */}
              {running && (
                <button
                  type="button"
                  disabled={acting === "stop"}
                  onClick={() => operate(null)}
                  className="h-10 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-medium px-5 text-[14px] shadow-xs transition-colors flex items-center gap-2"
                >
                  <Square size={14} className="fill-current" />
                  <span>Stop run</span>
                </button>
              )}
            </div>

            {/* Run name: asked for every run (simulator or AI); saved with the date and time it started */}
            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[var(--hairline-subtle)] pt-4 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <label htmlFor="run-name" className="mb-1 block text-[13px] font-semibold text-[var(--text)]">Run name</label>
                <input
                  id="run-name"
                  type="text"
                  maxLength={120}
                  value={runName}
                  onChange={(e) => setRunName(e.target.value)}
                  placeholder={`e.g. ${scenario.replace(/_/g, " ")} test`}
                  className="h-10 w-full rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-3 text-[13px] text-[var(--text)] placeholder:text-[var(--text-3)] focus:border-[var(--accent)] focus:outline-none"
                />
              </div>
              <p className="text-[12px] text-[var(--text-3)] md:pb-2.5">
                Saved to History with today's date and start time ({new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })})
              </p>
            </div>

            {/* AI Directives & Run Configuration (when Mode: AI or user_directed) */}
            {(ai || scenario === "user_directed") && (
              <div className="mt-4 pt-4 border-t border-[var(--hairline-subtle)] space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-1.5">
                        <span>Task prompt</span>
                        <span className="text-[11px] font-normal text-[var(--text-3)]">
                          (The user-directed objective for the swarm to collaboratively solve)
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowRoleInstructions((s) => !s)}
                        className="text-[12px] font-medium text-[var(--accent)] hover:underline flex items-center gap-1"
                      >
                        {showRoleInstructions ? "Hide role instructions ▲" : "Per-agent instructions ▼"}
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      className="w-full rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--text)] placeholder:text-[var(--text-3)] focus:border-[var(--accent)] focus:outline-none"
                      placeholder="e.g. Collaboratively design and implement a secure data pipeline with automated unit tests..."
                      value={userTask}
                      onChange={(e) => setUserTask(e.target.value)}
                    />
                  </div>
                </div>

                {showRoleInstructions && (
                  <div className="rounded-xl border border-[var(--hairline-subtle)] bg-[var(--card-alt)] p-3 space-y-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] block mb-1">
                      Optional Per-Role Directives (Overrides planner's instructions for specified roles)
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
                      {(["planner", "researcher", "analyst", "coder", "reviewer"] as const).map((role) => (
                        <div key={role} className="flex items-center gap-2">
                          <span className="w-20 font-mono text-[11px] text-[var(--text-2)] capitalize shrink-0">{role}:</span>
                          <input
                            type="text"
                            className="flex-1 rounded-lg border border-[var(--hairline)] bg-[var(--card)] px-2.5 py-1 text-[12px] text-[var(--text)] placeholder:text-[var(--text-3)]"
                            placeholder={`Directive for ${role}...`}
                            value={agentInstructions[role] ?? ""}
                            onChange={(e) => setAgentInstructions((prev) => ({ ...prev, [role]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="max-w-md pt-1">
                  <GeminiQuota agentCount={count} agentMode="autonomous" />
                </div>
              </div>
            )}
          </div>

          {/* Pinned "Needs decision" Strip with Review -> Link */}
          {containedAgentsList.length > 0 && (
            <div className="rounded-[var(--r-card)] border border-rose-300 bg-rose-50/80 p-4 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white text-[11px] font-bold">
                    {containedAgentsList.length}
                  </span>
                  <span className="font-semibold text-[14px] text-rose-950">
                    Needs decision ({containedAgentsList.length})
                  </span>
                </div>
                <a
                  href="#/incidents"
                  className="text-[13px] font-semibold text-rose-700 hover:text-rose-900 flex items-center gap-1"
                >
                  Open Incidents &rarr;
                </a>
              </div>
              <div className="divide-y divide-rose-200/70">
                {containedAgentsList.map((c) => (
                  <div key={c.agent_id} className="py-2.5 flex items-center justify-between gap-4 text-[13px]">
                    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                      <span className="text-rose-600 shrink-0">⛔</span>
                      <span className="font-semibold text-neutral-900 shrink-0 whitespace-nowrap">{friendlyAgentName(c.agent_id, c.role)}</span>
                      <span className="font-mono text-xs text-neutral-500 shrink-0 whitespace-nowrap">({shortId(c.agent_id)})</span>
                      <span className="text-neutral-600 shrink-0 whitespace-nowrap">stopped</span>
                      <span className="text-neutral-400 shrink-0">&middot;</span>
                      <span className="text-neutral-800 font-medium truncate min-w-0" title={c.reason}>{c.reason}</span>
                    </div>

                    <a
                      href="#/incidents"
                      className="shrink-0 inline-flex items-center gap-1 px-3.5 py-1 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-[12px] font-medium shadow-2xs transition-colors whitespace-nowrap"
                    >
                      <span>Review &rarr;</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HUD Metric Tiles (Plain English) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-[var(--r-card)] card p-4 border border-[var(--hairline)] shadow-[var(--shadow-1)]">
              <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
                <span>Live Stream</span>
                <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
              </div>
              <div className="mt-2 text-[26px] font-bold tabular-nums text-[var(--text)]">
                {displayCount.toLocaleString()}
              </div>
              <span className="text-[12px] text-[var(--text-2)]">Events Received</span>
            </div>

            <div className="rounded-[var(--r-card)] card p-4 border border-[var(--hairline)] shadow-[var(--shadow-1)]">
              <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-[var(--accent)]">
                <span>Stopped before it ran</span>
                <Lock size={14} />
              </div>
              <div className="mt-2 text-[26px] font-bold tabular-nums text-[var(--accent)]">
                {preExecutionBlocks}
              </div>
              <span className="text-[12px] text-[var(--text-2)]">Stopped before it ran</span>
            </div>

            <div className="rounded-[var(--r-card)] card p-4 border border-[var(--hairline)] shadow-[var(--shadow-1)]">
              <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-rose-600">
                <span>Secret data sends</span>
                <ShieldAlert size={14} />
              </div>
              <div className="mt-2 text-[26px] font-bold tabular-nums text-rose-600">
                {covertAlerts}
              </div>
              <span className="text-[12px] text-[var(--text-2)]">Secret data sends caught</span>
            </div>

            <div className="rounded-[var(--r-card)] card p-4 border border-[var(--hairline)] shadow-[var(--shadow-1)]">
              <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
                <span>Safety trigger</span>
                <Zap size={14} className={circuitBreakerTripped ? "text-rose-600" : "text-[#1F7A45]"} />
              </div>
              <div className="mt-2 text-[18px] font-bold tracking-tight">
                {circuitBreakerTripped ? (
                  <span className="text-rose-600">TRIGGERED</span>
                ) : (
                  <span className="text-[#1F7A45]">Safety trigger: ready</span>
                )}
              </div>
              <span className="text-[12px] text-[var(--text-2)]">
                {agents.filter(([, a]) => a.state === "paused").length} agents stopped
              </span>
            </div>
          </div>

          {/* Merged Control Room: Agents Roster + Live Feed */}
          <div className="grid gap-6 lg:grid-cols-[280px_1fr] [&>*]:min-w-0">
            {/* Left Column: Live Agent Roster (Emergency Brake Pause on hover, click to filter feed) */}
            <Card
              title={
                <div className="flex items-center justify-between">
                  <span>Agents ({agents.length})</span>
                  {selectedAgentFilter && (
                    <button
                      type="button"
                      onClick={() => setSelectedAgentFilter(null)}
                      className="text-[11px] font-normal text-[var(--accent)] hover:underline flex items-center gap-1"
                    >
                      <Filter size={11} /> Clear filter
                    </button>
                  )}
                </div>
              }
            >
              {agents.length ? (
                <div className="space-y-4">
                  {/* High Risk Section (flagged or stopped agents) */}
                  {agents.filter(([, a]) => a.state === "paused" || a.trigger).length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between px-1 text-[11px] font-bold uppercase tracking-wider text-rose-700">
                        <span>High Risk ({agents.filter(([, a]) => a.state === "paused" || a.trigger).length})</span>
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] text-white font-bold">!</span>
                      </div>
                      <ul className="space-y-1.5 text-[14px]">
                        {agents.filter(([, a]) => a.state === "paused" || a.trigger).map(([id, a]) => {
                          const isSelected = selectedAgentFilter === id;
                          return (
                            <li
                              key={id}
                              onClick={() => setSelectedAgentFilter(isSelected ? null : id)}
                              className={`group flex cursor-pointer items-center justify-between gap-2 rounded-xl p-2.5 border transition-all ${
                                isSelected
                                  ? "border-rose-400 bg-rose-50/70"
                                  : "border-rose-200 bg-rose-50/30 hover:border-rose-300"
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="text-[13px] font-semibold text-rose-950 truncate">
                                  {friendlyAgentName(id, a.role)}
                                </div>
                                <div className="font-mono text-[11px] text-rose-700/80">
                                  {shortId(id)} &middot; <span className="capitalize">{a.role}</span>
                                </div>
                              </div>
                              <span className="rounded-full px-2 py-0.5 text-[11px] font-bold bg-rose-600 text-white">
                                Stopped
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {/* Low Risk / Safe Section */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between px-1 text-[11px] font-bold uppercase tracking-wider text-[#1F7A45]">
                      <span>Low Risk / Safe ({agents.filter(([, a]) => a.state !== "paused" && !a.trigger).length})</span>
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    </div>
                    <ul className="space-y-1.5 text-[14px]">
                      {agents.filter(([, a]) => a.state !== "paused" && !a.trigger).map(([id, a]) => {
                        const isSelected = selectedAgentFilter === id;
                        return (
                          <li
                            key={id}
                            onClick={() => setSelectedAgentFilter(isSelected ? null : id)}
                            className={`group flex cursor-pointer items-center justify-between gap-2 rounded-xl p-2.5 border transition-all ${
                              isSelected
                                ? "border-[var(--accent)] bg-[var(--accent)]/5"
                                : "border-[var(--hairline-subtle)] bg-[var(--card)] hover:border-[var(--text-3)]"
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold text-[var(--text)] truncate">
                                {friendlyAgentName(id, a.role)}
                              </div>
                              <div className="font-mono text-[11px] text-[var(--text-3)]">
                                {shortId(id)} &middot; <span className="capitalize">{a.role}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="rounded-full px-2 py-0.5 text-[11px] font-medium bg-emerald-500/10 text-[#1F7A45]">
                                Active
                              </span>

                              {running && (
                                <button
                                  type="button"
                                  className="opacity-0 group-hover:opacity-100 rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-600 hover:text-white transition-all disabled:opacity-40"
                                  disabled={acting === id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    operate(id);
                                  }}
                                  aria-label={`Pause ${id}`}
                                >
                                  {acting === id ? "…" : "Pause"}
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              ) : (
                <Empty>Agents appear when a run starts.</Empty>
              )}
            </Card>

            {/* Right Column: Feed with Actions / Alerts / Everything tabs */}
            <Card
              title={`Live activity (${displayCount.toLocaleString()})`}
              actions={
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="text-[12px] text-[var(--text-3)] hover:text-[var(--text)] underline"
                    onClick={clear}
                  >
                    Clear feed
                  </button>
                  {(userRole === "admin" || userRole === "local") && (
                    <button
                      type="button"
                      className="text-[12px] font-medium text-rose-600 hover:underline disabled:opacity-40"
                      onClick={handleResetAll}
                      disabled={resetting}
                    >
                      {resetting ? "Resetting…" : "Reset All"}
                    </button>
                  )}
                </div>
              }
            >
              {/* Filter pills: [Actions] · [Containment] · [Blocks] · [Detections] · [All] */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline-subtle)] pb-3 text-[13px]">
                <div className="inline-flex rounded-full bg-[var(--hairline-subtle)] p-0.5 text-[12px]">
                  <button
                    type="button"
                    onClick={() => setFeedFilter("actions")}
                    className={`rounded-full px-3.5 py-1 font-medium transition-all ${
                      feedFilter === "actions"
                        ? "bg-[var(--card)] text-[var(--text)] shadow-xs"
                        : "text-[var(--text-2)] hover:text-[var(--text)]"
                    }`}
                  >
                    Actions
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedFilter("containment")}
                    className={`rounded-full px-3.5 py-1 font-medium transition-all ${
                      feedFilter === "containment"
                        ? "bg-rose-600 text-white shadow-xs"
                        : "text-[var(--text-2)] hover:text-[var(--text)]"
                    }`}
                  >
                    Containment
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedFilter("block")}
                    className={`rounded-full px-3.5 py-1 font-medium transition-all ${
                      feedFilter === "block"
                        ? "bg-[var(--card)] text-[var(--text)] shadow-xs"
                        : "text-[var(--text-2)] hover:text-[var(--text)]"
                    }`}
                  >
                    Blocks
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedFilter("detection")}
                    className={`rounded-full px-3.5 py-1 font-medium transition-all ${
                      feedFilter === "detection"
                        ? "bg-[var(--card)] text-[var(--text)] shadow-xs"
                        : "text-[var(--text-2)] hover:text-[var(--text)]"
                    }`}
                  >
                    Detections
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedFilter("all")}
                    className={`rounded-full px-3.5 py-1 font-medium transition-all ${
                      feedFilter === "all"
                        ? "bg-[var(--card)] text-[var(--text)] shadow-xs"
                        : "text-[var(--text-2)] hover:text-[var(--text)]"
                    }`}
                  >
                    All
                  </button>
                </div>

                <div className="text-[12px] text-[var(--text-3)]">
                  {feedFilter === "actions"
                    ? "Showing what SwarmGuard did: blocks, containments and detections"
                    : feedFilter === "containment"
                    ? "Showing containments, quarantined messages, and high-risk detections"
                    : feedFilter === "block"
                    ? "Showing actions stopped before execution by policy gateway"
                    : feedFilter === "detection"
                    ? "Showing threat detection alerts"
                    : "Showing all streaming events"}
                  {selectedAgentFilter ? ` for ${shortId(selectedAgentFilter)}` : ""}
                </div>
              </div>

              {feed.length ? (
                <ol className="max-h-[580px] space-y-2 overflow-y-auto pr-1 text-[14px]" aria-label="Live feed">
                  {feed.map((m) => {
                    const desc = describe(m as LiveMessage<AnyData>);
                    return (
                      <li
                        key={m.seq}
                        className={`rounded-xl p-3 border transition-all ${
                          desc.isCircuitBreaker
                            ? "border-rose-400 bg-rose-50/70 font-semibold"
                            : desc.isPreBlock
                            ? "border-[var(--accent)]/40 bg-[var(--accent)]/5"
                            : desc.isCovert
                            ? "border-amber-400 bg-amber-50/60"
                            : "border-[var(--hairline-subtle)] bg-[var(--card)]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-[var(--text-3)]">#{m.seq}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                                TONE[m.type] ?? "bg-[var(--low-bg)] text-[var(--text-2)]"
                              }`}
                            >
                              {m.type === "event" ? "Event" : m.type}
                            </span>

                            {desc.isPreBlock && (
                              <span className="rounded-full bg-[var(--accent)] text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                                Stopped before it ran
                              </span>
                            )}

                            {desc.isCircuitBreaker && (
                              <span className="rounded-full bg-rose-600 text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                                Safety trigger
                              </span>
                            )}

                            {desc.isCovert && (
                              <span className="rounded-full bg-amber-500/10 text-amber-800 border border-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                                Secret data send
                              </span>
                            )}
                          </div>

                          {m.ts && (
                            <span className="font-mono text-[11px] text-[var(--text-3)]">
                              {new Date(m.ts).toLocaleTimeString()}
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 font-medium text-[var(--text)] [overflow-wrap:anywhere]">
                          {desc.title}
                        </div>

                        {desc.subtitle && (
                          <div className="mt-1 text-[13px] text-[var(--text-2)] [overflow-wrap:anywhere]">
                            {desc.subtitle}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <Empty>No events in feed. Start a scenario run above to observe live activity.</Empty>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
