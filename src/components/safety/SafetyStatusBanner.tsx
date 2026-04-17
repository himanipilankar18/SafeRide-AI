import { AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface SafetyStatusBannerProps {
  title: string;
  message: string;
  severity: "normal" | "warning";
  className?: string;
}

const SafetyStatusBanner = ({ title, message, severity, className }: SafetyStatusBannerProps) => {
  const warning = severity === "warning";

  return (
    <section
      className={cn(
        "rounded-2xl border p-3 shadow-sm",
        warning ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800",
        className
      )}
    >
      <div className="flex items-start gap-2">
        {warning ? <AlertTriangle size={16} className="mt-0.5" /> : <ShieldCheck size={16} className="mt-0.5" />}
        <div>
          <p className="text-sm font-bold">{title}</p>
          <p className="mt-1 text-xs leading-relaxed">{message}</p>
        </div>
      </div>
    </section>
  );
};

export default SafetyStatusBanner;
