import express from "express";
import {
  createRideOtp,
  getRideByOtp,
  getRideOtpPassengerView,
  joinRideByOtp,
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
      driverPhone,
      sourceLabel,
      destinationLabel,
      startLocation,
    } = req.body || {};

    if (!driverPhone) {
      return res.status(400).json({
        success: false,
        message: "driverPhone is required",
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
          driverPhone,
          sourceLabel: sourceLabel || null,
          destinationLabel: destinationLabel || null,
          startLat: startLocation?.lat ?? null,
          startLng: startLocation?.lng ?? null,
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
  "/join",
  asyncHandler(async (req, res) => {
    const { otpCode, passengerPhone } = req.body || {};

    if (!otpCode || !passengerPhone) {
      return res.status(400).json({
        success: false,
        message: "otpCode and passengerPhone are required",
      });
    }

    const ride = await joinRideByOtp({
      otpCode: String(otpCode).trim(),
      passengerPhone,
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
