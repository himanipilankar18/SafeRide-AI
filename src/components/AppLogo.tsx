import logo from "@/assets/safe-ride-logo.png";

interface AppLogoProps {
  showText?: boolean;
}

const AppLogo = ({ showText = true }: AppLogoProps) => {
  return (
    <div className="ml-3 flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full ring-2 ring-white/70 shadow-[0_4px_16px_rgba(15,23,42,0.2)]">
        <img src={logo} alt="SafeRide AI" className="w-full h-full object-cover" />
      </div>
      {showText && (
        <div className="leading-none">
          <p className="text-[18px] font-black tracking-tight text-black">
            SafeRide
          </p>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-black/80">AI</p>
        </div>
      )}
    </div>
  );
};

export default AppLogo;
