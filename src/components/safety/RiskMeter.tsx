import { cn } from "@/lib/utils";

export type RiskLevel = "low" | "medium" | "high";

interface RiskMeterProps {
  value: number;
  level: RiskLevel;
  label?: string;
  className?: string;
}

const levelStyle = {
  low: "bg-emerald-500",
  medium: "bg-amber-500",
  high: "bg-rose-500",
} as const;

const RiskMeter = ({ value, level, label = "Risk", className }: RiskMeterProps) => {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <section className={cn("rounded-2xl border border-border bg-card p-3 shadow-sm", className)}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <p className="text-sm font-bold text-foreground">{safeValue}%</p>
      </div>
      <div className="h-2.5 rounded-full bg-muted">
        <div
          className={cn("h-2.5 rounded-full transition-all", levelStyle[level])}
          style={{ width: `${safeValue}%` }}
        />
      </div>
      <div className="mt-2 grid grid-cols-3 text-[10px] font-semibold text-muted-foreground">
        <span>LOW</span>
        <span className="text-center">MED</span>
        <span className="text-right">HIGH</span>
      </div>
    </section>
  );
};

export default RiskMeter;
