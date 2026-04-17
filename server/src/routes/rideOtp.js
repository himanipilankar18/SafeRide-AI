import express from "express";
import {
  createRideOtp,
  getRideByOtp,
  getRideOtpPassengerView,
  joinRideByOtpAsDriver,
  updateRideOtpLocation,
} from "../db/sqlite.js";

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
