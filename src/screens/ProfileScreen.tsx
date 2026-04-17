import { useMemo } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, Phone, UserRound } from "lucide-react";

interface ProfileScreenProps {
  role: "driver" | "passenger";
  phoneNumber: string;
  onOpenRegistration?: () => void;
}

const ProfileScreen = ({ role, phoneNumber, onOpenRegistration }: ProfileScreenProps) => {
  const isFaceVerified = useMemo(() => {
    if (role !== "driver") {
      return false;
    }
    return localStorage.getItem(`driverFaceVerified:${phoneNumber || "driver-demo"}`) === "true";
  }, [phoneNumber, role]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full overflow-y-auto px-5 pb-28 pt-10"
    >
      <div className="rounded-3xl border border-border bg-card p-5">
        <h2 className="text-xl font-extrabold text-foreground">Profile</h2>
        <p className="mt-1 text-xs text-muted-foreground">Stored credentials on this device</p>

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
            <div className="flex items-center gap-2 text-sm">
              <BadgeCheck size={16} className={isFaceVerified ? "text-safe" : "text-warning"} />
              <span className={isFaceVerified ? "text-safe" : "text-warning"}>
                {isFaceVerified ? "Face Verification Completed" : "Face Verification Pending"}
              </span>
            </div>
            {onOpenRegistration && !isFaceVerified && (
              <button
                type="button"
                onClick={onOpenRegistration}
                className="w-full rounded-xl bg-foreground py-3 text-sm font-semibold text-background"
              >
                Run Face Verification
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ProfileScreen;
