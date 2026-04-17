import { motion } from "framer-motion";
import onboardingHero from "@/assets/onboarding-hero.png";

interface OnboardingScreenProps {
  onNext: () => void;
}

const OnboardingScreen = ({ onNext }: OnboardingScreenProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex flex-col items-center justify-between h-full px-8 py-6"
    >
      <div className="flex-1 flex items-center justify-center">
        <motion.img
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          src={onboardingHero}
          alt="SafeRide illustration"
          width={280}
          height={280}
          className="object-contain"
        />
      </div>

      <div className="text-center space-y-3 mb-8">
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-3xl font-extrabold text-foreground tracking-tight"
        >
          Anywhere you are
        </motion.h1>
        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-muted-foreground text-sm leading-relaxed max-w-[280px] mx-auto"
        >
          Your safety is our priority. AI-powered ride monitoring keeps you
          protected every mile of the way.
        </motion.p>
      </div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="w-full pb-8"
      >
        <button
          onClick={onNext}
          className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-base transition-transform active:scale-[0.98]"
        >
          Get Started
        </button>
        <div className="flex justify-center gap-2 mt-5">
          <div className="w-8 h-1.5 rounded-full bg-primary" />
          <div className="w-1.5 h-1.5 rounded-full bg-muted" />
          <div className="w-1.5 h-1.5 rounded-full bg-muted" />
        </div>
      </motion.div>
    </motion.div>
  );
};

export default OnboardingScreen;
