import { AlertTriangle, Share2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickActionsPanelProps {
  onSOS: () => void;
  onFindHelp: () => void;
  onShareLocation: () => void;
  className?: string;
}

const QuickActionsPanel = ({ onSOS, onFindHelp, onShareLocation, className }: QuickActionsPanelProps) => {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-3 shadow-sm", className)}>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Quick Actions</p>
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={onSOS}
          className="rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white active:scale-[0.98]"
        >
          <span className="mx-auto mb-1 block w-fit"><AlertTriangle size={14} /></span>
          SOS
        </button>
        <button
          onClick={onFindHelp}
          className="rounded-xl border border-border bg-background py-2.5 text-xs font-semibold text-foreground active:scale-[0.98]"
        >
          <span className="mx-auto mb-1 block w-fit"><Wrench size={14} /></span>
          Find Help
        </button>
        <button
          onClick={onShareLocation}
          className="rounded-xl border border-border bg-background py-2.5 text-xs font-semibold text-foreground active:scale-[0.98]"
        >
          <span className="mx-auto mb-1 block w-fit"><Share2 size={14} /></span>
          Share
        </button>
      </div>
    </section>
  );
};

export default QuickActionsPanel;
