import { Lock, ShieldCheck } from "lucide-react";
import type { ResponseDecision, ResponsePolicyMode } from "../types";

export interface ModePillProps {
  mode: ResponsePolicyMode | string;
  decision?: ResponseDecision | string;
  outcome?: string;
  className?: string;
}

export function ModePill({ mode, decision, outcome, className = "" }: ModePillProps) {
  // The live guard paused / held the agent: contained, not jargon
  if (outcome === "contained") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-[var(--ok-bg)] px-3 py-1 text-[14px] font-medium text-[var(--ok)] border border-[var(--ok)]/30 ${className}`}
      >
        <ShieldCheck size={12} strokeWidth={2} />
        <span>{decision === "block" ? "Stopped before it ran" : "Agent paused"}</span>
      </span>
    );
  }

  // STRICT RULE: "Stopped before it ran" ONLY when mode === "enforced"
  const isEnforced = mode === "enforced";

  if (isEnforced) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-[var(--ok-bg)] px-3 py-1 text-[14px] font-medium text-[var(--ok)] border border-[var(--ok)]/30 ${className}`}
      >
        <Lock size={12} strokeWidth={2} />
        <span>Stopped before it ran</span>
      </span>
    );
  }

  // Simulation / Policy config mode
  let label = "Alert only";
  if (decision === "block" || decision === "would_block") {
    label = "Would deny (replay)";
  } else if (decision === "pause" || decision === "would_pause") {
    label = "Would pause (replay)";
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--hairline)] bg-transparent px-3 py-1 text-[14px] font-medium text-[var(--text-2)] ${className}`}
    >
      <span>{label}</span>
    </span>
  );
}
