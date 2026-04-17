import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, Car, Phone, UserRound } from "lucide-react";

interface ProfileScreenProps {
  role: "driver" | "passenger";
  phoneNumber: string;
  onOpenRegistration?: () => void;
}

const ProfileScreen = ({ role, phoneNumber, onOpenRegistration }: ProfileScreenProps) => {
  const [loading, setLoading] = useState(role === "driver");
  const [driverProfile, setDriverProfile] = useState<{
    driver_name: string;
    car_number: string;
    car_model: string;
    face_registered: number;
    face_image?: string | null;
  } | null>(null);

  const apiBase = useMemo(() => {
    const configured = import.meta.env.VITE_API_BASE_URL;
    if (typeof configured === "string" && configured.trim()) {
      const clean = configured.trim().replace(/\/$/, "");
      return clean.endsWith("/api") ? clean : `${clean}/api`;
    }
    return `${window.location.protocol}//${window.location.hostname}:5001/api`;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadDriverProfile = async () => {
      if (role !== "driver") {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${apiBase}/auth/driver-onboarding/${encodeURIComponent(phoneNumber)}`);
        const data = await response.json();

        if (cancelled) {
          return;
        }

        if (!response.ok || !data?.success || !data?.onboarding) {
          setDriverProfile(null);
          return;
        }

        setDriverProfile(data.onboarding);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDriverProfile();

    return () => {
      cancelled = true;
    };
  }, [apiBase, phoneNumber, role]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full overflow-y-auto px-5 pb-28 pt-10"
    >
      <div className="rounded-3xl border border-border bg-card p-5">
        <h2 className="text-xl font-extrabold text-foreground">Profile</h2>
        <p className="mt-1 text-xs text-muted-foreground">Stored credentials and registration details</p>

        <div className="mt-4 rounded-2xl border border-border bg-background/60 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <UserRound size={16} className="text-primary" />
            <span>Role: {role}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Phone size={16} className="text-primary" />
            <span>{phoneNumber || "N/A"}</span>
          </div>
        </div>

        {role === "driver" && (
          <div className="mt-4 rounded-2xl border border-border bg-background/60 p-4 space-y-3">
            {loading ? (
              <p className="text-xs text-muted-foreground">Loading driver profile...</p>
            ) : driverProfile ? (
              <>
                <div className="text-sm font-semibold text-foreground">{driverProfile.driver_name}</div>
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Car size={16} className="text-primary" />
                  <span>{driverProfile.car_model} • {driverProfile.car_number}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <BadgeCheck size={16} className={driverProfile.face_registered ? "text-safe" : "text-warning"} />
                  <span className={driverProfile.face_registered ? "text-safe" : "text-warning"}>
                    {driverProfile.face_registered ? "Face Registered" : "Face Not Registered"}
                  </span>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Driver profile not found yet.</p>
                {onOpenRegistration && (
                  <button
                    type="button"
                    onClick={onOpenRegistration}
                    className="w-full rounded-xl bg-foreground py-3 text-sm font-semibold text-background"
                  >
                    Complete Registration
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ProfileScreen;
