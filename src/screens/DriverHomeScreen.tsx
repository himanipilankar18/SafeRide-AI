import { motion } from "framer-motion";
import { MapPin, Navigation, Users, Bell, Power } from "lucide-react";
import AppLogo from "@/components/AppLogo";
import BottomNav from "@/components/BottomNav";
import { MapContainer, TileLayer } from "react-leaflet";

interface DriverHomeScreenProps {
  onGoOnline: () => void;
  onNavigate: (screen: string) => void;
}

const DriverHomeScreen = ({ onGoOnline, onNavigate }: DriverHomeScreenProps) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative h-full overflow-hidden bg-black"
    >
      <div className="absolute inset-0 z-0">
        <MapContainer
          center={[12.9716, 77.5946]}
          zoom={13}
          className="h-full w-full"
          style={{ minHeight: "100%" }}
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />
        </MapContainer>
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/55" />
      </div>

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-2 pb-4">
        <div className="flex items-center gap-2">
          <AppLogo showText />
          <p className="text-[10px] text-muted-foreground ml-1">Driver Mode</p>
        </div>
        <button className="w-9 h-9 rounded-full bg-card/85 backdrop-blur border border-border flex items-center justify-center">
          <Bell size={16} className="text-foreground" />
        </button>
      </div>

      {/* Location pin */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="relative">
          <div className="w-4 h-4 rounded-full bg-primary border-[3px] border-primary-foreground" />
          <div className="absolute inset-0 w-4 h-4 rounded-full bg-primary/40 animate-pulse-ring" />
        </div>
      </div>

      {/* Bottom card */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <div className="bg-card/90 backdrop-blur-xl rounded-t-3xl px-6 pt-6 pb-2 border-t border-border shadow-[0_-10px_30px_rgba(0,0,0,0.25)]">
          {/* Stats row */}
          <div className="flex items-center justify-between mb-5">
            <div className="text-center">
              <p className="text-2xl font-extrabold text-foreground">4.9</p>
              <p className="text-[10px] text-muted-foreground">Rating</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <p className="text-2xl font-extrabold text-foreground">12</p>
              <p className="text-[10px] text-muted-foreground">Rides Today</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <p className="text-2xl font-extrabold text-safe">92</p>
              <p className="text-[10px] text-muted-foreground">Safety Score</p>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MapPin size={20} className="text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">Your Location</p>
              <p className="text-xs text-muted-foreground">Koramangala, Bangalore</p>
            </div>
          </div>

          <button
            onClick={onGoOnline}
            className="w-full py-4 rounded-2xl bg-safe text-safe-foreground font-bold text-base transition-transform active:scale-[0.98] flex items-center justify-center gap-2 mb-4"
          >
            <Power size={20} />
            Go Online
          </button>

          <BottomNav active="home" onNavigate={onNavigate} />
        </div>
      </div>
    </motion.div>
  );
};

export default DriverHomeScreen;
