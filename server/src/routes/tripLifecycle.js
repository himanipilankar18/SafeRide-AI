import express from "express";
import {
  endTripLifecycle,
  getTripLifecycle,
  otpVerifyTrip,
  startTripLifecycle,
  verifyTrip,
} from "../services/tripLifecycleService.js";

const router = express.Router();

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
  "/verify",
  asyncHandler(async (req, res) => {
    const { tripId, driverId = null, passengerId = null } = req.body || {};
    const state = await verifyTrip({ tripId, driverId, passengerId });

    res.json({
      success: true,
      tripState: state,
    });
  }),
);

router.post(
  "/otp-verify",
  asyncHandler(async (req, res) => {
    const { tripId, driverId = null, passengerId = null } = req.body || {};
    const transition = await otpVerifyTrip({ tripId, driverId, passengerId });

    res.json({
      success: true,
      tripState: transition.current,
      transition,
    });
  }),
);

router.post(
  "/start",
  asyncHandler(async (req, res) => {
    const { tripId, driverId = null, passengerId = null } = req.body || {};
    const state = await startTripLifecycle({ tripId, driverId, passengerId });

    res.json({
      success: true,
      tripState: state,
    });
  }),
);

router.post(
  "/end",
  asyncHandler(async (req, res) => {
    const { tripId } = req.body || {};
    const state = await endTripLifecycle({ tripId });

    res.json({
      success: true,
      tripState: state,
    });
  }),
);

router.get(
  "/:tripId",
  asyncHandler(async (req, res) => {
    const state = getTripLifecycle(req.params.tripId);

    res.json({
      success: true,
      tripState: state,
    });
  }),
);

export default router;
