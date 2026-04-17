import { AlertTriangle, EyeOff, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type DriverState = "alert" | "drowsy" | "distracted";

interface DriverStateIndicatorProps {
  state: DriverState;
  updatedAtLabel?: string;
  className?: string;
}

const stateConfig = {
  alert: {
    label: "Alert",
    textClass: "text-emerald-700",
    chipClass: "bg-emerald-100 border-emerald-200",
    icon: ShieldCheck,
  },
  drowsy: {
    label: "Drowsy",
    textClass: "text-amber-700",
    chipClass: "bg-amber-100 border-amber-200",
    icon: EyeOff,
  },
  distracted: {
    label: "Distracted",
    textClass: "text-rose-700",
    chipClass: "bg-rose-100 border-rose-200",
    icon: AlertTriangle,
  },
} as const;

const DriverStateIndicator = ({ state, updatedAtLabel, className }: DriverStateIndicatorProps) => {
  const cfg = stateConfig[state];
  const Icon = cfg.icon;

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-3 shadow-sm",
        "flex items-center justify-between gap-3",
        className
      )}
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Driver State</p>
        <p className={cn("mt-1 text-base font-extrabold", cfg.textClass)}>{cfg.label}</p>
        {updatedAtLabel && <p className="mt-1 text-[11px] text-muted-foreground">{updatedAtLabel}</p>}
      </div>
      <div className={cn("grid h-11 w-11 place-items-center rounded-xl border", cfg.chipClass)}>
        <Icon size={20} className={cfg.textClass} />
      </div>
    </section>
  );
};

export default DriverStateIndicator;
