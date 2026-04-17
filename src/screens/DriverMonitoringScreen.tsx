import { motion } from "framer-motion";
import { Shield, AlertTriangle, Eye, Gauge, Phone, Timer } from "lucide-react";

interface DriverMonitoringScreenProps {
  onEmergency: () => void;
}

const DriverMonitoringScreen = ({
  onEmergency,
}: DriverMonitoringScreenProps) => {
  const safetyScore = 92;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative h-full flex flex-col"
    >
      <div className="px-6 pt-2 pb-4">
        <h2 className="text-lg font-bold text-foreground">Driver Dashboard</h2>
        <p className="text-xs text-muted-foreground">
          AI monitoring your driving
        </p>
      </div>

      <div className="flex-1 px-6 space-y-4 overflow-y-auto pb-28">
        {/* Safety score circle */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-card rounded-2xl p-6 border border-border flex flex-col items-center"
        >
          <div className="relative w-28 h-28 mb-3">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="hsl(var(--accent))"
                strokeWidth="8"
              />
              <motion.circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="hsl(var(--safe))"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 42}`}
                initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                animate={{
                  strokeDashoffset: 2 * Math.PI * 42 * (1 - safetyScore / 100),
                }}
                transition={{ duration: 1.5, delay: 0.3 }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold text-foreground">
                {safetyScore}
              </span>
              <span className="text-[10px] text-muted-foreground">Safety</span>
            </div>
          </div>
          <p className="text-sm font-semibold text-safe">Excellent Driving</p>
        </motion.div>

        {/* Driving metrics */}
        <div className="grid grid-cols-2 gap-3">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="bg-card rounded-2xl p-4 border border-border"
          >
            <Gauge size={20} className="text-primary mb-2" />
            <p className="text-xl font-extrabold text-foreground">42</p>
            <p className="text-[10px] text-muted-foreground">km/h Speed</p>
          </motion.div>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-card rounded-2xl p-4 border border-border"
          >
            <Eye size={20} className="text-primary mb-2" />
            <p className="text-xl font-extrabold text-safe">Active</p>
            <p className="text-[10px] text-muted-foreground">Attention</p>
          </motion.div>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="bg-card rounded-2xl p-4 border border-border"
          >
            <Timer size={20} className="text-primary mb-2" />
            <p className="text-xl font-extrabold text-foreground">1:24</p>
            <p className="text-[10px] text-muted-foreground">Drive Time</p>
          </motion.div>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-card rounded-2xl p-4 border border-border"
          >
            <AlertTriangle size={20} className="text-warning mb-2" />
            <p className="text-xl font-extrabold text-foreground">0</p>
            <p className="text-[10px] text-muted-foreground">Alerts</p>
          </motion.div>
        </div>

        {/* AI alerts */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="bg-card rounded-2xl p-5 border border-border space-y-3"
        >
          <p className="text-sm font-semibold text-muted-foreground">
            AI Insights
          </p>
          <div className="flex items-center gap-3 bg-safe/10 rounded-xl p-3">
            <Shield size={16} className="text-safe" />
            <span className="text-sm text-foreground">
              Smooth braking detected
            </span>
          </div>
          <div className="flex items-center gap-3 bg-safe/10 rounded-xl p-3">
            <Shield size={16} className="text-safe" />
            <span className="text-sm text-foreground">
              Lane discipline maintained
            </span>
          </div>
        </motion.div>

        <motion.button
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4 }}
          onClick={onEmergency}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-destructive text-destructive-foreground font-bold transition-transform active:scale-[0.97]"
        >
          <Phone size={20} />
          Emergency
        </motion.button>
      </div>
    </motion.div>
  );
};

export default DriverMonitoringScreen;
