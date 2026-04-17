import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { KeyRound, UserCircle2 } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export interface JoinedRidePayload {
  otpCode: string;
  driverName: string;
  carNumber: string;
  carModel: string;
  faceImage: string | null;
  lat: number | null;
  lng: number | null;
}

interface PassengerJoinRideScreenProps {
  passengerPhone: string;
  onJoined: (ride: JoinedRidePayload) => void;
}

const PassengerJoinRideScreen = ({
  passengerPhone,
  onJoined,
}: PassengerJoinRideScreenProps) => {
  const [otpCode, setOtpCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = useMemo(() => {
    const configured = import.meta.env.VITE_API_BASE_URL;
    if (typeof configured === "string" && configured.trim()) {
      const clean = configured.trim().replace(/\/$/, "");
      return clean.endsWith("/api") ? clean : `${clean}/api`;
    }

    const host = window.location.hostname;
    return `${window.location.protocol}//${host}:5001/api`;
  }, []);

  const handleJoin = async () => {
    if (otpCode.length !== 6) {
      return;
    }

    setIsJoining(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/rides/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpCode, passengerPhone: passengerPhone || "passenger-demo" }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success || !data?.ride) {
        throw new Error(data?.message || "Invalid OTP");
      }

      onJoined({
        otpCode,
        driverName: data.ride.driver_name || "Driver",
        carNumber: data.ride.car_number || "N/A",
        carModel: data.ride.car_model || "N/A",
        faceImage: data.ride.face_image || null,
        lat: data.ride.current_lat ?? null,
        lng: data.ride.current_lng ?? null,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not join ride";
      setError(message);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full overflow-y-auto px-5 pb-8 pt-12"
    >
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Join Ride</p>
        <h2 className="mt-2 text-2xl font-extrabold text-foreground">Enter Driver OTP</h2>
        <p className="mt-1 text-xs text-muted-foreground">Ask the driver for the 6-digit ride OTP.</p>

        <div className="mt-4 rounded-2xl border border-border bg-background/60 p-3 text-sm text-foreground">
          <div className="flex items-center gap-2">
            <UserCircle2 size={16} className="text-primary" />
            <span>{passengerPhone || "passenger-demo"}</span>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-border bg-background/60 p-4">
          <p className="mb-3 text-xs font-semibold text-foreground">Ride OTP</p>
          <InputOTP
            maxLength={6}
            value={otpCode}
            onChange={(value) => setOtpCode(value)}
            autoFocus
            disabled={isJoining}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        {error && <div className="mt-4 rounded-xl bg-red-100 px-3 py-2 text-xs text-red-800">{error}</div>}

        <button
          type="button"
          onClick={handleJoin}
          disabled={otpCode.length !== 6 || isJoining}
          className="mt-5 w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60 inline-flex items-center justify-center gap-2"
        >
          <KeyRound size={16} />
          {isJoining ? "Joining..." : "Join Ride"}
        </button>
      </div>
    </motion.div>
  );
};

export default PassengerJoinRideScreen;
