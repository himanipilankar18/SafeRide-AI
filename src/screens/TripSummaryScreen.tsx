import { motion } from "framer-motion";
import { Shield, Clock, MapPin, Route, CheckCircle } from "lucide-react";

interface TripSummaryScreenProps {}

const TripSummaryScreen = (_props: TripSummaryScreenProps) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative h-full flex flex-col"
    >
      <div className="px-6 pt-2 pb-4">
        <h2 className="text-lg font-bold text-foreground">Trip Summary</h2>
        <p className="text-xs text-muted-foreground">Your last ride details</p>
      </div>

      <div className="flex-1 px-6 space-y-4 overflow-y-auto pb-28">
        {/* Safety status */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-safe/10 rounded-2xl p-5 flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-safe flex items-center justify-center">
            <CheckCircle size={24} className="text-safe-foreground" />
          </div>
          <div>
            <p className="font-bold text-foreground">Trip Completed Safely</p>
            <p className="text-xs text-muted-foreground">
              No safety incidents reported
            </p>
          </div>
        </motion.div>

        {/* Ride details */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-2xl p-5 border border-border space-y-4"
        >
          <p className="text-sm font-semibold text-muted-foreground">
            Ride Details
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <MapPin size={18} className="text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Pickup</p>
                <p className="text-sm font-semibold text-foreground">
                  MG Road, Bangalore
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MapPin size={18} className="text-destructive" />
              <div>
                <p className="text-xs text-muted-foreground">Drop-off</p>
                <p className="text-sm font-semibold text-foreground">
                  Indiranagar, Bangalore
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Route size={18} className="text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Distance</p>
                <p className="text-sm font-semibold text-foreground">8.2 km</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock size={18} className="text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="text-sm font-semibold text-foreground">
                  24 minutes
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Logged events */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-2xl p-5 border border-border space-y-3"
        >
          <p className="text-sm font-semibold text-muted-foreground">
            Safety Log
          </p>
          {[
            { time: "10:02", text: "Ride started", icon: Shield },
            { time: "10:08", text: "Route verified", icon: CheckCircle },
            { time: "10:15", text: "Speed check passed", icon: CheckCircle },
            { time: "10:26", text: "Ride completed safely", icon: Shield },
          ].map((event, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-muted-foreground w-10">
                {event.time}
              </span>
              <event.icon size={14} className="text-safe" />
              <span className="text-sm text-foreground">{event.text}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
};

export default TripSummaryScreen;
