import express from "express";
import {
  analyzeDrowsinessFrame,
  resetDrowsinessSession,
} from "../services/drowsinessBridge.js";
import {
  completeRideOtpByCode,
  createRideOtp,
  getRideByOtp,
  getRideOtpPassengerView,
  joinRideByOtpAsDriver,
  updateRideOtpLocation,
} from "../db/sqlite.js";
import { discoverAndStoreRouteGarages } from "../services/garageDiscovery.js";

const router = express.Router();

const generateSixDigitOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const asyncHandler = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error?.message || "Request failed",
    });
  }
};

router.post(
  "/drowsiness/reset",
  asyncHandler(async (req, res) => {
    const { sessionKey } = req.body || {};
    if (!sessionKey) {
      return res.status(400).json({
        success: false,
        message: "sessionKey is required",
      });
    }

    await resetDrowsinessSession(String(sessionKey));

    res.json({
      success: true,
      sessionKey: String(sessionKey),
    });
  })
);

router.post(
  "/drowsiness/analyze",
  asyncHandler(async (req, res) => {
    const { frameDataUrl, sessionKey, reset = false } = req.body || {};

    if (!frameDataUrl) {
      return res.status(400).json({
        success: false,
        message: "frameDataUrl is required",
      });
    }

    const result = await analyzeDrowsinessFrame({
      frameDataUrl: String(frameDataUrl),
      sessionKey: sessionKey ? String(sessionKey) : null,
      reset: Boolean(reset),
    });

    res.json({
      success: true,
      result,
    });
  })
);

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    const {
      passengerPhone,
      sourceLabel,
      destinationLabel,
      startLocation,
      destinationLocation,
    } = req.body || {};

    if (!passengerPhone) {
      return res.status(400).json({
        success: false,
        message: "passengerPhone is required",
      });
    }

    let attempts = 0;
    let ride = null;

    // Keep OTP collisions extremely unlikely while preserving a short, shareable code.
    while (!ride && attempts < 6) {
      const otpCode = generateSixDigitOtp();
      const existing = await getRideByOtp(otpCode);

      if (!existing) {
        ride = await createRideOtp({
          otpCode,
          driverPhone: "UNASSIGNED_DRIVER",
          passengerPhone,
          sourceLabel: sourceLabel || null,
          destinationLabel: destinationLabel || null,
          startLat: startLocation?.lat ?? null,
          startLng: startLocation?.lng ?? null,
          endLat: destinationLocation?.lat ?? null,
          endLng: destinationLocation?.lng ?? null,
        });
      }

      attempts += 1;
    }

    if (!ride) {
      throw new Error("Could not generate ride OTP. Please try again.");
    }

    if (
      Number.isFinite(Number(ride.start_lat)) &&
      Number.isFinite(Number(ride.start_lng)) &&
      Number.isFinite(Number(ride.end_lat)) &&
      Number.isFinite(Number(ride.end_lng))
    ) {
      discoverAndStoreRouteGarages({
        rideId: ride.ride_id,
        startLat: ride.start_lat,
        startLng: ride.start_lng,
        endLat: ride.end_lat,
        endLng: ride.end_lng,
        limit: 12,
      }).catch(() => {
        // Route garage enrichment is best-effort; ride creation should remain fast.
      });
    }

    res.status(201).json({
      success: true,
      ride,
    });
  })
);

router.post(
  "/join-driver",
  asyncHandler(async (req, res) => {
    const { otpCode, driverPhone } = req.body || {};

    if (!otpCode || !driverPhone) {
      return res.status(400).json({
        success: false,
        message: "otpCode and driverPhone are required",
      });
    }

    const ride = await joinRideByOtpAsDriver({
      otpCode: String(otpCode).trim(),
      driverPhone,
    });

    const passengerView = await getRideOtpPassengerView(ride.otp_code);

    res.json({
      success: true,
      ride: passengerView,
    });
  })
);

router.post(
  "/complete",
  asyncHandler(async (req, res) => {
    const {
      otpCode,
      lat,
      lng,
      completedAt,
      behaviorScore,
      drowsinessSummary,
    } = req.body || {};

    if (!otpCode) {
      return res.status(400).json({
        success: false,
        message: "otpCode is required",
      });
    }

    const ride = await completeRideOtpByCode({
      otpCode: String(otpCode).trim(),
      lat: lat === undefined ? null : Number(lat),
      lng: lng === undefined ? null : Number(lng),
      completedAt,
      behaviorScore:
        behaviorScore === undefined || behaviorScore === null
          ? null
          : Number(behaviorScore),
      drowsinessSummary: drowsinessSummary || null,
    });

    const passengerView = await getRideOtpPassengerView(ride.otp_code);

    res.json({
      success: true,
      ride: passengerView,
    });
  })
);

router.post(
  "/location",
  asyncHandler(async (req, res) => {
    const { otpCode, lat, lng, timestamp } = req.body || {};

    if (!otpCode || lat === undefined || lng === undefined) {
      return res.status(400).json({
        success: false,
        message: "otpCode, lat and lng are required",
      });
    }

    const ride = await updateRideOtpLocation({
      otpCode: String(otpCode).trim(),
      lat: Number(lat),
      lng: Number(lng),
      timestamp,
    });

    res.json({
      success: true,
      ride,
    });
  })
);

router.get(
  "/status/:otpCode",
  asyncHandler(async (req, res) => {
    const otpCode = String(req.params.otpCode || "").trim();
    const ride = await getRideOtpPassengerView(otpCode);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: "Ride not found",
      });
    }

    res.json({
      success: true,
      ride,
    });
  })
);

export default router;
