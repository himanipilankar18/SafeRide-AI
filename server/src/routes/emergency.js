import express from "express";
import { sendSms } from "../config/twilio.js";

const router = express.Router();

const cleanContact = (contact) => ({
  name: String(contact?.name || "Emergency contact").trim(),
  phone: String(contact?.phone || "").trim(),
});

const formatPoint = (point) => {
  if (!point || !Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lng))) {
    return "Unavailable";
  }

  return `${Number(point.lat).toFixed(5)}, ${Number(point.lng).toFixed(5)}`;
};

const buildEmergencyMessage = ({ passenger, driver, trip, location, timestamp }) => {
  const passengerText = passenger?.phoneNumber || passenger?.name || "Passenger";
  const driverText = driver?.name || driver?.phoneNumber
    ? `${driver?.name || "Assigned driver"}${driver?.phoneNumber ? ` (${driver.phoneNumber})` : ""}`
    : "Not assigned";
  const sourceText = trip?.sourceLabel || formatPoint(trip?.source);
  const destinationText = trip?.destinationLabel || formatPoint(trip?.destination);
  const locationText = formatPoint(location);
  const mapLink =
    location && Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng))
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
    `Time: ${timestamp || new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
    "Please call them or contact emergency services if they do not respond.",
  ].join("\n");
};

router.post("/alert", async (req, res) => {
  try {
    const { contacts = [], passenger, driver, trip, location, timestamp } = req.body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one emergency contact is required",
      });
    }

    const recipients = contacts.map(cleanContact).filter((contact) => contact.phone);
    if (recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid contact phone numbers were provided",
      });
    }

    const body = buildEmergencyMessage({ passenger, driver, trip, location, timestamp });
    const results = await Promise.all(
      recipients.map(async (contact) => ({
        contact,
        ...(await sendSms(contact.phone, body)),
      })),
    );

    const sentCount = results.filter((result) => result.success).length;

    res.status(sentCount > 0 ? 200 : 502).json({
      success: sentCount > 0,
      message: `Sent ${sentCount} of ${recipients.length} emergency alerts`,
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

export default router;
