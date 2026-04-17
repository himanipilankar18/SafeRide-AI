import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertHistoryItem {
  id: string;
  title: string;
  timeLabel: string;
  severity: "low" | "medium" | "high";
}

interface AlertHistoryPanelProps {
  items: AlertHistoryItem[];
  className?: string;
}

const severityColor = {
  low: "text-emerald-700 bg-emerald-100",
  medium: "text-amber-700 bg-amber-100",
  high: "text-rose-700 bg-rose-100",
} as const;

const AlertHistoryPanel = ({ items, className }: AlertHistoryPanelProps) => {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-3 shadow-sm", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Recent Alerts</p>
      <div className="mt-2 space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">No alerts in this session.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-xl border border-border bg-background px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-muted-foreground" />
                  <p className="text-xs font-semibold text-foreground">{item.title}</p>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", severityColor[item.severity])}>
                  {item.severity}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{item.timeLabel}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
};

export default AlertHistoryPanel;
export type { AlertHistoryItem };
