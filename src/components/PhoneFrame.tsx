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
      <div className="relative w-full max-w-[390px] h-[844px] bg-card rounded-[2.5rem] phone-frame overflow-hidden border border-border">
        {/* Status bar */}
        <div className="flex items-center justify-between px-8 pt-3 pb-1">
          <span className="text-xs font-semibold text-foreground">9:41</span>
          <div className="flex items-center gap-1">
            <div className="w-4 h-2.5 rounded-sm border border-foreground/40 relative">
              <div className="absolute inset-0.5 bg-foreground/60 rounded-[1px]" />
            </div>
          </div>
        </div>
        {/* Screen content */}
        <div className="h-[calc(100%-2rem)] overflow-hidden relative">
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
