import { useState, useEffect } from "react";
import { OwaspCoveragePage } from "./OwaspCoveragePage";
import { EvaluationPage } from "./EvaluationPage";
import { OutsideProofCard } from "../components/OutsideProofCard";
import { ShieldCheck, BarChart3, Database } from "lucide-react";

export type TrustTab = "owasp" | "benchmarks" | "outside_proof";

export function AssurancePage({ initialTab = "owasp" }: { initialTab?: TrustTab }) {
  const [activeTab, setActiveTab] = useState<TrustTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const tabs: { id: TrustTab; label: string; icon: React.ReactNode; explanation: string }[] = [
    {
      id: "owasp",
      label: "OWASP",
      icon: <ShieldCheck size={16} className="text-[#2E9E5B]" />,
      explanation: "Checked against the industry's list of top AI security risks.",
    },
    {
      id: "benchmarks",
      label: "Benchmarks",
      icon: <BarChart3 size={16} className="text-[#2E9E5B]" />,
      explanation: "Tested against 30 attack scenarios and 14 benign collaboration runs.",
    },
    {
      id: "outside_proof",
      label: "Outside proof",
      icon: <Database size={16} className="text-[#2E9E5B]" />,
      explanation: "Evaluated against 166,000 real-world attack trace rows and 5 frontier models.",
    },
  ];

  return (
    <div className="-mx-6 -my-10 min-h-screen bg-[#F1FAF4] px-6 py-10 transition-colors">
      <div className="mx-auto max-w-[1120px] space-y-8">
        {/* Large Reassuring Header */}
        <div className="border-b border-[#2E9E5B]/20 pb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#2E9E5B]/30 bg-white/70 px-3.5 py-1 text-[13px] font-medium text-[#1F7A45] shadow-xs">
            <span className="h-2 w-2 rounded-full bg-[#2E9E5B]" />
            Empirical System Verification
          </div>

          <h1 className="mt-4 text-4xl sm:text-5xl lg:text-[52px] font-bold tracking-tight text-[#1F7A45]">
            Why trust us.
          </h1>

          <p className="mt-3 max-w-3xl text-lg sm:text-[19px] leading-relaxed text-[#1F7A45]/90 font-normal">
            Every SwarmGuard safety rule is evaluated against attack scenarios, multi-agent data leaks, and public security benchmarks.
          </p>

          {/* Simple Tab Switcher */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (tab.id === "owasp") window.location.hash = "#/trust/owasp";
                    else if (tab.id === "benchmarks") window.location.hash = "#/trust/benchmarks";
                    else if (tab.id === "outside_proof") window.location.hash = "#/trust/proof";
                  }}
                  className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all ${
                    active
                      ? "bg-white border-[#2E9E5B] shadow-sm ring-1 ring-[#2E9E5B]/30"
                      : "bg-white/60 border-[#2E9E5B]/20 hover:bg-white hover:border-[#2E9E5B]/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {tab.icon}
                    <span className="text-base font-semibold text-[#1F7A45]">{tab.label}</span>
                  </div>
                  <p className="mt-1 text-[13px] leading-normal text-[#1F7A45]/80">
                    {tab.explanation}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content Panels */}
        <div className="rounded-2xl border border-[#2E9E5B]/20 bg-white/90 p-6 sm:p-8 shadow-sm backdrop-blur-xs">
          {activeTab === "owasp" && (
            <div className="transition-opacity">
              <OwaspCoveragePage hideHeader />
            </div>
          )}

          {activeTab === "benchmarks" && (
            <div className="transition-opacity">
              <EvaluationPage hideHeader />
            </div>
          )}

          {activeTab === "outside_proof" && (
            <div className="space-y-6 transition-opacity">
              <OutsideProofCard />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
