import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, Car, Phone, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";

interface ProfileScreenProps {
  role: "driver" | "passenger";
  phoneNumber: string;
  onOpenRegistration?: () => void;
}

const ProfileScreen = ({ role, phoneNumber, onOpenRegistration }: ProfileScreenProps) => {
  const [loading, setLoading] = useState(role === "driver");
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [driverProfile, setDriverProfile] = useState<{
    driver_name: string;
    car_number: string;
    car_model: string;
    face_credential: string;
    face_registered: number;
    created_at?: string;
    updated_at?: string;
    face_image?: string | null;
  } | null>(null);
  const [formState, setFormState] = useState({
    driverName: "",
    carNumber: "",
    carModel: "",
    faceCredential: "",
  });

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
        setFormState({
          driverName: data.onboarding.driver_name || "",
          carNumber: data.onboarding.car_number || "",
          carModel: data.onboarding.car_model || "",
          faceCredential: data.onboarding.face_credential || "",
        });
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

  const formatDate = (value?: string) => {
    if (!value) {
      return "N/A";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "N/A";
    }
    return parsed.toLocaleString();
  };

  const saveProfileChanges = async () => {
    if (!driverProfile) {
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(`${apiBase}/auth/driver-onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          driverName: formState.driverName.trim(),
          carNumber: formState.carNumber.trim().toUpperCase(),
          carModel: formState.carModel.trim(),
          faceCredential: formState.faceCredential.trim(),
          faceRegistered: Boolean(driverProfile.face_registered),
          faceImage: driverProfile.face_image || null,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success || !data?.onboarding) {
        throw new Error(data?.message || "Failed to save profile changes");
      }

      setDriverProfile(data.onboarding);
      setFormState({
        driverName: data.onboarding.driver_name || "",
        carNumber: data.onboarding.car_number || "",
        carModel: data.onboarding.car_model || "",
        faceCredential: data.onboarding.face_credential || "",
      });
      setIsEditing(false);
      setFeedback("Profile updated successfully.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not update profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full overflow-y-auto px-5 pb-28 pt-14"
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
                <div className="text-sm font-semibold text-foreground">Driver Details</div>

                {isEditing ? (
                  <div className="space-y-2">
                    <Input
                      value={formState.driverName}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, driverName: event.target.value }))
                      }
                      placeholder="Driver name"
                    />
                    <Input
                      value={formState.carNumber}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, carNumber: event.target.value }))
                      }
                      placeholder="Car number"
                    />
                    <Input
                      value={formState.carModel}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, carModel: event.target.value }))
                      }
                      placeholder="Car model"
                    />
                    <Input
                      value={formState.faceCredential}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, faceCredential: event.target.value }))
                      }
                      placeholder="Face credential"
                    />
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setFormState({
                            driverName: driverProfile.driver_name || "",
                            carNumber: driverProfile.car_number || "",
                            carModel: driverProfile.car_model || "",
                            faceCredential: driverProfile.face_credential || "",
                          });
                          setIsEditing(false);
                          setFeedback(null);
                        }}
                        className="w-full rounded-xl border border-border bg-background py-2 text-sm font-semibold text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveProfileChanges}
                        disabled={saving}
                        className="w-full rounded-xl bg-foreground py-2 text-sm font-semibold text-background disabled:opacity-70"
                      >
                        {saving ? "Saving..." : "Save Changes"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-sm font-semibold text-foreground">{driverProfile.driver_name}</div>
                    <div className="flex items-center gap-2 text-sm text-foreground">
                      <Car size={16} className="text-primary" />
                      <span>{driverProfile.car_model} • {driverProfile.car_number}</span>
                    </div>
                    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground space-y-1">
                      <p><span className="font-semibold text-foreground">Face Credential:</span> {driverProfile.face_credential}</p>
                      <p><span className="font-semibold text-foreground">Created:</span> {formatDate(driverProfile.created_at)}</p>
                      <p><span className="font-semibold text-foreground">Last Updated:</span> {formatDate(driverProfile.updated_at)}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <BadgeCheck size={16} className={driverProfile.face_registered ? "text-safe" : "text-warning"} />
                      <span className={driverProfile.face_registered ? "text-safe" : "text-warning"}>
                        {driverProfile.face_registered ? "Face Registered" : "Face Not Registered"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(true);
                        setFeedback(null);
                      }}
                      className="w-full rounded-xl border border-border bg-background py-3 text-sm font-semibold text-foreground"
                    >
                      Edit Profile
                    </button>
                  </>
                )}

                {feedback && (
                  <p className="text-xs text-muted-foreground">{feedback}</p>
                )}
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
                    Open Registration
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
