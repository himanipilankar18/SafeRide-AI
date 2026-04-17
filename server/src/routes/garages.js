import express from "express";
import { discoverGaragesForDriverContext } from "../services/garageDiscovery.js";

const router = express.Router();

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

router.get("/discover", async (req, res) => {
  try {
    const lat = toNumber(req.query.lat);
    const lng = toNumber(req.query.lng);
    const limit = toNumber(req.query.limit) || 8;
    const driverPhone =
      typeof req.query.driverPhone === "string" && req.query.driverPhone.trim()
        ? req.query.driverPhone.trim()
        : null;
    const preferNearby = String(req.query.preferNearby || "false").toLowerCase() === "true";
    const strictGps = String(req.query.strictGps || "false").toLowerCase() === "true";

    if (lat === null || lng === null) {
      return res.status(400).json({
        success: false,
        message: "lat and lng query params are required",
      });
    }

    const payload = await discoverGaragesForDriverContext({
      lat,
      lng,
      driverPhone,
      limit,
      preferNearby,
      strictGps,
    });

    res.json({
      success: true,
      source: payload.source,
      rideId: payload.rideId || null,
      garages: payload.garages,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to discover garages",
    });
  }
});

export default router;
