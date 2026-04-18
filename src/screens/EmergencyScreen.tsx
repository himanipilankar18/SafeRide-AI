import { motion } from "framer-motion";
import { Ambulance, MapPin, Phone, Trash2, UserPlus } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { TripConfig } from "@/screens/HomeScreen";
import { LatLng } from "@/lib/navigationSafety";
import {
  DistanceEntry,
  NearbyHospital,
  getNearbyHospitals,
} from "@/lib/roadsideSupport";

const EMERGENCY_CONTACTS_KEY = "saferide_emergency_contacts";

interface EmergencyScreenProps {
  onBack: () => void;
  tripConfig: TripConfig;
  hasActiveTrip?: boolean;
  role: "driver" | "passenger";
  activeTripId?: string | null;
  onOpenFindHospital?: () => void;
}

type EmergencyContact = {
  id: string;
  name: string;
  phone: string;
  selectedForSos: boolean;
};

const normalizePhoneNumber = (value: string) => {
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^\d+]/g, "");

  if (digits.startsWith("+")) {
    return digits;
  }

  const numericOnly = trimmed.replace(/\D/g, "");
  if (numericOnly.length === 10) {
    return `+91${numericOnly}`;
  }

  if (numericOnly.length === 11 && numericOnly.startsWith("0")) {
    return `+91${numericOnly.slice(1)}`;
  }

  return trimmed;
};

const parseVehicleDetails = (vehicleDetails: string | undefined) => {
  const text = String(vehicleDetails || "").trim();
  if (!text) {
    return { carModel: "Unknown model", carNumber: "Unknown plate" };
  }

  const parts = text.split(" ");
  if (parts.length <= 2) {
    return { carModel: text, carNumber: "Unknown plate" };
  }

  const carNumber = parts.slice(-1).join(" ");
  const carModel = parts.slice(0, -1).join(" ");
  return {
    carModel: carModel || "Unknown model",
    carNumber: carNumber || "Unknown plate",
  };
};

const EmergencyScreen = ({
  onBack,
  tripConfig,
  hasActiveTrip = false,
  role,
  activeTripId = null,
  onOpenFindHospital,
}: EmergencyScreenProps) => {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactError, setContactError] = useState<string | null>(null);
  const [alertStatus, setAlertStatus] = useState<string | null>(null);
  const [alertStatusType, setAlertStatusType] = useState<
    "success" | "error" | "info" | "warning"
  >("info");
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [isSimulatingCall, setIsSimulatingCall] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null);
  const [hospitals, setHospitals] = useState<DistanceEntry<NearbyHospital>[]>(
    [],
  );
  const [hospitalSource, setHospitalSource] = useState<
    "online" | "offline-cache"
  >("online");
  const [supportView, setSupportView] = useState<"none" | "hospital">("none");
  const callTimerRefs = useRef<number[]>([]);
  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";

  useEffect(() => {
    return () => {
      callTimerRefs.current.forEach((timerId) => window.clearTimeout(timerId));
      callTimerRefs.current = [];
    };
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(EMERGENCY_CONTACTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Array<
          Partial<EmergencyContact> & { name?: string; phone?: string }
        >;
        if (Array.isArray(parsed)) {
          setContacts(
            parsed.map((contact, index) => ({
              id:
                typeof contact.id === "string" && contact.id.trim()
                  ? contact.id
                  : `${Date.now()}-${index}-${String(contact.phone || "contact")}`,
              name: String(contact.name || "Emergency contact").trim(),
              phone: String(contact.phone || "").trim(),
              selectedForSos:
                typeof contact.selectedForSos === "boolean"
                  ? contact.selectedForSos
                  : true,
            })),
          );
        }
      }
    } catch {
      setContacts([]);
    }
  }, []);

  useEffect(() => {
    if (role !== "driver" || !currentLocation) {
      return;
    }

    let cancelled = false;

    const loadSupportPlaces = async () => {
      const hospitalResult = await getNearbyHospitals(currentLocation, 3);

      if (cancelled) {
        return;
      }

      setHospitals(hospitalResult.hospitals);
      setHospitalSource(hospitalResult.source);
    };

    loadSupportPlaces().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [currentLocation, role]);

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => undefined,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 3000,
      },
    );
  }, []);

  const saveContacts = (nextContacts: EmergencyContact[]) => {
    setContacts(nextContacts);
    try {
      window.localStorage.setItem(
        EMERGENCY_CONTACTS_KEY,
        JSON.stringify(nextContacts),
      );
    } catch {
      // Storage can fail in private browsing; keep contacts for the current session.
    }
  };

  const addContact = (event: FormEvent) => {
    event.preventDefault();

    const name = contactName.trim();
    const phone = normalizePhoneNumber(contactPhone);

    if (!name || !phone) {
      setContactError("Enter a name and phone number.");
      return;
    }

    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      setContactError("Use an international phone number like +919876543210.");
      return;
    }

    saveContacts([
      ...contacts,
      {
        id: `${Date.now()}-${phone}`,
        name,
        phone,
        selectedForSos: true,
      },
    ]);
    setContactName("");
    setContactPhone("");
    setContactError(null);
  };

  const removeContact = (id: string) => {
    saveContacts(contacts.filter((contact) => contact.id !== id));
  };

  const toggleContactSelection = (id: string) => {
    saveContacts(
      contacts.map((contact) =>
        contact.id === id
          ? { ...contact, selectedForSos: !contact.selectedForSos }
          : contact,
      ),
    );
  };

  const sendEmergencyAlert = async () => {
    if (contacts.length === 0) {
      setAlertStatus("Add at least one emergency contact first.");
      setAlertStatusType("error");
      return;
    }

    const recipients = contacts.filter((contact) => contact.phone.trim());

    setIsSendingAlert(true);
    setAlertStatus("Sending emergency alerts...");
    setAlertStatusType("info");

    try {
      const passengerPhone =
        window.localStorage.getItem("phoneNumber") || "passenger-demo";
      const location = currentLocation ?? tripConfig.source;
      const { carModel, carNumber } = parseVehicleDetails(
        tripConfig.driverVehicleDetails,
      );
      const timestamp = new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      });

      const response = await fetch(`${API_BASE_URL}/emergency/alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacts: recipients,
          passenger: {
            phoneNumber: passengerPhone,
          },
          driver: {
            name: tripConfig.driverName,
            phoneNumber: tripConfig.driverPhone,
            carModel,
            carNumber,
            vehicleDetails: tripConfig.driverVehicleDetails,
          },
          trip: hasActiveTrip
            ? {
                otpCode: activeTripId,
                sourceLabel: tripConfig.sourceLabel,
                destinationLabel: tripConfig.destinationLabel,
                source: tripConfig.source,
                destination: tripConfig.destination,
              }
            : {
                sourceLabel: "No active ride route selected",
                destinationLabel: "No active ride route selected",
              },
          location,
          timestamp,
        }),
      });

      const data = await response.json();
      if (!response.ok && !data.partialSuccess && !data.partial) {
        const failureReasons = Array.isArray(data?.results)
          ? data.results
              .filter(
                (item: {
                  success?: boolean;
                  error?: string;
                  contact?: { phone?: string };
                }) => !item?.success,
              )
              .map((item: { error?: string; contact?: { phone?: string } }) =>
                item?.contact?.phone
                  ? `${item.contact.phone}: ${item.error || "send failed"}`
                  : item?.error || "send failed",
              )
              .slice(0, 2)
          : [];

        throw new Error(
          failureReasons.length > 0
            ? `SOS send failed. ${failureReasons.join(" | ")}`
            : data.message || "Failed to send emergency alerts.",
        );
      }

      const sentCount = Number(data?.sentCount || 0);
      const totalRecipients = Number(
        data?.totalRecipients || data?.results?.length || selectedContacts.length,
      );
      const failedCount = Math.max(0, totalRecipients - sentCount);
      const partial = Boolean(data?.partial || (sentCount > 0 && failedCount > 0));

      setAlertStatus(data.message || "Emergency alerts sent.");
      if (sentCount === 0) {
        setAlertStatusType("error");
      } else if (partial) {
        setAlertStatusType("warning");
      } else {
        setAlertStatusType("success");
      }
    } catch (error) {
      setAlertStatus(
        error instanceof Error
          ? error.message
          : "Failed to send emergency alerts.",
      );
      setAlertStatusType("error");
    } finally {
      setIsSendingAlert(false);
    }
  };

  const callNumber = (phone: string) => {
    if (!phone) {
      return;
    }
    window.location.href = `tel:${phone}`;
  };

  const simulateEmergencyCall = () => {
    if (isSimulatingCall) {
      return;
    }

    setIsSimulatingCall(true);
    setAlertStatusType("info");
    setAlertStatus("Simulating call to emergency services (112)...");

    const timer1 = window.setTimeout(() => {
      setAlertStatus("Connecting to dispatch center...");
    }, 1300);

    const timer2 = window.setTimeout(() => {
      setAlertStatusType("success");
      setAlertStatus(
        "Simulation complete: Emergency operator connected. No real call was placed.",
      );
      setIsSimulatingCall(false);
      callTimerRefs.current = [];
    }, 2800);

    callTimerRefs.current = [timer1, timer2];
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative h-full flex flex-col"
    >
      <div className="pl-14 pr-6 pt-12 pb-4 flex items-center">
        <h2 className="text-lg font-bold text-foreground">Emergency</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-28 pt-4">
        {/* SOS button */}
        <div className="relative mx-auto mb-10 mt-14 w-36">
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 rounded-full bg-destructive/20"
            style={{ margin: "-20px" }}
          />
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
            className="absolute inset-0 rounded-full bg-destructive/10"
            style={{ margin: "-40px" }}
          />
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={sendEmergencyAlert}
            disabled={isSendingAlert}
            className="relative w-36 h-36 rounded-full bg-destructive flex flex-col items-center justify-center gap-1 z-10"
          >
            <Phone size={32} className="text-destructive-foreground" />
            <span className="text-destructive-foreground font-extrabold text-xl">
              {isSendingAlert ? "SENDING" : "SOS"}
            </span>
          </motion.button>
        </div>

        <p className="text-sm text-muted-foreground text-center mb-8">
          Press the SOS button to alert emergency services and your trusted
          contacts
        </p>

        {alertStatus && (
          <div
            className={`mb-5 w-full rounded-2xl px-4 py-3 text-center text-xs font-semibold ${
              alertStatusType === "success"
                ? "bg-safe/10 text-safe"
                : alertStatusType === "warning"
                  ? "bg-amber-100 text-amber-800"
                  : alertStatusType === "error"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-accent text-muted-foreground"
            }`}
          >
            {alertStatus}
          </div>
        )}

        {/* Quick actions */}
        <div className="w-full space-y-3 mb-6">
          <motion.button
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            onClick={simulateEmergencyCall}
            disabled={isSimulatingCall}
            className="w-full flex items-center gap-4 bg-card rounded-2xl p-4 border border-border transition-colors hover:bg-accent"
          >
            <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
              <Phone size={20} className="text-destructive" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-sm text-foreground">
                {isSimulatingCall ? "Calling Help..." : "Call Help"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isSimulatingCall
                  ? "In-app simulation in progress"
                  : "Simulate emergency services call"}
              </p>
            </div>
          </motion.button>
        </div>

        {role === "driver" && (
          <div className="mb-5 space-y-3 rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">
              Driver Support Tools
            </p>
            <p className="text-xs text-muted-foreground">
              For accidents, quickly find nearby hospitals and ambulance help.
            </p>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => {
                  setSupportView("hospital");
                  onOpenFindHospital?.();
                }}
                className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700"
              >
                <Ambulance size={14} className="mr-1 inline" />
                Find Hospital
              </button>
            </div>

            {supportView === "hospital" && (
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-xs font-semibold text-foreground">
                  Nearby Hospitals (
                  {hospitalSource === "online" ? "Live" : "Offline"})
                </p>
                <div className="mt-2 space-y-2">
                  {hospitals.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Searching hospitals...
                    </p>
                  ) : (
                    hospitals.map((entry) => (
                      <div
                        key={entry.item.id}
                        className="rounded-lg border border-border bg-card px-3 py-2"
                      >
                        <p className="text-xs font-semibold text-foreground">
                          {entry.item.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {entry.item.address}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {entry.distanceKm.toFixed(1)} km away
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => callNumber(entry.item.phone)}
                            className="rounded-lg border border-primary/30 px-2 py-1 text-[11px] font-bold text-primary"
                          >
                            Call Hospital
                          </button>
                          <button
                            type="button"
                            onClick={() => callNumber("108")}
                            className="rounded-lg border border-red-300 px-2 py-1 text-[11px] font-bold text-red-700"
                          >
                            <Ambulance size={12} className="mr-1 inline" />
                            Call Ambulance
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Emergency contacts */}
        <div className="mt-5 rounded-2xl border border-border bg-card p-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <UserPlus size={19} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Emergency Contacts
              </p>
              <p className="text-xs text-muted-foreground">
                Pick who should receive SOS. Use a number like +919876543210.
              </p>
            </div>
          </div>

          <form className="space-y-3" onSubmit={addContact}>
            <input
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              placeholder="Contact name"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            <input
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              placeholder="Phone number"
              inputMode="tel"
              autoComplete="tel"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            {contactError && (
              <p className="text-xs font-semibold text-destructive">
                {contactError}
              </p>
            )}
            <button
              type="submit"
              className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-transform active:scale-[0.98]"
            >
              Add Contact
            </button>
          </form>

          <div className="mt-4 space-y-2">
            {contacts.length === 0 ? (
              <p className="rounded-xl bg-accent px-4 py-3 text-xs font-medium text-muted-foreground">
                No contacts added yet.
              </p>
            ) : (
              contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3"
                >
                  <input
                    type="checkbox"
                    checked={contact.selectedForSos}
                    onChange={() => toggleContactSelection(contact.id)}
                    aria-label={`Select ${contact.name} for SOS`}
                    className="h-4 w-4 accent-primary"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {contact.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {contact.phone}
                    </p>
                    <button
                      type="button"
                      onClick={() => callNumber(contact.phone)}
                      className="mt-1 rounded-lg border border-primary/30 px-2 py-1 text-[11px] font-bold text-primary"
                    >
                      Call
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeContact(contact.id)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/10 text-destructive"
                    aria-label={`Remove ${contact.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default EmergencyScreen;
