import { FormEvent, useMemo, useState } from "react";

type Contact = {
  id: string;
  name: string;
  phone: string;
};

type LatLng = {
  lat: number;
  lng: number;
};

type AlertPayload = {
  contacts: Array<{ name: string; phone: string }>;
  passenger: { phoneNumber: string; name: string };
  driver: { name: string; phoneNumber: string };
  trip: {
    sourceLabel: string;
    source: LatLng;
    destinationLabel: string;
    destination: LatLng;
  };
  location: LatLng;
  timestamp: string;
};

type AlertResult = {
  contact: { name: string; phone: string };
  success: boolean;
  sid?: string;
  error?: string;
};

type AlertResponse = {
  success: boolean;
  message: string;
  sentCount: number;
  results: AlertResult[];
};

interface EmergencyAlertProps {
  open: boolean;
  onClose: () => void;
  payloadBase: Omit<AlertPayload, "contacts" | "timestamp">;
  apiUrl?: string;
}

const STORAGE_KEY = "saferide_emergency_contacts";

const normalizePhone = (value: string) => {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (trimmed.startsWith("+")) {
    return trimmed;
  }

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return `+91${digits.slice(1)}`;
  }

  return trimmed;
};

const isE164 = (value: string) => /^\+[1-9]\d{7,14}$/.test(value);

const EmergencyAlert = ({
  open,
  onClose,
  payloadBase,
  apiUrl = "http://localhost:5001/api/emergency/alert",
}: EmergencyAlertProps) => {
  const [contacts, setContacts] = useState<Contact[]>(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .map((item: any) => ({
          id: String(item?.id || `${Date.now()}-${item?.phone || "contact"}`),
          name: String(item?.name || "").trim(),
          phone: String(item?.phone || "").trim(),
        }))
        .filter((item) => item.name || item.phone);
    } catch {
      return [];
    }
  });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"info" | "success" | "error">("info");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<AlertResult[]>([]);

  const validContacts = useMemo(
    () => contacts.filter((c) => c.name.trim() && isE164(c.phone.trim())),
    [contacts],
  );

  const persistContacts = (next: Contact[]) => {
    setContacts(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage failures in restricted browser mode
    }
  };

  const addContact = (event: FormEvent) => {
    event.preventDefault();

    const finalName = name.trim();
    const finalPhone = normalizePhone(phone);

    if (!finalName || !finalPhone) {
      setStatusType("error");
      setStatus("Enter contact name and phone number.");
      return;
    }

    if (!isE164(finalPhone)) {
      setStatusType("error");
      setStatus("Use E.164 phone format, for example +919876543210.");
      return;
    }

    const next: Contact[] = [
      ...contacts,
      {
        id: `${Date.now()}-${finalPhone}`,
        name: finalName,
        phone: finalPhone,
      },
    ];

    persistContacts(next);
    setName("");
    setPhone("");
    setStatus(null);
  };

  const removeContact = (id: string) => {
    persistContacts(contacts.filter((item) => item.id !== id));
  };

  const sendEmergency = async () => {
    if (validContacts.length === 0) {
      setStatusType("error");
      setStatus("Add at least one valid emergency contact.");
      return;
    }

    const confirmed = window.confirm(
      `Send emergency SMS alert to ${validContacts.length} contact(s)?`,
    );
    if (!confirmed) return;

    setSending(true);
    setStatusType("info");
    setStatus("Sending emergency SMS alerts...");
    setResults([]);

    try {
      const payload: AlertPayload = {
        ...payloadBase,
        contacts: validContacts.map((contact) => ({
          name: contact.name,
          phone: contact.phone,
        })),
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as AlertResponse;
      if (!response.ok) {
        throw new Error(data?.message || "Failed to send emergency alert.");
      }

      setResults(Array.isArray(data.results) ? data.results : []);
      setStatusType(data.success ? "success" : "error");
      setStatus(data.message || "Emergency alert request finished.");
    } catch (error) {
      setStatusType("error");
      setStatus(error instanceof Error ? error.message : "Failed to send emergency alert.");
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-[1300] bg-black/55 p-4 backdrop-blur-sm">
      <div className="mx-auto mt-10 max-w-md rounded-2xl bg-white p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-gray-900">Emergency Contact Alert</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-600"
          >
            Close
          </button>
        </div>

        <p className="mt-1 text-xs text-gray-500">
          Add contacts and press Call Emergency to send SMS alerts.
        </p>

        <form onSubmit={addContact} className="mt-3 grid grid-cols-1 gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Contact name"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Phone (+919876543210)"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white"
          >
            Add Contact
          </button>
        </form>

        <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">
          {contacts.length === 0 ? (
            <p className="text-xs text-gray-500">No emergency contacts yet.</p>
          ) : (
            contacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-gray-800">{contact.name}</p>
                  <p className="truncate text-[11px] text-gray-500">{contact.phone}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeContact(contact.id)}
                  className="rounded border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-600"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>

        {status && (
          <div
            className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${
              statusType === "success"
                ? "bg-green-100 text-green-700"
                : statusType === "error"
                  ? "bg-red-100 text-red-700"
                  : "bg-blue-100 text-blue-700"
            }`}
          >
            {status}
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-3 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-2">
            {results.map((item, index) => (
              <div key={`${item.contact.phone}-${index}`} className="rounded border border-gray-100 px-2 py-1.5 text-[11px]">
                <p className="font-semibold text-gray-800">
                  {item.contact.name} ({item.contact.phone})
                </p>
                <p className={item.success ? "text-green-700" : "text-red-700"}>
                  {item.success ? `Sent${item.sid ? ` · ${item.sid}` : ""}` : item.error || "Failed"}
                </p>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={sendEmergency}
          disabled={sending}
          className="mt-4 w-full rounded-xl bg-red-600 px-3 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {sending ? "Sending..." : "Call Emergency"}
        </button>
      </div>
    </div>
  );
};

export default EmergencyAlert;
