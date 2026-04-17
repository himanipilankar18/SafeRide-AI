import { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

interface PhoneFrameProps {
  children: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
}

const PhoneFrame = ({ children, showBack, onBack }: PhoneFrameProps) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="relative w-full max-w-[420px] h-[844px] bg-card rounded-[2.5rem] phone-frame overflow-hidden border border-border">
        {/* Screen content */}
        <div className="h-full overflow-hidden relative">
          {showBack && onBack && (
            <button
              type="button"
              onClick={onBack}
              className="absolute left-4 top-6 z-20 w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center shadow-sm active:scale-[0.97] transition-transform"
            >
              <ArrowLeft size={18} className="text-foreground" />
            </button>
          )}
          {children}
        </div>
      </div>
    </div>
  );
};

export default PhoneFrame;
