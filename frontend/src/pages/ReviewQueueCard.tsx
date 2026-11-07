import { useEffect, useState } from "react";
import { api } from "../api";
import { Card, Segmented } from "../components/ui";
import { DecisionCard } from "../components/DecisionCard";
import { useLiveStream } from "../lib/live";
import { useRunData, useAppState } from "../state";
import type { ReviewItem } from "../types";
import { Check } from "lucide-react";

/**
 * Human review of live containment: release or keep contained each paused agent,
 * outbound hold, and quarantined message.
 * Powered by DecisionCard.
 */
export function ReviewQueueCard() {
  const [filter, setFilter] = useState<"pending" | "resolved">("pending");
  const [tick, setTick] = useState(0);
  const { selectedRunId } = useAppState();
  const reviewsData = useRunData(() => api.reviews(), "reviews", [filter, tick]);
  const agentsData = useRunData(api.agents, selectedRunId);
  const alertsData = useRunData(api.alerts, selectedRunId);
  const live = useLiveStream(undefined, 50);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New containment anywhere: refresh the queue without a page reload.
  const reviewMsgs = live.messages.filter((m) => m.type === "review");
  const lastReview = reviewMsgs[reviewMsgs.length - 1]?.seq;
  useEffect(() => {
    if (lastReview) setTick((t) => t + 1);
  }, [lastReview]);

  async function handleDecide(reviewId: string, decision: "release" | "confirm", note?: string, reviewer?: string) {
    setBusy(reviewId);
    setError(null);
    try {
      await api.decideReview(reviewId, decision, note, reviewer);
      setTick((t) => t + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const allItems: ReviewItem[] = reviewsData.data ?? [];
  const pendingItems = allItems.filter((i) => i.status === "pending");
  const resolvedItems = allItems.filter((i) => i.status !== "pending");
  const displayedItems = filter === "pending" ? pendingItems : resolvedItems;

  return (
    <Card title={`Needs decision${filter === "pending" ? ` (${pendingItems.length})` : ""}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[14px] leading-relaxed text-[var(--text-2)]">
          Every agent stopped by a safety trigger or policy rule waits here for your decision.
          <strong> Release</strong> lets an agent continue at once; <strong>Keep contained</strong> keeps it paused.
        </p>
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "pending", label: `Needs decision (${pendingItems.length})` },
            { value: "resolved", label: `Resolved (${resolvedItems.length})` },
          ]}
        />
      </div>
      {error && <p className="mb-3 text-[14px] text-rose-600">{error}</p>}
      {displayedItems.length > 0 ? (
        <div className="space-y-3">
          {displayedItems.map((item) => (
            <DecisionCard
              key={item.review_id}
              item={item}
              agents={agentsData.data ?? []}
              alerts={alertsData.data ?? []}
              onDecide={handleDecide}
              busy={busy === item.review_id}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl card p-8 text-center border border-[var(--hairline)]">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-[#1F7A45] mb-2">
            <Check size={20} />
          </div>
          <h4 className="text-[15px] font-semibold text-[var(--text)]">
            {filter === "pending" ? "All agents operating safely" : "No resolved decisions"}
          </h4>
          <p className="mt-1 text-[13px] text-[var(--text-2)]">
            {filter === "pending"
              ? "No agents are currently stopped. Everything is running within normal limits."
              : "No containment actions have been decided yet."}
          </p>
        </div>
      )}
    </Card>
  );
}
