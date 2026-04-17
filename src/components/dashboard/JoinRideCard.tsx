import { KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

interface JoinRideCardProps {
  otpCode: string;
  onOtpChange: (value: string) => void;
  onJoin: () => void;
  joining?: boolean;
  className?: string;
}

const JoinRideCard = ({ otpCode, onOtpChange, onJoin, joining = false, className }: JoinRideCardProps) => {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-3 shadow-sm", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Join Ride</p>
      <p className="mt-1 text-xs text-muted-foreground">Enter passenger OTP to attach and begin live safety monitoring.</p>
      <div className="mt-3 flex items-center gap-2">
        <input
          value={otpCode}
          onChange={(e) => onOtpChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          maxLength={6}
          placeholder="6-digit OTP"
          className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold tracking-[0.2em] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          onClick={onJoin}
          disabled={otpCode.length !== 6 || joining}
          className="h-10 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-1">
            <KeyRound size={14} />
            {joining ? "Joining" : "Join"}
          </span>
        </button>
      </div>
    </section>
  );
};

export default JoinRideCard;
