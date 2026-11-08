import { useState, useMemo } from "react";
import { useAppState, useRunData } from "../state";
import { api } from "../api";
import { Tile } from "../components/Tile";
import { Drawer } from "../components/Drawer";
import { GraphView } from "../components/GraphView";
import { deriveIncidentTitle } from "../lib/incidentHelper";
import { friendlyAgentName } from "../lib/format";
import { ArrowRight, ShieldCheck, ShieldAlert, Play, Check } from "lucide-react";

export function OverviewPage() {
  const { selectedRunId, selectRun, refreshRuns } = useAppState();
  const alertsData = useRunData(api.alerts, selectedRunId);
  const agentsData = useRunData(api.agents, selectedRunId);
  const graphData = useRunData(api.graph, selectedRunId);
  // Everything on the Dashboard is about the selected run, including its reviews.
  const reviewsData = useRunData((runId) => api.reviews(undefined, runId), selectedRunId);
  const eventsData = useRunData(api.normalizedEvents, selectedRunId);

  const alerts = alertsData.data ?? [];
  const agents = agentsData.data ?? [];
  const runReviews = reviewsData.data ?? [];
  const pendingReviews = runReviews.filter((r) => r.status === "pending");
  const events = eventsData.data ?? [];

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [startingDemo, setStartingDemo] = useState(false);
  const selectedAgent = agents.find((a) => a.agent_id === selectedAgentId);
  const selectedAgentAlerts = alerts.filter((alt) => alt.agent_ids.includes(selectedAgentId ?? ""));

  const alertEventIds = useMemo(() => {
    const set = new Set<string>();
    for (const a of alerts) {
      for (const eid of a.event_ids ?? []) set.add(eid);
    }
    return set;
  }, [alerts]);

  const topAlert = useMemo(() => {
    const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return [...alerts].sort((a, b) =>
      (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0) ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
  }, [alerts]);
  const totalIncidents = alerts.length;

  // Severity breakdown
  const critCount = alerts.filter((a) => a.severity === "critical").length;
  const highCount = alerts.filter((a) => a.severity === "high").length;
  const medCount = alerts.filter((a) => a.severity === "medium").length;

  // Metric 1: Stopped before it ran = actions the gate actually refused in this run.
  const stoppedBeforeRanCount = events.filter((e) => e.status === "denied").length;

  const flaggedAgentsCount = new Set(alerts.flatMap((alert) => alert.agent_ids ?? [])).size;
  // Completed events linked to high-severity alerts need review; the alert alone does not prove harm.
  const flaggedCompletedActionCount = useMemo(() => {
    const ids = new Set(alerts.filter((a) => a.severity === "high" || a.severity === "critical").flatMap((a) => a.event_ids ?? []));
    return events.filter(
      (e) => ids.has(e.event_id) && e.status === "success" &&
        ["data_transfer", "resource_access", "tool_call"].includes(e.event_type)
    ).length;
  }, [alerts, events]);
  const untrustedRead = events.some((e) => Boolean((e.payload as Record<string, unknown> | undefined)?.untrusted));

  // Metric 4: Can't check (SG-030 low-severity claims where monitor lost events)
  const cantCheckCount = alerts.filter(
    (a) =>
      a.rule_id === "SG-030" &&
      (a.severity === "low" ||
        a.rule_name?.toLowerCase().includes("unverified") ||
        a.reason?.toLowerCase().includes("unverified") ||
        a.reason?.toLowerCase().includes("lost events"))
  ).length;

  // Incident sequence, built from what actually happened in this run (never a fixed story).
  const timeline = useMemo(() => {
    const steps: { label: string; tone: string }[] = [];
    const red = "bg-rose-500/10 text-rose-700 border-rose-300";
    const amber = "bg-amber-500/10 text-amber-700 border-amber-300";
    const blue = "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/30";
    const grey = "bg-neutral-100 text-neutral-800 border-neutral-300";
    if (untrustedRead) steps.push({ label: "Untrusted content read", tone: red });
    if (topAlert) steps.push({ label: `Detected: ${topAlert.rule_name}`, tone: amber });
    if (stoppedBeforeRanCount) steps.push({ label: `${stoppedBeforeRanCount} action${stoppedBeforeRanCount === 1 ? "" : "s"} stopped before running`, tone: blue });
    if (flaggedCompletedActionCount) steps.push({ label: `${flaggedCompletedActionCount} linked high-risk action${flaggedCompletedActionCount === 1 ? "" : "s"} completed`, tone: red });
    if (pendingReviews.length) steps.push({ label: `${pendingReviews.length} waiting for a human decision`, tone: grey });
    return steps;
  }, [untrustedRead, topAlert, stoppedBeforeRanCount, flaggedCompletedActionCount, pendingReviews.length]);

  // Loading and selection states
  const isNoRun = !selectedRunId;
  const isCleanRun = !isNoRun && totalIncidents === 0;
  const isThreatRun = !isNoRun && totalIncidents > 0;

  // Start live demo handler (scripted leak chain: detection, containment and a decision, no model needed)
  async function handleStartDemo() {
    setStartingDemo(true);
    try {
      const r = await api.startRun({
        scenario_id: "coordinated_leakage",
        agent_count: 5,
        seed: Math.floor(Math.random() * 1000),
        gateway_mode: "monitor",
        drop_rate: 0,
        agent_backend: "deterministic",
        agent_mode: "scripted",
        auto_pipeline: true,
        live_guard: "contain",
        persist: true,
      });
      await refreshRuns();
      selectRun(r.run_id);
      window.location.hash = "#/live";
    } catch (e) {
      console.error(e);
      window.location.hash = "#/live";
    } finally {
      setStartingDemo(false);
    }
  }

  // Top incident plain sentence
  const topIncidentSentence = useMemo(() => {
    if (!topAlert) return null;
    const rule = topAlert.rule_id;
    if (rule === "SG-001") {
      return "An agent attempted to read restricted customer data without authorization.";
    }
    if (rule === "SG-002" || rule === "SG-029") {
      return "An agent attempted to send sensitive internal data to an unapproved external destination.";
    }
    if (rule === "SG-003") {
      return "Multiple agents coordinated a data handoff to leak restricted records.";
    }
    if (rule === "SG-028") {
      return "Malicious prompt injection detected inside ingested tool output.";
    }
    if (rule === "SG-030") {  // the reason already says which claim was false and how
      return topAlert.reason || "An agent's report of its own actions doesn't match what was recorded.";
    }
    return topAlert.reason || "Suspicious behavior detected outside declared safety policies.";
  }, [topAlert]);

  return (
    <div className="space-y-10">
      {/* Page Header */}
      <div className="space-y-1">
        <h1 className="text-[36px] sm:text-[44px] font-bold tracking-tight text-[var(--text)]">
          SwarmGuard.
        </h1>
        <p className="text-[16px] text-[var(--text-2)]">
          See what happened in your run, why it was flagged, and what response followed.
        </p>
      </div>

      {/* Hero: If No Run Selected -> Clean "Start live demo" Banner */}
      {isNoRun && (
        <div className="rounded-[var(--r-tile)] card p-8 text-center shadow-[var(--shadow-1)] border border-[var(--hairline)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)] mb-4">
            <Play size={28} className="fill-current ml-0.5" />
          </div>
          <h2 className="text-[26px] font-semibold text-[var(--text)]">
            No active run selected
          </h2>
          <p className="mt-2 text-[15px] text-[var(--text-2)] max-w-lg mx-auto">
            Start a sample run to see how the system records agent activity and flags risky behavior.
          </p>
          <div className="mt-6">
            <button
              type="button"
              disabled={startingDemo}
              onClick={handleStartDemo}
              className="h-11 rounded-full bg-[var(--accent)] hover:opacity-90 text-white font-medium px-8 text-[15px] shadow-sm transition-all inline-flex items-center gap-2"
            >
              <Play size={16} className="fill-current" />
              <span>{startingDemo ? "Starting demo…" : "Start live demo"}</span>
            </button>
          </div>
        </div>
      )}

      {/* 1. Verdict Banner: findings and affected agents from the selected run */}
      {!isNoRun && (
        <div
          className={`rounded-[var(--r-tile)] card p-8 shadow-[var(--shadow-1)] border transition-all ${
            isThreatRun
              ? "border-rose-300 bg-rose-50/50"
              : "border-emerald-300 bg-emerald-50/40"
          }`}
        >
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider">
                {isCleanRun ? (
                  <span className="flex items-center gap-1.5 text-[#1F7A45]">
                    <ShieldCheck size={16} />
                    <span>No incidents recorded</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-rose-700">
                    <ShieldAlert size={16} />
                    <span>Incidents found</span>
                  </span>
                )}
              </div>

              {/* Verdict Banner Sentence */}
              <h2 className="mt-2 text-[26px] sm:text-[32px] font-bold leading-tight tracking-tight text-[var(--text)]">
                {isCleanRun ? (
                  "No incidents were recorded for this run."
                ) : (
                  `${totalIncidents} incident${totalIncidents === 1 ? "" : "s"} found · ${flaggedAgentsCount} agent${flaggedAgentsCount === 1 ? "" : "s"} flagged`
                )}
              </h2>

              <p className="mt-2 text-[15px] text-[var(--text-2)] leading-relaxed">
                {isCleanRun
                  ? `No incidents were recorded for run ${selectedRunId}. A clean result does not prove that every action was safe.`
                  : flaggedCompletedActionCount === 0
                  ? `No linked high-risk action is recorded as completed in run ${selectedRunId}. Review the evidence and response for context.`
                  : `${flaggedCompletedActionCount} linked high-risk action${flaggedCompletedActionCount === 1 ? " was" : "s were"} recorded as completed. Review the evidence and response.`}
              </p>
            </div>

            {/* 2. "N need a decision ->" action pill (hidden when count is 0) */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
              {pendingReviews.length > 0 && (
                <a
                  href="#/incidents"
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-medium px-5 text-[14px] shadow-xs transition-colors"
                >
                  <span>{pendingReviews.length} need a decision</span>
                  <ArrowRight size={15} />
                </a>
              )}
              {topAlert && (
                <a
                  href={`#/incidents/${topAlert.alert_id}`}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--card)] border border-[var(--hairline)] hover:border-[var(--text-3)] px-5 text-[14px] font-medium text-[var(--text)] shadow-xs transition-colors"
                >
                  <span>Open incident</span>
                  <ArrowRight size={15} />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. 4 Number Tiles (Strictly Plain English) */}
      {!isNoRun && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Tile
            label="Stopped before it ran"
            value={stoppedBeforeRanCount}
            subtext="Tool calls halted by policy gate"
            tone="ok"
          />
          <Tile
            label="Agents flagged"
            value={flaggedAgentsCount}
            subtext="Named in incident records"
            tone={flaggedAgentsCount > 0 ? "crit" : "normal"}
          />
          <Tile
            label="Incidents by severity"
            value={
              critCount > 0
                ? `${critCount} crit · ${highCount} high`
                : highCount > 0
                ? `${highCount} high`
                : medCount > 0
                ? `${medCount} medium`
                : "None"
            }
            subtext={
              totalIncidents > 0
                ? `${totalIncidents} total incident${totalIncidents === 1 ? "" : "s"}`
                : "Zero incidents"
            }
            tone={critCount > 0 ? "crit" : highCount > 0 ? "high" : "normal"}
          />
          <Tile
            label="Can't check"
            value={cantCheckCount}
            subtext="Monitor lost events (low severity)"
            tone="normal"
          />
        </div>
      )}

      {/* 4. Swarm Topology Graph: Contained agents shown in red with lock */}
      {!isNoRun && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div>
              <h3 className="text-[18px] font-semibold tracking-tight text-[var(--text)]">
                Swarm Communication &amp; Safety Topology
              </h3>
              <p className="text-[13px] text-[var(--text-2)]">
                Red marks agents named in incident records. Highlighted paths show events linked to alerts.
              </p>
            </div>
            <a
              href="#/swarm"
              className="text-[13px] font-medium text-[var(--accent)] hover:underline flex items-center gap-1"
            >
              <span>View swarm activity</span>
              <ArrowRight size={13} />
            </a>
          </div>

          <div className="rounded-[var(--r-tile)] card p-4 sm:p-6 shadow-[var(--shadow-1)] border border-[var(--hairline)]">
            <GraphView
              graph={graphData.data}
              onSelectNode={(agentId: string) => setSelectedAgentId(agentId)}
              selectedNodeId={selectedAgentId}
              alertEventIds={alertEventIds}
              height={440}
            />
          </div>
        </div>
      )}

      {/* 5. Attack Timeline Strip (Strictly Plain English) */}
      {!isNoRun && isThreatRun && (
        <div className="rounded-[var(--r-card)] card p-5 border border-[var(--hairline)] shadow-[var(--shadow-1)]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] block mb-3">
            Incident Sequence
          </span>
          <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-[var(--text)]">
            {timeline.map((step, i) => (
              <span key={step.label} className="flex items-center gap-2">
                {i > 0 && <span className="text-[var(--text-3)]">&rarr;</span>}
                <span className={`rounded-full px-3 py-1 border ${step.tone}`}>{step.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 6. Top Incident Card: Worst alert in one plain sentence */}
      {!isNoRun && topAlert && (
        <div className="rounded-[var(--r-card)] card p-6 border border-[var(--hairline)] shadow-[var(--shadow-1)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-2xl">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-600 block mb-1">
                Highest Priority Incident
              </span>
              <h4 className="text-[17px] font-semibold text-[var(--text)]">
                {deriveIncidentTitle(topAlert, agents, [])}
              </h4>
              <p className="mt-1 text-[14px] text-[var(--text-2)] leading-relaxed">
                {topIncidentSentence}
              </p>
            </div>
            <a
              href={`#/incidents/${topAlert.alert_id}`}
              className="h-9 rounded-full bg-[var(--accent)] hover:opacity-90 text-white font-medium px-4 text-[13px] shadow-xs transition-opacity inline-flex items-center gap-1.5 shrink-0"
            >
              <span>Review evidence</span>
              <ArrowRight size={13} />
            </a>
          </div>
        </div>
      )}

      {/* 7. Footer Trust Line */}
      <footer className="border-t border-[var(--hairline-subtle)] pt-6 pb-2 text-[13px] text-[var(--text-2)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Check size={16} aria-hidden="true" />
          <span>Review results in context. Detection does not prove compromise.</span>
        </div>
        <a
          href="#/evaluation"
          className="font-medium text-[var(--link)] hover:underline flex items-center gap-1"
        >
          <span>View evaluation</span>
          <ArrowRight size={13} />
        </a>
      </footer>

      {/* Side Drawer for Agent Dossier on Node Click */}
      <Drawer
        open={!!selectedAgentId}
        onClose={() => setSelectedAgentId(null)}
        title={selectedAgent ? friendlyAgentName(selectedAgent.agent_id, selectedAgent.role) : "Agent Details"}
        subtitle={selectedAgent ? `Role: ${selectedAgent.role}` : ""}
      >
        {selectedAgent && (
          <div className="space-y-6 text-[14px]">
            <div className="rounded-xl card-subtle p-4 border border-[var(--hairline-subtle)] space-y-2">
              <div className="flex justify-between">
                <span className="text-[var(--text-3)]">Status:</span>
                <span
                  className={`font-semibold ${
                    selectedAgent.is_malicious ? "text-rose-600" : "text-[#1F7A45]"
                  }`}
                >
                  {selectedAgent.is_malicious ? "Agent stopped" : "Active & Healthy"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-3)]">Assigned Role:</span>
                <span className="capitalize font-medium text-[var(--text)]">{selectedAgent.role}</span>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-[14px] text-[var(--text)] mb-2">Permissions:</h4>
              <div className="flex flex-wrap gap-1.5">
                {selectedAgent.permissions && selectedAgent.permissions.length > 0 ? (
                  selectedAgent.permissions.map((p) => (
                    <span
                      key={p}
                      className="rounded-md card px-2 py-1 font-mono text-[11px] text-[var(--text-2)] border border-[var(--hairline)]"
                    >
                      {p}
                    </span>
                  ))
                ) : (
                  <span className="text-[var(--text-3)] text-[13px]">Standard operational permissions</span>
                )}
              </div>
            </div>

            {selectedAgentAlerts.length > 0 && (
              <div className="border-t border-[var(--hairline-subtle)] pt-4">
                <h4 className="font-semibold text-[14px] text-rose-700 mb-2">
                  Incidents Involving This Agent ({selectedAgentAlerts.length}):
                </h4>
                <div className="space-y-2">
                  {selectedAgentAlerts.map((a) => (
                    <a
                      key={a.alert_id}
                      href={`#/incidents/${a.alert_id}`}
                      className="block p-3 rounded-lg border border-rose-200 bg-rose-50/50 hover:border-rose-300 transition-colors"
                    >
                      <div className="text-[13px] font-semibold text-rose-900">{a.rule_name}</div>
                      <div className="text-[12px] text-neutral-700 mt-1">{a.reason}</div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
