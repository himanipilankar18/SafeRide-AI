import express from "express";
import { sendOtp, verifyOtp } from "../controllers/otpController.js";

const router = express.Router();

/**
 * POST /api/otp/send
 * Send OTP to phone number
 * Body: { phoneNumber: string, userType: "driver" | "passenger" }
 */
router.post("/send", async (req, res) => {
  try {
    const { phoneNumber, userType = "passenger" } = req.body;

    const result = await sendOtp(phoneNumber, userType);

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error in /send endpoint:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
});

/**
 * POST /api/otp/verify
 * Verify OTP
 * Body: { phoneNumber: string, otp: string }
 */
router.post("/verify", async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone number and OTP are required",
      });
    }

    const result = await verifyOtp(phoneNumber, otp);

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error in /verify endpoint:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify OTP",
    });
  }
});

/**
 * POST /api/otp/test
 * Test endpoint for development (remove in production)
 * Body: { phoneNumber: string, userType: "driver" | "passenger" }
 */
router.post("/test", async (req, res) => {
  try {
    const { phoneNumber, userType = "passenger" } = req.body;

    // In development, return a test OTP
    if (process.env.NODE_ENV === "development") {
      res.json({
        success: true,
        message: "Test OTP: 123456 (valid for 10 minutes)",
        testOtp: "123456",
      });
    } else {
      res.status(403).json({
        success: false,
        message: "Test endpoint not available in production",
      });
    }
  } catch (error) {
    console.error("Error in /test endpoint:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get test OTP",
    });
  }
});

export default router;
