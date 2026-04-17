import { Navigation, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActiveRideCardProps {
  passengerName: string;
  pickupLabel: string;
  destinationLabel: string;
  otpCode?: string;
  onNavigate: () => void;
  onCallPassenger?: () => void;
  className?: string;
}

const ActiveRideCard = ({
  passengerName,
  pickupLabel,
  destinationLabel,
  otpCode,
  onNavigate,
  onCallPassenger,
  className,
}: ActiveRideCardProps) => {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-3 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Active Ride</p>
          <p className="mt-1 text-sm font-bold text-foreground">Passenger: {passengerName}</p>
          {otpCode && <p className="mt-1 text-xs font-semibold text-primary">OTP: {otpCode}</p>}
        </div>
      </div>
      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <p>Pickup: {pickupLabel}</p>
        <p>Drop: {destinationLabel}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={onNavigate} className="rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground">
          <span className="mx-auto mb-1 block w-fit"><Navigation size={14} /></span>
          Start Navigation
        </button>
        <button
          onClick={onCallPassenger}
          disabled={!onCallPassenger}
          className="rounded-xl border border-border bg-background py-2.5 text-xs font-semibold text-foreground disabled:opacity-50"
        >
          <span className="mx-auto mb-1 block w-fit"><PhoneCall size={14} /></span>
          Call Passenger
        </button>
      </div>
    </section>
  );
};

export default ActiveRideCard;
