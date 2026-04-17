import { motion } from "framer-motion";
import AppLogo from "@/components/AppLogo";
import driverIcon from "@/assets/driver-icon.png";
import passengerIcon from "@/assets/passenger-icon.png";

interface RoleSelectScreenProps {
  onSelect: (role: "driver" | "passenger") => void;
}

const RoleSelectScreen = ({ onSelect }: RoleSelectScreenProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex flex-col items-center h-full px-8 py-6"
    >
      <div className="mt-4 mb-10 w-full">
        <AppLogo />
      </div>

      <div className="text-center mb-10">
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-2xl font-extrabold text-foreground mb-2"
        >
          How are you riding?
        </motion.h1>
        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-sm text-muted-foreground"
        >
          Choose your role to get started
        </motion.p>
      </div>

      <div className="flex-1 w-full space-y-4">
        <motion.button
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          onClick={() => onSelect("driver")}
          className="w-full bg-card rounded-2xl p-5 border border-border flex items-center gap-4 transition-all hover:border-primary hover:shadow-md active:scale-[0.98]"
        >
          <img src={driverIcon} alt="Driver" width={72} height={72} className="rounded-xl" />
          <div className="text-left">
            <p className="font-bold text-lg text-foreground">I'm a Driver</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Monitor your driving safety score, get real-time alerts, and stay safe on the road
            </p>
          </div>
        </motion.button>

        <motion.button
          initial={{ x: 30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          onClick={() => onSelect("passenger")}
          className="w-full bg-card rounded-2xl p-5 border border-border flex items-center gap-4 transition-all hover:border-primary hover:shadow-md active:scale-[0.98]"
        >
          <img src={passengerIcon} alt="Passenger" width={72} height={72} className="rounded-xl" />
          <div className="text-left">
            <p className="font-bold text-lg text-foreground">I'm a Passenger</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Track your ride safety, share your trip, and access emergency features
            </p>
          </div>
        </motion.button>
      </div>
    </motion.div>
  );
};

export default RoleSelectScreen;
