import { useAppState } from "../state";
import { CustomSelect } from "./CustomSelect";
import { ThemeToggle } from "./ThemeToggle";

export interface NavItem {
  id: string;
  path: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", path: "#/", label: "Overview" },
  { id: "live", path: "#/swarm", label: "Swarm" },
  { id: "incidents", path: "#/incidents", label: "Incidents" },
  { id: "responses", path: "#/responses", label: "Responses" },
  { id: "evaluation", path: "#/evaluation", label: "Evaluation" },
  { id: "pipeline", path: "#/pipeline/simulator", label: "Pipeline" },
];

export function GlobalNav({ currentRoute }: { currentRoute: string }) {
  const { runs, selectedRunId, selectRun, health } = useAppState();

  const isCurrent = (id: string) => {
    if (id === "dashboard" || id === "overview") return currentRoute === "" || currentRoute === "dashboard" || currentRoute === "overview" || currentRoute === "/";
    if (id === "live") return currentRoute.startsWith("live") || currentRoute.startsWith("swarm");
    if (id === "incidents") return currentRoute.startsWith("incidents");
    if (id === "responses") return currentRoute.startsWith("responses");
    if (id === "evaluation") return currentRoute.startsWith("evaluation");
    if (id === "pipeline") return currentRoute.startsWith("pipeline") || currentRoute.startsWith("simulator") || currentRoute.startsWith("collector") || currentRoute.startsWith("detection");
    return currentRoute.startsWith(id);
  };

  return (
    <header className="sticky top-0 z-40 min-h-12 w-full border-b border-[var(--hairline)]/60 bg-[var(--glass)] backdrop-blur-xl">
      <div className="mx-auto grid min-h-12 max-w-[1280px] grid-cols-[1fr_auto] grid-rows-[48px_40px] items-center px-4 sm:px-6 md:h-12 md:grid-cols-[1fr_auto_1fr] md:grid-rows-1">
        {/* Left Wordmark */}
        <div className="flex items-center justify-start min-w-0">
          <a href="#/" className="shrink-0 flex items-center gap-2 text-[15px] font-semibold tracking-tight text-[var(--text)]">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--text)] text-[var(--bg)]">
              <svg width="13" height="15" viewBox="0 0 16 18" fill="none" aria-hidden>
                <path d="M8 1.2l6 2.3v4.8c0 4-2.6 7.2-6 8.5-3.4-1.3-6-4.5-6-8.5V3.5l6-2.3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M5.3 9l1.9 1.9 3.6-3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span>SwarmGuard</span>
          </a>
        </div>

        {/* Center Nav Links - Truly Centralized */}
        <nav className="col-span-2 row-start-2 flex min-w-0 items-center justify-start gap-5 overflow-x-auto no-scrollbar px-1 md:col-span-1 md:row-start-auto md:justify-center md:gap-4 md:px-2 lg:gap-7" aria-label="Main Navigation">
          {NAV_ITEMS.map((item) => {
            const active = isCurrent(item.id);
            return (
              <a
                key={item.id}
                href={item.path}
                aria-current={active ? "page" : undefined}
                className={`relative py-3 text-[14px] transition-colors whitespace-nowrap ${
                  active
                    ? "font-medium text-[var(--text)]"
                    : "text-[var(--text-2)] hover:text-[var(--text)]"
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-[var(--accent)]" />
                )}
              </a>
            );
          })}
        </nav>

        {/* Right Controls: Run Selector & Health Indicator */}
        <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3 md:col-start-3">
          <ThemeToggle />
          {runs.length > 0 && (
            <div className="w-[150px] sm:w-[200px] lg:w-[240px] max-[420px]:hidden">
              <CustomSelect
                value={selectedRunId ?? ""}
                onChange={(val) => selectRun(val || null)}
                options={runs.map((r) => ({
                  value: r.run_id,
                  label: `${r.run_id} (${r.scenario_id.replace(/_/g, " ")})`,
                  description: `${r.agent_count} agents · ${r.stages?.detected ? "detected" : "in progress"}`,
                }))}
                size="sm"
                variant="pill"
                align="right"
                ariaLabel="Select active run"
              />
            </div>
          )}

          {health && (
            <span
              className="h-2 w-2 rounded-full bg-[var(--ok)] shrink-0"
              title={`Connected (${health.storage})`}
              aria-label="Database connected"
            />
          )}
        </div>
      </div>
    </header>
  );
}
