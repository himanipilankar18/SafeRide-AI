import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, Camera, Play, ShieldCheck, UserRound } from "lucide-react";

interface DriverVerificationScreenProps {
  credential: string;
  onVerified: () => void;
}

const DriverVerificationScreen = ({
  credential,
  onVerified,
}: DriverVerificationScreenProps) => {
  const [isLaunchingRegister, setIsLaunchingRegister] = useState(false);
  const [isLaunchingVerify, setIsLaunchingVerify] = useState(false);
  const [hasLaunchedVerify, setHasLaunchedVerify] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiBase = useMemo(
    () => import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api",
    [],
  );

  const launchRegistration = async () => {
    setIsLaunchingRegister(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`${apiBase}/face/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to launch registration");
      }

      setMessage("Registration window opened. Complete face capture, then run verification.");
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Failed to launch registration";
      setError(reason);
    } finally {
      setIsLaunchingRegister(false);
    }
  };

  const launchVerification = async () => {
    setIsLaunchingVerify(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`${apiBase}/face/verify`, {
        method: "POST",
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to launch verification");
      }

      setHasLaunchedVerify(true);
      setMessage("Verification window opened. Wait for 'VERIFICATION DONE', then continue.");
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Failed to launch verification";
      setError(reason);
    } finally {
      setIsLaunchingVerify(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full px-6 pb-28 pt-4"
    >
      <div className="mb-6">
        <h2 className="text-xl font-extrabold text-foreground">Driver Face Check</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Complete registration and verification before going online.
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <UserRound className="text-primary" size={18} />
            <p className="text-sm text-foreground font-medium">Credential: {credential}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-primary" />
            <p className="text-sm font-semibold text-foreground">Step 1: Face Registration</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Opens desktop camera flow and guides CENTER to LEFT to RIGHT capture.
          </p>
          <button
            onClick={launchRegistration}
            disabled={isLaunchingRegister}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
          >
            {isLaunchingRegister ? "Launching..." : "Launch Registration"}
          </button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-safe" />
            <p className="text-sm font-semibold text-foreground">Step 2: Face Verification</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Opens desktop verification and auto-closes after 'VERIFICATION DONE'.
          </p>
          <button
            onClick={launchVerification}
            disabled={isLaunchingVerify}
            className="w-full py-3 rounded-xl bg-safe text-safe-foreground font-semibold disabled:opacity-60"
          >
            {isLaunchingVerify ? "Launching..." : "Launch Verification"}
          </button>
        </div>

        {message && (
          <div className="rounded-xl bg-green-100 text-green-800 text-xs px-3 py-2">{message}</div>
        )}
        {error && (
          <div className="rounded-xl bg-red-100 text-red-800 text-xs px-3 py-2">{error}</div>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <BadgeCheck size={16} className="text-primary" />
          <p className="text-sm font-semibold text-foreground">Ready to Continue</p>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Continue after verification window shows VERIFICATION DONE.
        </p>
        <button
          onClick={onVerified}
          disabled={!hasLaunchedVerify}
          className="w-full py-3 rounded-xl bg-foreground text-background font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Play size={16} />
          Continue to Driver Dashboard
        </button>
      </div>
    </motion.div>
  );
};

export default DriverVerificationScreen;
