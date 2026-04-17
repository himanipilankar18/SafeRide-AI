import { motion } from "framer-motion";
import { Brain, ShieldCheck, Sparkles } from "lucide-react";
import onboardingHero from "@/assets/onboarding-hero.png";

interface OnboardingScreenProps {
  onNext: () => void;
}

const OnboardingScreen = ({ onNext }: OnboardingScreenProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.38, ease: "easeOut" }}
      className="relative flex h-full flex-col justify-between overflow-hidden rounded-[2.35rem] bg-[radial-gradient(circle_at_top,#ffffff_0%,#f4f8fb_38%,#ebf1f6_100%)] px-7 py-7"
    >
      <div className="pointer-events-none absolute -left-14 top-16 h-44 w-44 rounded-full bg-emerald-200/35 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-40 h-48 w-48 rounded-full bg-cyan-200/30 blur-3xl" />

      <div className="relative z-10 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/60 bg-white/80 px-3 py-1.5 shadow-sm backdrop-blur">
          <Sparkles size={13} className="text-emerald-600" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Premium Safety
          </span>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/75 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          <ShieldCheck size={12} className="text-slate-500" />
          AI Verified
        </div>
      </div>

      <div className="relative z-10 mt-5 flex-1">
        <div className="relative flex h-full items-center justify-center">
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="absolute h-[20.5rem] w-[20.5rem] rounded-full bg-[conic-gradient(from_210deg_at_50%_50%,rgba(16,185,129,.22),rgba(56,189,248,.18),rgba(16,185,129,.24))] blur-2xl"
          />
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.18, duration: 0.52 }}
            className="relative rounded-[2rem] border border-white/50 bg-white/45 px-5 py-6 shadow-[0_24px_45px_-22px_rgba(15,23,42,0.35)] backdrop-blur"
          >
            <motion.img
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.28, duration: 0.58 }}
              src={onboardingHero}
              alt="SafeRide illustration"
              width={275}
              height={275}
              className="object-contain"
            />
          </motion.div>
        </div>
      </div>

      <div className="relative z-10 mb-6 text-center">
        <motion.h1
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.42 }}
          className="text-[2.05rem] font-black leading-tight tracking-[-0.02em] text-slate-900"
        >
          Ride Bold.
          <br />
          Stay Protected.
        </motion.h1>
        <motion.p
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mx-auto mt-3 max-w-[290px] text-sm leading-relaxed text-slate-600"
        >
          Real-time AI monitoring, route intelligence, and instant emergency
          response built into every SafeRide journey.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.56 }}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-3 py-1.5 text-[11px] font-semibold text-slate-700"
        >
          <Brain size={13} className="text-emerald-600" />
          Behavioral AI + Live Risk Detection
        </motion.div>
      </div>

      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.62 }}
        className="relative z-10 w-full pb-5"
      >
        <button
          onClick={onNext}
          className="w-full rounded-2xl bg-[linear-gradient(92deg,#089981_0%,#10b981_52%,#34d399_100%)] py-4 text-base font-extrabold text-white shadow-[0_16px_28px_-12px_rgba(16,185,129,0.55)] transition-all active:scale-[0.985]"
        >
          Get Started
        </button>

        <div className="mt-5 flex justify-center gap-2">
          <div className="h-1.5 w-9 rounded-full bg-emerald-500" />
          <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
          <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
        </div>
      </motion.div>
    </motion.div>
  );
};

export default OnboardingScreen;
