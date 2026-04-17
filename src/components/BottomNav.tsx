import { Home, Shield, AlertTriangle, Clock, UserRound } from "lucide-react";

interface BottomNavProps {
  active: string;
  onNavigate: (screen: string) => void;
}

const navItems = [
  { id: "home", icon: Home, label: "Home" },
  { id: "monitoring", icon: Shield, label: "Ride" },
  { id: "emergency", icon: AlertTriangle, label: "SOS" },
  { id: "summary", icon: Clock, label: "Trips" },
  { id: "profile", icon: UserRound, label: "Profile" },
];

const BottomNav = ({ active, onNavigate }: BottomNavProps) => {
  return (
    <div className="absolute bottom-0 left-0 right-0 bg-card border-t border-border px-2 pb-6 pt-2">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <item.icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              <span className="text-[10px] font-semibold">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNav;
