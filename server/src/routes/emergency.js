import express from "express";
import { sendSms } from "../config/twilio.js";

const router = express.Router();

const normalizePhoneNumber = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("+")) {
    return trimmed;
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

const cleanContact = (contact) => ({
  name: String(contact?.name || "Emergency contact").trim(),
  phone: normalizePhoneNumber(contact?.phone),
});

const isValidE164 = (phone) => /^\+[1-9]\d{7,14}$/.test(String(phone || ""));

const cleanPoliceRecipient = (recipient) => ({
  name: String(recipient?.name || "Police Control Room").trim(),
  phone: normalizePhoneNumber(recipient?.phone),
});

const formatPoint = (point) => {
  if (
    !point ||
    !Number.isFinite(Number(point.lat)) ||
    !Number.isFinite(Number(point.lng))
  ) {
    return "Unavailable";
  }

  return `${Number(point.lat).toFixed(5)}, ${Number(point.lng).toFixed(5)}`;
};

const buildEmergencyMessage = ({
  passenger,
  driver,
  trip,
  location,
  timestamp,
}) => {
  const passengerText =
    passenger?.name || passenger?.phoneNumber || "Passenger";
  const driverText =
    driver?.name || driver?.phoneNumber
      ? `${driver?.name || "Assigned driver"}${driver?.phoneNumber ? ` (${driver.phoneNumber})` : ""}`
      : "Not assigned";
  const sourceText = trip?.sourceLabel || formatPoint(trip?.source);
  const destinationText =
    trip?.destinationLabel || formatPoint(trip?.destination);
  const locationText = formatPoint(location);
  const mapLink =
    location &&
    Number.isFinite(Number(location.lat)) &&
    Number.isFinite(Number(location.lng))
      ? `https://maps.google.com/?q=${Number(location.lat)},${Number(location.lng)}`
      : "Unavailable";

  return [
    "SOS alert from SafeRide.",
    `${passengerText} triggered an emergency alert.`,
    `Driver: ${driverText}`,
    `Source: ${sourceText}`,
    `Destination: ${destinationText}`,
    `Current location: ${locationText}`,
    `Map: ${mapLink}`,
    `Time: ${timestamp || new Date().toISOString()}`,
    "Please call them or contact emergency services if they do not respond.",
  ].join("\n");
};

const buildPoliceMessage = ({
  passenger,
  driver,
  trip,
  location,
  timestamp,
}) => {
  const passengerText =
    passenger?.phoneNumber || passenger?.name || "Passenger";
  const driverText =
    driver?.name || driver?.phoneNumber
      ? `${driver?.name || "Assigned driver"}${driver?.phoneNumber ? ` (${driver.phoneNumber})` : ""}`
      : "Not assigned";
  const vehicleText = driver?.vehicleDetails || "Unknown vehicle";
  const sourceText = trip?.sourceLabel || formatPoint(trip?.source);
  const destinationText =
    trip?.destinationLabel || formatPoint(trip?.destination);
  const locationText = formatPoint(location);
  const mapLink =
    location &&
    Number.isFinite(Number(location.lat)) &&
    Number.isFinite(Number(location.lng))
      ? `https://maps.google.com/?q=${Number(location.lat)},${Number(location.lng)}`
      : "Unavailable";

  return [
    "SafeRide emergency escalation.",
    `Passenger: ${passengerText}`,
    `Driver: ${driverText}`,
    `Vehicle: ${vehicleText}`,
    `Route: ${sourceText} -> ${destinationText}`,
    `Passenger location: ${locationText}`,
    `Map: ${mapLink}`,
    `Time: ${timestamp || new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
  ].join("\n");
};

router.post("/alert", async (req, res) => {
  try {
    const {
      contacts = [],
      passenger,
      driver,
      trip,
      location,
      timestamp,
    } = req.body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one emergency contact is required",
      });
    }

    const recipients = contacts
      .map(cleanContact)
      .filter((contact) => contact.phone);
    if (recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid contact phone numbers were provided",
      });
    }

    const body = buildEmergencyMessage({
      passenger,
      driver,
      trip,
      location,
      timestamp,
    });
    const results = await Promise.all(
      recipients.map(async (contact) => {
        if (!isValidE164(contact.phone)) {
          return {
            contact,
            success: false,
            error:
              "Invalid phone format. Use E.164 format, for example +919876543210.",
          };
        }

        return {
          contact,
          ...(await sendSms(contact.phone, body)),
        };
      }),
    );

    const sentCount = results.filter((result) => result.success).length;
    const failedResults = results.filter((result) => !result.success);
    const firstFailure = failedResults[0];
    const detailMessage =
      firstFailure?.error && firstFailure?.contact?.phone
        ? `${firstFailure.error} (recipient: ${firstFailure.contact.phone})`
        : firstFailure?.error || null;

    let message = `Sent ${sentCount} of ${recipients.length} emergency alerts`;
    if (sentCount === 0 && detailMessage) {
      message = `No SOS SMS sent. ${detailMessage}`;
    } else if (sentCount < recipients.length && detailMessage) {
      message = `${message}. Some recipients failed: ${detailMessage}`;
    }

    res.status(200).json({
      success: sentCount > 0,
      message,
      sentCount,
      results,
    });
  } catch (error) {
    console.error("Error in /api/emergency/alert endpoint:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send emergency alerts",
    });
  }
});

router.post("/dispatch", async (req, res) => {
  try {
    const {
      contacts = [],
      police = [],
      passenger,
      driver,
      trip,
      location,
      timestamp,
    } = req.body;

    const contactRecipients = Array.isArray(contacts)
      ? contacts.map(cleanContact).filter((contact) => contact.phone)
      : [];
    const policeRecipients = Array.isArray(police)
      ? police.map(cleanPoliceRecipient).filter((recipient) => recipient.phone)
      : [];

    if (contactRecipients.length === 0 && policeRecipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Select at least one emergency contact or police recipient",
      });
    }

    const contactMessage = buildEmergencyMessage({
      passenger,
      driver,
      trip,
      location,
      timestamp,
    });
    const policeMessage = buildPoliceMessage({
      passenger,
      driver,
      trip,
      location,
      timestamp,
    });

    const contactResults = await Promise.all(
      contactRecipients.map(async (contact) => ({
        recipientType: "contact",
        channel: "sms",
        recipient: contact,
        ...(await sendSms(contact.phone, contactMessage)),
      })),
    );

    // Police is dummy - just log but don't send
    const policeResults = policeRecipients.map((recipient) => ({
      recipientType: "police",
      channel: "sms",
      recipient,
      success: true,
      sid: "dummy-police-alert",
    }));
    console.log(
      `📋 Police alert (dummy): ${policeResults.length} recipient(s) would be notified`,
    );

    const results = [...contactResults, ...policeResults];
    const sentCount = results.filter((result) => result.success).length;

    res.status(sentCount > 0 ? 200 : 502).json({
      success: sentCount > 0,
      message: `Sent ${sentCount} of ${results.length} emergency messages`,
      sentCount,
      totalRecipients: results.length,
      results,
    });
  } catch (error) {
    console.error("Error in /api/emergency/dispatch endpoint:", error);
    res.status(500).json({
      success: false,
      message: "Failed to dispatch emergency messages",
    });
  }
});

export default router;
