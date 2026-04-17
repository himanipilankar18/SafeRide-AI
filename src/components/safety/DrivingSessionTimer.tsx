import { Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DrivingSessionTimerProps {
  elapsedSeconds: number;
  className?: string;
}

const format = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(safe / 3600)
    .toString()
    .padStart(2, "0");
  const mm = Math.floor((safe % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(safe % 60)
    .toString()
    .padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

const DrivingSessionTimer = ({ elapsedSeconds, className }: DrivingSessionTimerProps) => {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-3 shadow-sm",
        "flex items-center justify-between gap-3",
        className
      )}
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Driving Session</p>
        <p className="mt-1 text-lg font-extrabold text-foreground tabular-nums">{format(elapsedSeconds)}</p>
      </div>
      <div className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-background">
        <Clock3 size={20} className="text-primary" />
      </div>
    </section>
  );
};

export default DrivingSessionTimer;
