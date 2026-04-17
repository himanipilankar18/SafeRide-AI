import { DatabaseZap } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncStatusIndicatorProps {
  pendingCount: number;
  className?: string;
}

const SyncStatusIndicator = ({ pendingCount, className }: SyncStatusIndicatorProps) => {
  const hasPending = pendingCount > 0;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
        hasPending ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700",
        className
      )}
    >
      <DatabaseZap size={14} />
      {hasPending ? `${pendingCount} logs pending sync` : "All logs synced"}
    </div>
  );
};

export default SyncStatusIndicator;
