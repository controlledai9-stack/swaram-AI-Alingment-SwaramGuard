import { useEffect, useState, useMemo } from "react";
import { useAppState, useRunData } from "../state";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import { Pill } from "../components/Pill";
import { ScoreRing } from "../components/ScoreRing";
import { EvidenceChip } from "../components/EvidenceChip";
import { Drawer } from "../components/Drawer";
import { Footnotes } from "../components/Footnotes";
import { Card, Empty, Segmented } from "../components/ui";
import { DecisionCard } from "../components/DecisionCard";
import { time } from "../lib/format";
import { deriveIncidentTitle, getAgentRole } from "../lib/incidentHelper";
import { useLiveStream } from "../lib/live";
import type { Alert, NormalizedEvent, ReviewItem } from "../types";
import { Check, Copy, ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";

function AgentRoleBadge({
  agentId,
  role,
}: {
  agentId: string;
  role: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <span
      className="group relative inline-flex items-center gap-1.5 rounded-md card px-2 py-0.5 text-[14px] font-medium text-[var(--text)] transition-colors hover:border-[var(--accent)]"
      title={`Click to copy full ID: ${agentId}`}
    >
      <span className="capitalize">{role}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(agentId);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="cursor-pointer text-[var(--text-3)] hover:text-[var(--accent)] transition-opacity ml-0.5"
        aria-label={`Copy full agent ID ${agentId}`}
      >
        {copied ? <Check size={12} className="text-[#1F7A45]" /> : <Copy size={12} />}
      </button>
    </span>
  );
}

type MergedReviewItem = ReviewItem & { review_ids: string[] };

export function IncidentsPage({
  initialAlertId,
  initialView = "needs_decision",
}: {
  initialAlertId?: string;
  initialView?: "needs_decision" | "all";
} = {}) {
  const [mainView, setMainView] = useState<"needs_decision" | "all">(initialView);
  const [decisionFilter, setDecisionFilter] = useState<"pending" | "resolved">("pending");
  const [reviewTick, setReviewTick] = useState(0);

  useEffect(() => {
    setMainView(initialView);
  }, [initialView]);

  const { selectedRunId } = useAppState();
  const alertsData = useRunData(api.alerts, selectedRunId);
  const normalizedData = useRunData(api.normalizedEvents, selectedRunId);
  const assessmentsData = useRunData(api.assessments, selectedRunId);
  const agentsData = useRunData(api.agents, selectedRunId);

  // Reviews data (real-time stream subscription)
  const reviewsData = useRunData(() => api.reviews(), "reviews", [reviewTick]);
  const live = useLiveStream(undefined, 50);
  const reviewMsgs = live.messages.filter((m) => m.type === "review");
  const lastReview = reviewMsgs[reviewMsgs.length - 1]?.seq;
  useEffect(() => {
    if (lastReview) setReviewTick((t) => t + 1);
  }, [lastReview]);

  const alerts = alertsData.data ?? [];
  const normalizedEvents = normalizedData.data ?? [];
  const assessments = assessmentsData.data ?? [];
  const agents = agentsData.data ?? [];
  const reviews: ReviewItem[] = reviewsData.data ?? [];

  const pendingReviews = reviews.filter((r) => r.status === "pending");
  const resolvedReviews = reviews.filter((r) => r.status !== "pending");

  // Merge duplicate review cards per agent (e.g. 4 cards for same agent merged into 1 card)
  const mergedPendingReviews: MergedReviewItem[] = useMemo(() => {
    const map = new Map<string, { primary: ReviewItem; review_ids: string[]; reasons: string[] }>();
    for (const item of pendingReviews) {
      if (!map.has(item.agent_id)) {
        map.set(item.agent_id, {
          primary: { ...item },
          review_ids: [item.review_id],
          reasons: item.explanation ? [item.explanation] : [],
        });
      } else {
        const cur = map.get(item.agent_id)!;
        cur.review_ids.push(item.review_id);
        if (item.explanation && !cur.reasons.includes(item.explanation)) {
          cur.reasons.push(item.explanation);
        }
      }
    }
    return Array.from(map.values()).map(({ primary, review_ids, reasons }) => ({
      ...primary,
      review_ids,
      explanation: reasons.length > 0 ? reasons.join(" · ") : primary.explanation,
    }));
  }, [pendingReviews]);

  const [selectedId, setSelectedId] = useState<string | null>(initialAlertId ?? null);
  const [activeTab, setActiveTab] = useState<"summary" | "evidence">("summary");
  const [drawerEvent, setDrawerEvent] = useState<NormalizedEvent | null>(null);
  const [drawerMissingId, setDrawerMissingId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedAgentId, setCopiedAgentId] = useState(false);
  const [scoringExpanded, setScoringExpanded] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Auto-select highest severity alert on load
  useEffect(() => {
    if (alerts.length > 0) {
      if (initialAlertId && alerts.some((a) => a.alert_id === initialAlertId)) {
        setSelectedId(initialAlertId);
      } else if (!selectedId || !alerts.some((a) => a.alert_id === selectedId)) {
        const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
        const sorted = [...alerts].sort((a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0));
        setSelectedId(sorted[0].alert_id);
      }
    } else {
      setSelectedId(null);
    }
  }, [alerts, initialAlertId, selectedId]);

  const currentAlert = alerts.find((a) => a.alert_id === selectedId) ?? alerts[0];
  const currentAssessment = assessments.find((ass) => ass.agent_id === currentAlert?.agent_ids[0]);

  const handleChipClick = (eventId: string) => {
    const evt = normalizedEvents.find((e) => e.event_id === eventId);
    if (evt) {
      setDrawerEvent(evt);
      setDrawerMissingId(null);
    } else {
      setDrawerEvent(null);
      setDrawerMissingId(eventId);
    }
    setDrawerOpen(true);
  };

  const copyEventJson = () => {
    if (drawerEvent) {
      navigator.clipboard.writeText(JSON.stringify(drawerEvent, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyDrawerAgentId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedAgentId(true);
    setTimeout(() => setCopiedAgentId(false), 2000);
  };

  const handleDecide = async (reviewId: string, decision: "release" | "confirm", note?: string, reviewer?: string) => {
    setDecidingId(reviewId);
    setActionError(null);
    try {
      const match = mergedPendingReviews.find(
        (m: MergedReviewItem) => m.review_id === reviewId || (m.review_ids && m.review_ids.includes(reviewId))
      );
      const ids = match?.review_ids?.length ? match.review_ids : [reviewId];
      for (const id of ids) {
        await api.decideReview(id, decision, note, reviewer);
      }
      setReviewTick((t) => t + 1);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setDecidingId(null);
    }
  };

  // Check if an alert is an unverified SG-030 claim (lost telemetry)
  const isUnverifiedClaim = (a: Alert) => {
    return (
      a.rule_id === "SG-030" &&
      (a.severity === "low" ||
        a.rule_name?.toLowerCase().includes("unverified") ||
        a.reason?.toLowerCase().includes("unverified") ||
        a.reason?.toLowerCase().includes("lost events"))
    );
  };

  // Render individual alert button
  const renderAlertButton = (a: Alert) => {
    const isSelected = a.alert_id === currentAlert?.alert_id;
    const shortTitle = deriveIncidentTitle(a, agents, normalizedEvents);
    const unverified = isUnverifiedClaim(a);
    const relatedReview = reviews.find((r) => a.agent_ids?.includes(r.agent_id));

    return (
      <button
        key={a.alert_id}
        onClick={() => {
          setSelectedId(a.alert_id);
          window.location.hash = `#/incidents/${a.alert_id}`;
        }}
        type="button"
        className={`w-full rounded-[var(--r-card)] card p-4 text-left transition-all ${
          unverified
            ? "border-stone-300 bg-stone-500/5 hover:border-stone-400"
            : isSelected
            ? "!border-[var(--accent)] ring-1 ring-[var(--accent)] shadow-[var(--shadow-1)]"
            : "hover:border-[var(--text-3)]"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {unverified ? (
              <span className="rounded-full bg-stone-500/10 px-2 py-0.5 text-[11px] font-medium text-stone-600 border border-stone-300">
                Can't check
              </span>
            ) : (
              <Pill value={a.severity} />
            )}
            <span className="font-mono text-[12px] text-[var(--text-3)]">{a.rule_id}</span>
          </div>
          <span className="text-[12px] text-[var(--text-3)]">{time(a.created_at)}</span>
        </div>

        <div className="mt-2 text-[15px] font-semibold text-[var(--text)] line-clamp-2">
          {shortTitle}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[14px] text-[var(--text-2)]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-[var(--text-3)]">Roles:</span>
            {a.agent_ids.map((id) => (
              <AgentRoleBadge
                key={id}
                agentId={id}
                role={getAgentRole(id, agents, normalizedEvents)}
              />
            ))}
          </div>
          {relatedReview && relatedReview.status !== "pending" && (
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                relatedReview.status === "released"
                  ? "bg-emerald-500/10 text-[#1F7A45]"
                  : "bg-rose-500/10 text-rose-700"
              }`}
            >
              {relatedReview.status === "released" ? "Released" : "Kept contained"}
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Incidents."
        subtitle="Investigate security incidents, inspect evidence, and decide whether to release or keep agents contained."
        actions={
          <div className="flex items-center gap-3">
            <Segmented
              value={mainView}
              onChange={(v) => {
                setMainView(v);
                if (v === "all") window.location.hash = "#/incidents/all";
                else window.location.hash = "#/incidents";
              }}
              options={[
                { value: "needs_decision", label: `Needs decision (${pendingReviews.length})` },
                { value: "all", label: "All incidents" },
              ]}
            />
          </div>
        }
      />

      {actionError && (
        <div className="rounded-xl bg-rose-500/10 p-4 text-[14px] text-rose-700 border border-rose-500/20">
          {actionError}
        </div>
      )}

      {/* TAB 1: Needs decision (Default Tab) */}
      {mainView === "needs_decision" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-[14px] leading-relaxed text-[var(--text-2)]">
              Every agent that was stopped by a safety trigger or policy rule waits here for your decision.
              <strong> Release</strong> allows the agent to resume immediately; <strong>Keep contained</strong> keeps it paused.
            </p>
            <Segmented
              size="sm"
              value={decisionFilter}
              onChange={setDecisionFilter}
              options={[
                { value: "pending", label: `Needs decision (${pendingReviews.length})` },
                { value: "resolved", label: `Resolved (${resolvedReviews.length})` },
              ]}
            />
          </div>

          {decisionFilter === "pending" ? (
            mergedPendingReviews.length > 0 ? (
              <div className="space-y-4">
                {mergedPendingReviews.map((item: MergedReviewItem) => (
                  <DecisionCard
                    key={item.review_id}
                    item={item}
                    agents={agents}
                    alerts={alerts}
                    onDecide={handleDecide}
                    busy={decidingId === item.review_id}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-[var(--r-card)] card p-10 text-center shadow-[var(--shadow-1)] border border-[var(--hairline)]">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-[#1F7A45] mb-3">
                  <Check size={24} />
                </div>
                <h3 className="text-[17px] font-semibold text-[var(--text)]">All agents operating safely</h3>
                <p className="mt-1 text-[14px] text-[var(--text-2)] max-w-md mx-auto">
                  No agents are currently stopped or awaiting human review. The swarm is running within normal parameters.
                </p>
              </div>
            )
          ) : (
            resolvedReviews.length > 0 ? (
              <div className="space-y-4">
                {resolvedReviews.map((item) => (
                  <DecisionCard
                    key={item.review_id}
                    item={item}
                    agents={agents}
                    alerts={alerts}
                    onDecide={handleDecide}
                    busy={decidingId === item.review_id}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <Empty>No resolved decisions yet.</Empty>
              </Card>
            )
          )}
        </div>
      )}

      {/* TAB 2: All incidents (Read-only forensics) */}
      {mainView === "all" && (
        <>
          {!alerts.length && (
            <Card>
              <Empty>
                {selectedRunId
                  ? `No incidents detected in run ${selectedRunId}. Swarm operated within normal parameters.`
                  : "No scenario run is selected. Choose a run from the selector above or run a scenario."}
              </Empty>
            </Card>
          )}

          {alerts.length > 0 && currentAlert && (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[380px_1fr]">
              {/* Left Column: 380px Alert List */}
              <div className="space-y-3">
                <div className="text-[14px] font-semibold text-[var(--text-2)] uppercase tracking-wider px-1">
                  {alerts.length} Incident{alerts.length === 1 ? "" : "s"} Recorded
                </div>

                                <div className="space-y-4 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
                  {/* High Risk Group */}
                  {alerts.filter(a => a.severity === "critical" || a.severity === "high").length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[12px] font-bold text-rose-700 uppercase tracking-wider px-1 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-rose-600" />
                        <span>High Risk ({alerts.filter(a => a.severity === "critical" || a.severity === "high").length})</span>
                      </div>
                      {alerts.filter(a => a.severity === "critical" || a.severity === "high").map(renderAlertButton)}
                    </div>
                  )}

                  {/* Low Risk / Monitored Group */}
                  {alerts.filter(a => a.severity !== "critical" && a.severity !== "high").length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[12px] font-semibold text-[var(--text-3)] uppercase tracking-wider px-1 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        <span>Low Risk / Monitored ({alerts.filter(a => a.severity !== "critical" && a.severity !== "high").length})</span>
                      </div>
                      {alerts.filter(a => a.severity !== "critical" && a.severity !== "high").map(renderAlertButton)}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Incident Detail */}
              <div className="rounded-[var(--r-tile)] card p-8 shadow-[var(--shadow-1)]">
                {/* Header with Title and Score Ring */}
                <div className="flex flex-wrap items-start justify-between gap-6 border-b border-[var(--hairline-subtle)] pb-6">
                  <div className="min-w-0 max-w-xl">
                    <div className="flex items-center gap-2.5">
                      {isUnverifiedClaim(currentAlert) ? (
                        <span className="rounded-full bg-stone-500/10 px-2.5 py-0.5 text-[12px] font-medium text-stone-700 border border-stone-300">
                          Can&apos;t check: monitor lost events
                        </span>
                      ) : (
                        <Pill value={currentAlert.severity} />
                      )}
                      <span className="font-mono text-[14px] text-[var(--text-3)]">{currentAlert.rule_id}</span>
                      <span className="text-[14px] text-[var(--text-2)]">&middot; Detected {time(currentAlert.created_at)}</span>
                    </div>
                    <h2 className="mt-3 text-[26px] sm:text-[30px] font-semibold leading-tight tracking-tight text-[var(--text)]">
                      {deriveIncidentTitle(currentAlert, agents, normalizedEvents)}
                    </h2>
                    <div className="mt-3 text-[14px] text-[var(--text-2)] flex flex-wrap items-center gap-2">
                      <span>Rule: <strong className="text-[var(--text)]">{currentAlert.rule_name}</strong></span>
                      <span>&middot;</span>
                      <span>Target: <code className="font-mono text-[13px] text-[var(--text)]">{currentAlert.resource}</code></span>
                      <span>&middot;</span>
                      <span>Roles:</span>
                      {currentAlert.agent_ids.map((id) => (
                        <AgentRoleBadge
                          key={id}
                          agentId={id}
                          role={getAgentRole(id, agents, normalizedEvents)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* ScoreRing */}
                  <div className="flex flex-col items-center">
                    <ScoreRing
                      score={currentAssessment?.risk ?? (currentAlert.severity === "critical" ? 0.95 : currentAlert.severity === "high" ? 0.82 : 0.6)}
                      severity={isUnverifiedClaim(currentAlert) ? "low" : currentAlert.severity}
                      label="Alert confidence"
                    />
                    <span className="mt-2 text-[12px] font-medium text-[var(--text-3)] uppercase tracking-wider">
                      Confidence
                    </span>
                  </div>
                </div>

                {/* Direct Security Action Controls */}
                {currentAlert && (
                  <div className="mt-6 rounded-xl border border-[var(--hairline)] bg-[var(--card-alt)] p-4 shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] block mb-1">
                          Direct Security Control
                        </span>
                        <div className="text-[13px] text-[var(--text)]">
                          {pendingReviews.some(r => currentAlert.agent_ids.includes(r.agent_id)) ? (
                            <span className="text-rose-700 font-semibold flex items-center gap-1.5">
                              <ShieldAlert size={14} />
                              <span>Agent is stopped and awaiting review</span>
                            </span>
                          ) : (
                            <span className="text-[var(--text-2)]">
                              Immediate intervention controls for agents in this incident
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {pendingReviews.filter(r => currentAlert.agent_ids.includes(r.agent_id)).length > 0 ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                const rev = pendingReviews.find(r => currentAlert.agent_ids.includes(r.agent_id));
                                if (rev) handleDecide(rev.review_id, "release");
                              }}
                              disabled={decidingId !== null}
                              className="h-8.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 text-[13px] shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <Check size={13} />
                              <span>Resume / Release</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const rev = pendingReviews.find(r => currentAlert.agent_ids.includes(r.agent_id));
                                if (rev) handleDecide(rev.review_id, "confirm");
                              }}
                              disabled={decidingId !== null}
                              className="h-8.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-medium px-4 text-[13px] shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <ShieldAlert size={13} />
                              <span>Keep Contained (Block)</span>
                            </button>
                          </>
                        ) : (
                          currentAlert.agent_ids.length > 0 && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (!selectedRunId) return;
                                try {
                                  await api.operateAgent(selectedRunId, currentAlert.agent_ids[0], "pause", "Manually stopped from incident forensic view");
                                  setReviewTick(t => t + 1);
                                } catch (e) {
                                  setActionError((e as Error).message);
                                }
                              }}
                              className="h-8.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-medium px-4 text-[13px] shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                              <ShieldAlert size={13} />
                              <span>Block Agent</span>
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Sub-tabs: Summary · Evidence */}
                <div className="mt-6 flex border-b border-[var(--hairline-subtle)]">
                  <div className="flex gap-6">
                    <button
                      type="button"
                      onClick={() => setActiveTab("summary")}
                      className={`pb-3 text-[14px] font-medium transition-colors relative ${
                        activeTab === "summary" ? "text-[var(--text)]" : "text-[var(--text-2)] hover:text-[var(--text)]"
                      }`}
                    >
                      Summary
                      {activeTab === "summary" && (
                        <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-[var(--accent)]" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("evidence")}
                      className={`pb-3 text-[14px] font-medium transition-colors relative ${
                        activeTab === "evidence" ? "text-[var(--text)]" : "text-[var(--text-2)] hover:text-[var(--text)]"
                      }`}
                    >
                      Evidence ({currentAlert.event_ids.length})
                      {activeTab === "evidence" && (
                        <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-[var(--accent)]" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Tab 1: Summary */}
                {activeTab === "summary" && (
                  <div className="mt-6 space-y-6">
                    <div>
                      <h3 className="text-[16px] font-semibold text-[var(--text)]">What happened</h3>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {currentAlert.event_ids.map((id, idx) => {
                          const matched = normalizedEvents.find((e) => e.event_id === id);
                          return (
                            <div key={id} className="flex items-center gap-2">
                              <EvidenceChip
                                eventId={id}
                                action={matched?.action}
                                onClick={handleChipClick}
                                className="incident-evidence-chip"
                              />
                              {idx < currentAlert.event_ids.length - 1 && (
                                <span className="text-[var(--text-3)]" aria-hidden>&rarr;</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 text-[14px] text-[var(--text-3)]">
                        Click any event chip to inspect its raw JSON payload in the side drawer.
                      </div>
                    </div>

                    <div className="border-t border-[var(--hairline-subtle)] pt-4">
                      <h3 className="text-[16px] font-semibold text-[var(--text)]">Why it was flagged</h3>
                      <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-2)]">
                        {currentAlert.reason}. This behavior violated safe operational boundaries.
                      </p>

                      {/* Collapsible Bayesian Explanation */}
                      {currentAssessment && (
                        <div className="mt-4 rounded-xl card-subtle p-4">
                          <button
                            onClick={() => setScoringExpanded((x) => !x)}
                            type="button"
                            className="flex w-full items-center justify-between text-[14px] font-medium text-[var(--text)]"
                          >
                            <span>Why it was flagged: how this score was calculated</span>
                            {scoringExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>

                          {scoringExpanded && (
                            <div className="mt-3 space-y-3 border-t border-[var(--hairline-subtle)] pt-3 text-[14px]">
                              <div>
                                <span className="text-[var(--text-3)]">Risk progression:</span>{" "}
                                <strong>{(currentAssessment.prior * 100).toFixed(0)}% base prior</strong> &rarr;{" "}
                                <strong className="text-[var(--crit)]">{(currentAssessment.risk * 100).toFixed(0)}% risk</strong>.
                              </div>

                              {currentAssessment.evidence.length > 0 && (
                                <div>
                                  <div className="font-medium text-[var(--text)]">Contributing factors:</div>
                                  <ul className="mt-1 list-disc pl-5 text-[var(--text-2)] space-y-0.5">
                                    {currentAssessment.evidence.map((ev, i) => (
                                      <li key={i}>{ev}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {currentAssessment.best_explanation && (
                                <div>
                                  <div className="font-medium text-[var(--text)]">Most likely explanation:</div>
                                  <div className="mt-1 rounded-md card p-3 text-[var(--text-2)] text-[14px] leading-relaxed">
                                    {currentAssessment.best_explanation}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab 2: Evidence */}
                {activeTab === "evidence" && (
                  <div className="mt-6 space-y-4">
                    <div className="text-[14px] text-[var(--text-2)]">
                      The security monitor verified the following ordered events as direct evidence for this incident:
                    </div>

                    <div className="divide-y divide-[var(--hairline-subtle)] rounded-xl card overflow-hidden">
                      {currentAlert.event_ids.map((id, idx) => {
                        const evt = normalizedEvents.find((e) => e.event_id === id);
                        const role = evt ? (evt.agent_role || getAgentRole(evt.agent_id, agents, normalizedEvents)) : "unknown";
                        return (
                          <div
                            key={id}
                            onClick={() => handleChipClick(id)}
                            className="flex cursor-pointer items-center justify-between p-4 transition-colors hover:bg-[var(--card-alt)] incident-evidence-row"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--card-alt)] font-mono text-[12px] text-[var(--text-2)]">
                                {idx + 1}
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[14px] font-semibold text-[var(--accent)]">
                                    {id}
                                  </span>
                                  <span className="rounded-md card px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-2)] capitalize">
                                    {role}
                                  </span>
                                </div>
                                <div className="text-[14px] text-[var(--text-2)]">
                                  {evt ? `${evt.event_type} &middot; action: ${evt.action}` : "Raw event"}
                                </div>
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="font-mono text-[12px] text-[var(--text-3)]">
                                {evt?.timestamp ? time(evt.timestamp) : "—"}
                              </div>
                              <span className="text-[12px] font-medium text-[var(--accent)]">
                                Inspect JSON &rarr;
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Side Drawer for Raw Event Details */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerEvent ? `Event: ${drawerEvent.event_id}` : `Event Not Found: ${drawerMissingId}`}
        subtitle={
          drawerEvent
            ? `${drawerEvent.agent_id} (${drawerEvent.agent_role || getAgentRole(drawerEvent.agent_id, agents, normalizedEvents)}) &middot; ${drawerEvent.action} &middot; ${drawerEvent.timestamp ? time(drawerEvent.timestamp) : ""}`
            : "Event dropped in transit or withheld by provider."
        }
      >
        {drawerEvent ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-medium text-[var(--text)]">Raw Event Payload</span>
              <button
                type="button"
                onClick={copyEventJson}
                className="inline-flex items-center gap-1.5 rounded-md card px-3 py-1 text-[13px] font-medium text-[var(--text)] transition-colors hover:border-[var(--accent)]"
              >
                {copied ? <Check size={14} className="text-[#1F7A45]" /> : <Copy size={14} />}
                <span>{copied ? "Copied" : "Copy JSON"}</span>
              </button>
            </div>

            <div className="rounded-xl card-subtle p-4 font-mono text-[12px] leading-relaxed text-[var(--text)] overflow-x-auto max-h-[60vh] no-scrollbar">
              <pre>{JSON.stringify(drawerEvent, null, 2)}</pre>
            </div>

            <div className="space-y-3 border-t border-[var(--hairline-subtle)] pt-4 text-[14px]">
              <div className="flex justify-between">
                <span className="text-[var(--text-3)]">Source Agent ID:</span>
                <span className="font-mono text-[var(--text)] flex items-center gap-1.5">
                  {drawerEvent.agent_id}
                  <button
                    type="button"
                    onClick={() => copyDrawerAgentId(drawerEvent.agent_id)}
                    className="cursor-pointer text-[var(--text-3)] hover:text-[var(--accent)]"
                  >
                    {copiedAgentId ? <Check size={12} className="text-[#1F7A45]" /> : <Copy size={12} />}
                  </button>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-3)]">Event Type:</span>
                <span className="font-mono text-[var(--text)]">{drawerEvent.event_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-3)]">Status:</span>
                <span className="font-mono text-[var(--text)]">{drawerEvent.status}</span>
              </div>
              {drawerEvent.resource && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-3)]">Resource:</span>
                  <span className="font-mono text-[var(--text)]">{drawerEvent.resource}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-[14px] text-[var(--text-2)]">
            <p>
              This event (<code className="font-mono text-[var(--text)]">{drawerMissingId}</code>) was correlated through indirect handoffs or broker telemetry, but its full record was not found in the primary log.
            </p>
          </div>
        )}
      </Drawer>

      <Footnotes
        symbols={["†", "‡"]}
      />
    </div>
  );
}
