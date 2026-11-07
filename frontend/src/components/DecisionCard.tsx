import { useState } from "react";
import { ChevronDown, ChevronUp, ShieldAlert, Check } from "lucide-react";
import type { ReviewItem, Alert, Agent } from "../types";
import { shortId } from "../lib/format";

export interface DecisionCardProps {
  item: ReviewItem;
  agents?: Agent[];
  alerts?: Alert[];
  onDecide: (reviewId: string, decision: "release" | "confirm", note?: string, reviewer?: string) => Promise<void>;
  busy?: boolean;
}

/**
 * Plain-language Trigger Mapper
 * Strict compliance: Zero technical jargon on primary cards
 */
function mapTriggerLabel(trigger?: string | null): string {
  if (!trigger) return "Safety policy";
  const lower = trigger.toLowerCase();
  if (lower.includes("pre_execution") || lower.includes("policy_check")) {
    return "Stopped before it ran";
  }
  if (lower.includes("circuit_breaker") || lower.includes("tripwire")) {
    return "Safety trigger";
  }
  return "Safety policy";
}

/**
 * Plain-language Action/Kind Mapper
 */
function mapKindLabel(kind: ReviewItem["kind"]): string {
  switch (kind) {
    case "paused_agent":
      return "Agent stopped";
    case "held_egress":
      return "Secret data send held";
    case "quarantined_input":
      return "Suspicious message held";
    default:
      return "Agent stopped";
  }
}

/**
 * Plain-language Summary Generator
 */
function getPlainSummary(item: ReviewItem): string {
  if (item.explanation) {
    // Simplify common explanations if they contain technical jargon
    return item.explanation
      .replace(/pre-execution policy check refused/gi, "Action stopped before it could run")
      .replace(/egress proxy held/gi, "Outgoing data send stopped")
      .replace(/circuit breaker tripped/gi, "Safety trigger halted agent to prevent spread")
      .replace(/restricted destination/gi, "unapproved destination");
  }
  if (item.kind === "quarantined_input") {
    return `Received a message claiming to be from ${item.claimed_sender || "another agent"}, but its origin could not be verified.`;
  }
  if (item.kind === "held_egress") {
    return "Attempted to send data outside the approved network destination.";
  }
  return "Agent was stopped because its recent actions exceeded safe operational limits.";
}

export function DecisionCard({ item, agents = [], alerts = [], onDecide, busy = false }: DecisionCardProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [note, setNote] = useState("");
  const [reviewer, setReviewer] = useState(() => {
    try {
      return localStorage.getItem("swarmguard.reviewer") ?? "";
    } catch {
      return "";
    }
  });

  const saveReviewer = (v: string) => {
    setReviewer(v);
    try {
      localStorage.setItem("swarmguard.reviewer", v);
    } catch {
      // In private browsing mode
    }
  };

  const agent = agents.find((a) => a.agent_id === item.agent_id);
  const matchingAlert = alerts.find(
    (a) => a.agent_ids?.includes(item.agent_id)
  );

  const plainTrigger = mapTriggerLabel(item.trigger);
  const plainKind = mapKindLabel(item.kind);
  const plainSummary = getPlainSummary(item);

  const isPending = item.status === "pending";
  const isReleased = item.status === "released";
  const isConfirmed = item.status === "confirmed";

  return (
    <div className="rounded-[var(--r-card)] card p-5 shadow-[var(--shadow-1)] border border-[var(--hairline)] transition-all">
      {/* Top Header: Agent, Role & Trigger */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[15px] text-[var(--text)]">
            {item.agent_id}
          </span>
          <span className="text-[13px] text-[var(--text-2)] font-medium">
            &middot; {item.role || agent?.role || "Agent"}
          </span>
          <span className="rounded-full bg-[var(--low-bg)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-2)]">
            {plainKind}
          </span>
          <span className="rounded-full bg-[var(--hairline-subtle)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-3)]">
            {plainTrigger}
          </span>
          {isPending && item.escalated_at && (
            <span className="rounded-full bg-[var(--crit-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--crit)] animate-pulse">
              Needs immediate decision
            </span>
          )}
        </div>

        {/* Status Outcome Badges */}
        <div>
          {isReleased && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-[12px] font-semibold text-[#1F7A45] border border-emerald-500/20">
              <Check size={13} />
              Released by {item.decided_by || "operator"}
            </span>
          )}
          {isConfirmed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-3 py-1 text-[12px] font-semibold text-rose-700 border border-rose-500/20">
              <ShieldAlert size={13} />
              Kept contained by {item.decided_by || "operator"}
            </span>
          )}
        </div>
      </div>

      {/* Plain English Reason Statement */}
      <p className="mt-3 text-[14px] leading-relaxed text-[var(--text)] font-normal">
        {plainSummary}
      </p>

      {/* Expandable Evidence Dropdown (Technical details ONLY live here) */}
      <div className="mt-4 border-t border-[var(--hairline-subtle)] pt-3">
        <button
          type="button"
          onClick={() => setShowEvidence(!showEvidence)}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent)] hover:underline"
        >
          {showEvidence ? (
            <>
              Hide evidence <ChevronUp size={14} />
            </>
          ) : (
            <>
              Show evidence details <ChevronDown size={14} />
            </>
          )}
        </button>

        {showEvidence && (
          <div className="mt-3 space-y-3 rounded-xl bg-[var(--bg-alt)] p-4 text-[13px] border border-[var(--hairline-subtle)]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
              <div>
                <span className="text-[var(--text-3)] block">Technical Trigger:</span>
                <span className="font-mono text-[var(--text)]">{item.trigger || "system_guard"}</span>
              </div>
              <div>
                <span className="text-[var(--text-3)] block">Rule ID & Severity:</span>
                <span className="font-mono text-[var(--text)] font-semibold">
                  {matchingAlert?.rule_id || "SG-030"} &middot; {matchingAlert?.severity || "High"}
                </span>
              </div>
              <div>
                <span className="text-[var(--text-3)] block">Run ID:</span>
                <span className="font-mono text-[var(--text-2)]">{item.run_id}</span>
              </div>
              <div>
                <span className="text-[var(--text-3)] block">Target / Resource:</span>
                <span className="font-mono text-[var(--text-2)]">{item.resource || item.claimed_sender || "Internal channel"}</span>
              </div>
            </div>

            {/* Why it was flagged (Bayesian risk breakdown) */}
            <div className="border-t border-[var(--hairline-subtle)] pt-2.5 mt-2">
              <span className="text-[12px] font-semibold text-[var(--text)] block mb-1">
                Why it was flagged
              </span>
              <p className="text-[12px] text-[var(--text-2)] leading-relaxed">
                {item.explanation || "Behavioral deviation from baseline safety model with high confidence threshold."}
              </p>
              {item.risk !== null && item.risk !== undefined && (
                <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--text-3)]">
                  <span>Calculated posterior risk score:</span>
                  <span className="font-mono font-semibold text-[var(--crit)]">
                    {Math.round(item.risk * 100)}%
                  </span>
                </div>
              )}
            </div>

            {matchingAlert?.event_ids && matchingAlert.event_ids.length > 0 && (
              <div className="border-t border-[var(--hairline-subtle)] pt-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] block mb-1">
                  Supporting Event IDs ({matchingAlert.event_ids.length})
                </span>
                <div className="flex flex-wrap gap-1">
                  {matchingAlert.event_ids.map((eid) => (
                    <span key={eid} className="font-mono text-[11px] bg-[var(--card)] px-1.5 py-0.5 rounded border border-[var(--hairline)]">
                      {shortId(eid)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Operator Action Bar: Strictly Release & Keep contained */}
      {isPending && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hairline-subtle)] pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Your name / ID"
              aria-label="Operator reviewer name"
              value={reviewer}
              onChange={(e) => saveReviewer(e.target.value)}
              className="h-8 w-32 rounded-lg border border-[var(--hairline)] bg-[var(--card)] px-2.5 text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
            />
            <input
              type="text"
              placeholder="Decision note (optional)"
              aria-label="Decision note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-8 w-56 sm:w-64 rounded-lg border border-[var(--hairline)] bg-[var(--card)] px-2.5 text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide(item.review_id, "release", note, reviewer || undefined)}
              className="h-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 text-[13px] shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check size={14} />
              Release
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide(item.review_id, "confirm", note, reviewer || undefined)}
              className="h-8 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-medium px-4 text-[13px] shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <ShieldAlert size={14} />
              Keep contained
            </button>
          </div>
        </div>
      )}

      {/* Note and Decided details if already resolved */}
      {!isPending && (item.note || item.decided_at) && (
        <div className="mt-3 text-[12px] text-[var(--text-3)] flex flex-wrap gap-x-3 gap-y-1">
          {item.note && <span>Note: &ldquo;{item.note}&rdquo;</span>}
          {item.decided_at && <span>Decided on: {new Date(item.decided_at).toLocaleTimeString()}</span>}
        </div>
      )}
    </div>
  );
}
