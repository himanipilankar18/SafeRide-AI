import logo from "@/assets/safe-ride-logo.png";

interface AppLogoProps {
  showText?: boolean;
}

const AppLogo = ({ showText = true }: AppLogoProps) => {
  return (
    <div className="flex items-center gap-2 ml-3">
      <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center">
        <img src={logo} alt="SafeRide AI" className="w-full h-full object-cover" />
      </div>
      {showText && <span className="text-base font-extrabold text-foreground">SafeRide AI</span>}
    </div>
  );
};

export default AppLogo;
