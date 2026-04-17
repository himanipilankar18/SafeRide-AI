import { CloudOff, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

interface NetworkStatusBadgeProps {
  online: boolean;
  className?: string;
}

const NetworkStatusBadge = ({ online, className }: NetworkStatusBadgeProps) => {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
        online ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700",
        className
      )}
    >
      {online ? <Wifi size={14} /> : <CloudOff size={14} />}
      {online ? "Online" : "Offline"}
    </div>
  );
};

export default NetworkStatusBadge;
