import { motion } from "framer-motion";
import { MapPin, Phone, Wrench } from "lucide-react";

interface DriverFindGarageScreenProps {
  onBackToHome: () => void;
}

const demoGarages = [
  {
    id: "garage-1",
    name: "City Auto Care",
    phone: "+919900001111",
    distance: "0.9 km",
  },
  {
    id: "garage-2",
    name: "Rapid Tyre Service",
    phone: "+919900002222",
    distance: "1.7 km",
  },
  {
    id: "garage-3",
    name: "Highway Mechanic Point",
    phone: "+919900003333",
    distance: "2.6 km",
  },
];

const DriverFindGarageScreen = ({ onBackToHome }: DriverFindGarageScreenProps) => {
  const callGarage = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="h-full overflow-y-auto bg-[radial-gradient(circle_at_top,_#fff7ed,_#ffe9d5_35%,_#fff_75%)] px-5 pb-8 pt-10"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-extrabold text-slate-900">Nearby Garages</h2>
        <button
          type="button"
          onClick={onBackToHome}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
        >
          Back
        </button>
      </div>

      <p className="mb-4 text-sm text-slate-600">
        If your vehicle needs help, call the nearest garage directly.
      </p>

      <div className="space-y-3">
        {demoGarages.map((garage) => (
          <div key={garage.id} className="rounded-2xl border border-orange-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900">{garage.name}</p>
                <p className="mt-1 text-xs text-slate-500">{garage.phone}</p>
              </div>
              <span className="rounded-full bg-orange-100 px-2 py-1 text-[11px] font-semibold text-orange-700">
                {garage.distance}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => callGarage(garage.phone)}
                className="flex-1 rounded-xl bg-orange-600 py-2 text-sm font-bold text-white"
              >
                <Phone size={14} className="mr-1 inline" />
                Call Garage
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                <MapPin size={14} className="mr-1 inline" />
                Route
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
        <Wrench size={14} className="mr-1 inline" />
        Live garage discovery can be wired to backend endpoint <span className="font-semibold">/api/garages/nearby</span>.
      </div>
    </motion.div>
  );
};

export default DriverFindGarageScreen;
