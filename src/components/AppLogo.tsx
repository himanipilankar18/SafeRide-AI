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
          <p className="text-[18px] font-black tracking-tight text-transparent bg-clip-text bg-[linear-gradient(90deg,#0f172a_0%,#0f766e_52%,#10b981_100%)]">
            SafeRide
          </p>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">AI</p>
        </div>
      )}
    </div>
  );
};

export default AppLogo;
