import express from "express";
import {
  completeTripSession,
  fetchTripStatus,
  processLocationUpdate,
  startTripSession,
} from "../services/tripMonitoringService.js";

const router = express.Router();

const asyncHandler = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    const status = error.message === "Trip not found" ? 404 : 400;
    res.status(status).json({
      success: false,
      message: error.message || "Request failed",
    });
  }
};

router.post(
  "/start-trip",
  asyncHandler(async (req, res) => {
    const { driver_id, passenger_id, start_location, destination, expected_route } = req.body || {};

    const trip = await startTripSession({
      driverId: Number(driver_id),
      passengerId: Number(passenger_id),
      startLat: Number(start_location?.lat),
      startLng: Number(start_location?.lng),
      destinationLat: Number(destination?.lat),
      destinationLng: Number(destination?.lng),
      expectedRoute: expected_route || null,
    });

    res.status(201).json({
      success: true,
      trip,
    });
  })
);

router.post(
  "/update-location",
  asyncHandler(async (req, res) => {
    const {
      trip_id,
      driver_id,
      lat,
      lng,
      timestamp,
      fatigue_score,
      distraction_score,
    } = req.body || {};

    const result = await processLocationUpdate({
      tripId: Number(trip_id),
      driverId: Number(driver_id),
      lat: Number(lat),
      lng: Number(lng),
      timestamp,
      fatigueScore: Number(fatigue_score || 0),
      distractionScore: Number(distraction_score || 0),
    });

    res.json({
      success: true,
      ...result,
    });
  })
);

router.post(
  "/end-trip",
  asyncHandler(async (req, res) => {
    const { trip_id } = req.body || {};

    const trip = await completeTripSession({
      tripId: Number(trip_id),
    });

    res.json({
      success: true,
      trip,
    });
  })
);

router.get(
  "/trip-status",
  asyncHandler(async (req, res) => {
    const tripId = Number(req.query.trip_id || req.query.tripId);

    const status = await fetchTripStatus({ tripId });

    res.json({
      success: true,
      status,
    });
  })
);

export default router;
