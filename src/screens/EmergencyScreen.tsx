import { motion } from "framer-motion";
import { MapPin, Phone, Share2, Trash2, UserPlus } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { TripConfig } from "@/screens/HomeScreen";
import { LatLng } from "@/lib/navigationSafety";

const EMERGENCY_CONTACTS_KEY = "saferide_emergency_contacts";

interface EmergencyScreenProps {
  onBack: () => void;
  tripConfig: TripConfig;
  hasActiveTrip?: boolean;
}

type EmergencyContact = {
  id: string;
  name: string;
  phone: string;
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

const EmergencyScreen = ({
  onBack,
  tripConfig,
  hasActiveTrip = false,
}: EmergencyScreenProps) => {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactError, setContactError] = useState<string | null>(null);
  const [alertStatus, setAlertStatus] = useState<string | null>(null);
  const [alertStatusType, setAlertStatusType] = useState<
    "success" | "error" | "info"
  >("info");
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null);
  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(EMERGENCY_CONTACTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as EmergencyContact[];
        if (Array.isArray(parsed)) {
          setContacts(parsed);
        }
      }
    } catch {
      setContacts([]);
    }
  }, []);

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
      },
    ]);
    setContactName("");
    setContactPhone("");
    setContactError(null);
  };

  const removeContact = (id: string) => {
    saveContacts(contacts.filter((contact) => contact.id !== id));
  };

  const sendEmergencyAlert = async () => {
    if (contacts.length === 0) {
      setAlertStatus("Add at least one emergency contact first.");
      setAlertStatusType("error");
      return;
    }

    setIsSendingAlert(true);
    setAlertStatus("Sending emergency alerts...");
    setAlertStatusType("info");

    try {
      const passengerPhone =
        window.localStorage.getItem("phoneNumber") || "passenger-demo";
      const location = currentLocation ?? tripConfig.source;
      const timestamp = new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      });

      const response = await fetch(`${API_BASE_URL}/emergency/alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacts,
          passenger: {
            phoneNumber: passengerPhone,
          },
          driver: {
            name: tripConfig.driverName,
            phoneNumber: tripConfig.driverPhone,
          },
          trip: hasActiveTrip
            ? {
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
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to send emergency alerts.");
      }

      setAlertStatus(data.message || "Emergency alerts sent.");
      setAlertStatusType("success");
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative h-full flex flex-col"
    >
      <div className="px-6 pt-2 pb-4 flex items-center">
        <h2 className="text-lg font-bold text-foreground">Emergency</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-28 pt-4">
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
                : alertStatusType === "error"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-accent text-muted-foreground"
            }`}
          >
            {alertStatus}
          </div>
        )}

        {/* Quick actions */}
        <div className="w-full space-y-3">
          <motion.button
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="w-full flex items-center gap-4 bg-card rounded-2xl p-4 border border-border transition-colors hover:bg-accent"
          >
            <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
              <Phone size={20} className="text-destructive" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-sm text-foreground">Call Help</p>
              <p className="text-xs text-muted-foreground">
                Contact emergency services
              </p>
            </div>
          </motion.button>

          <motion.button
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="w-full flex items-center gap-4 bg-card rounded-2xl p-4 border border-border transition-colors hover:bg-accent"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <MapPin size={20} className="text-primary" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-sm text-foreground">
                Share Location
              </p>
              <p className="text-xs text-muted-foreground">
                Send live location to contacts
              </p>
            </div>
          </motion.button>

          <motion.button
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            onClick={sendEmergencyAlert}
            disabled={isSendingAlert}
            className="w-full flex items-center gap-4 bg-card rounded-2xl p-4 border border-border transition-colors hover:bg-accent"
          >
            <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center">
              <Share2 size={20} className="text-warning" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-sm text-foreground">
                Alert Contacts
              </p>
              <p className="text-xs text-muted-foreground">
                Notify your trusted circle
              </p>
            </div>
          </motion.button>
        </div>

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
                People to notify during SOS. Use a number like +919876543210.
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
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {contact.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {contact.phone}
                    </p>
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
