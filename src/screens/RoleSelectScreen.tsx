import { motion } from "framer-motion";
import { ShieldCheck, Sparkles } from "lucide-react";
import AppLogo from "@/components/AppLogo";
import driverIcon from "@/assets/driver-icon.png";
import passengerIcon from "@/assets/passenger-icon.png";

interface RoleSelectScreenProps {
  onSelect: (role: "driver" | "passenger") => void;
}

const RoleSelectScreen = ({ onSelect }: RoleSelectScreenProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.985 }}
      transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex h-full flex-col overflow-hidden rounded-[2.35rem] bg-[radial-gradient(circle_at_top,#ffffff_0%,#f3f7fb_42%,#eaf1f7_100%)] px-8 py-7"
    >
      <div className="pointer-events-none absolute -left-10 top-20 h-40 w-40 rounded-full bg-emerald-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-14 top-36 h-44 w-44 rounded-full bg-cyan-200/30 blur-3xl" />

      <div className="relative mt-2 mb-8 flex w-full items-center justify-between">
        <AppLogo />
        <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">
          <ShieldCheck size={11} className="text-emerald-600" />
          Trusted AI
        </div>
      </div>

      <div className="relative mb-8 text-center">
        <motion.div
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.12, duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
          className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-200/70 bg-white/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700"
        >
          <Sparkles size={11} />
          Personalized Safety Journey
        </motion.div>
        <motion.h1
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mb-2 text-[2.05rem] font-black leading-tight tracking-[-0.02em] text-transparent bg-clip-text bg-[linear-gradient(110deg,#0f172a_0%,#0f172a_36%,#0f766e_72%,#10b981_100%)]"
        >
          Choose Your
          <br />
          Ride Identity
        </motion.h1>
        <motion.p
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.28, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-[280px] text-sm leading-relaxed text-slate-600"
        >
          Start with the experience tailored for your journey and unlock
          real-time AI protection from the first tap.
        </motion.p>
      </div>

      <div className="relative flex-1 w-full space-y-4">
        <motion.button
          initial={{ y: 18, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ delay: 0.36, duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
          whileHover={{ y: -2, scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => onSelect("driver")}
          className="group w-full rounded-2xl border border-slate-200 bg-white/85 p-5 shadow-[0_10px_26px_-16px_rgba(15,23,42,0.35)] backdrop-blur transition-all hover:border-emerald-300 hover:shadow-[0_14px_32px_-14px_rgba(16,185,129,0.35)]"
        >
          <div className="flex items-center gap-4">
            <img src={driverIcon} alt="Driver" width={72} height={72} className="rounded-xl ring-1 ring-slate-200" />
            <div className="text-left">
              <p className="text-lg font-black text-slate-900">I'm a Driver</p>
              <p className="text-xs leading-relaxed text-slate-600">
                Monitor driving risk, receive instant alerts, and maintain a top safety score.
              </p>
            </div>
          </div>
        </motion.button>

        <motion.button
          initial={{ y: 18, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ delay: 0.46, duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
          whileHover={{ y: -2, scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => onSelect("passenger")}
          className="group w-full rounded-2xl border border-slate-200 bg-white/85 p-5 shadow-[0_10px_26px_-16px_rgba(15,23,42,0.35)] backdrop-blur transition-all hover:border-emerald-300 hover:shadow-[0_14px_32px_-14px_rgba(16,185,129,0.35)]"
        >
          <div className="flex items-center gap-4">
            <img src={passengerIcon} alt="Passenger" width={72} height={72} className="rounded-xl ring-1 ring-slate-200" />
            <div className="text-left">
              <p className="text-lg font-black text-slate-900">I'm a Passenger</p>
              <p className="text-xs leading-relaxed text-slate-600">
                Track live safety, share trip status, and access emergency actions instantly.
              </p>
            </div>
          </div>
        </motion.button>
      </div>
    </motion.div>
  );
};

export default RoleSelectScreen;
