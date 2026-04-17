import { Hospital, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

interface HelpSpot {
  id: string;
  name: string;
  etaLabel: string;
  type: "hospital" | "garage";
}

interface NearbyHelpPanelProps {
  spots: HelpSpot[];
  onSelectSpot?: (spotId: string) => void;
  className?: string;
}

const NearbyHelpPanel = ({ spots, onSelectSpot, className }: NearbyHelpPanelProps) => {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-3 shadow-sm", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Nearby Help</p>
      <div className="mt-2 space-y-2">
        {spots.map((spot) => (
          <button
            key={spot.id}
            onClick={() => onSelectSpot?.(spot.id)}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-3 py-2 text-left"
          >
            <div className="flex items-center gap-2">
              {spot.type === "hospital" ? (
                <Hospital size={14} className="text-rose-600" />
              ) : (
                <Wrench size={14} className="text-amber-600" />
              )}
              <span className="text-xs font-semibold text-foreground">{spot.name}</span>
            </div>
            <span className="text-[11px] text-muted-foreground">{spot.etaLabel}</span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default NearbyHelpPanel;
export type { HelpSpot };
