import { motion } from "framer-motion";
import { ArrowLeft, Wrench } from "lucide-react";

interface DriverFindGarageScreenProps {
  onBackToHome: () => void;
}

const DriverFindGarageScreen = ({
  onBackToHome,
}: DriverFindGarageScreenProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="h-full overflow-y-auto px-5 pb-8 pt-10"
    >
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench size={18} className="text-primary" />
            <h2 className="text-lg font-extrabold text-foreground">
              Find Garage
            </h2>
          </div>
          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground"
          >
            <ArrowLeft size={14} /> Back
          </button>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          Garage finder is available in driver monitoring and roadside help
          panels. This shortcut screen keeps the current flow stable.
        </p>

        <button
          type="button"
          onClick={onBackToHome}
          className="mt-5 w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground"
        >
          Return to Driver Home
        </button>
      </div>
    </motion.div>
  );
};

export default DriverFindGarageScreen;
