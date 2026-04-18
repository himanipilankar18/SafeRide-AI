import express from "express";
import jwt from "jsonwebtoken";
import {
  ensureUser,
  getDriverOnboardingByPhone,
  upsertDriverOnboarding,
} from "../db/sqlite.js";

const router = express.Router();

/**
 * POST /api/auth/register
 * Register user after OTP verification
 * Body: { phoneNumber: string, userType: "driver" | "passenger", token: string }
 */
router.post("/register", (req, res) => {
  try {
    const { phoneNumber, userType = "passenger", token } = req.body;

    if (!phoneNumber || !userType) {
      return res.status(400).json({
        success: false,
        message: "Phone number and user type are required",
      });
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "OTP verification is required before registration.",
      });
    }

    let verifiedPayload;
    try {
      verifiedPayload = jwt.verify(
        token,
        process.env.JWT_SECRET || "dev-secret",
      );
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: error?.message || "Invalid or expired OTP verification token.",
      });
    }

    if (verifiedPayload?.purpose !== "otp-verification") {
      return res.status(401).json({
        success: false,
        message: "Invalid OTP verification token.",
      });
    }

    if (
      verifiedPayload.phoneNumber !== phoneNumber ||
      verifiedPayload.userType !== userType
    ) {
      return res.status(401).json({
        success: false,
        message:
          "OTP verification token does not match this registration request.",
      });
    }

    // Generate JWT token
    const jwtToken = jwt.sign(
      {
        phoneNumber,
        userType,
      },
      process.env.JWT_SECRET || "dev-secret",
      { expiresIn: "7d" },
    );

    res.json({
      success: true,
      message: "User registered successfully",
      token: jwtToken,
      user: {
        phoneNumber,
        userType,
      },
    });
  } catch (error) {
    console.error("Error in /register endpoint:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to register user",
    });
  }
});

/**
 * POST /api/auth/login
 * Login user
 * Body: { phoneNumber: string, userType: "driver" | "passenger" }
 */
router.post("/login", (req, res) => {
  try {
    const { phoneNumber, userType = "passenger" } = req.body;

    // Generate JWT token
    const token = jwt.sign(
      {
        phoneNumber,
        userType,
      },
      process.env.JWT_SECRET || "dev-secret",
      { expiresIn: "7d" },
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        phoneNumber,
        userType,
      },
    });
  } catch (error) {
    console.error("Error in /login endpoint:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to login",
    });
  }
});

/**
 * POST /api/auth/driver-onboarding
 * Save driver profile details after OTP login
 * Body: { phoneNumber, driverName, carNumber, carModel, faceCredential, faceRegistered }
 */
router.post("/driver-onboarding", async (req, res) => {
  try {
    const {
      phoneNumber,
      driverName,
      carNumber,
      carModel,
      faceCredential,
      faceImage,
      faceRegistered = false,
    } = req.body;

    if (
      !phoneNumber ||
      !driverName ||
      !carNumber ||
      !carModel ||
      !faceCredential
    ) {
      return res.status(400).json({
        success: false,
        message:
          "phoneNumber, driverName, carNumber, carModel and faceCredential are required",
      });
    }

    const user = await ensureUser({
      role: "driver",
      name: driverName,
      phone: phoneNumber,
      verified: true,
    });

    const onboarding = await upsertDriverOnboarding({
      userId: user.id,
      phone: phoneNumber,
      driverName,
      carNumber,
      carModel,
      faceCredential,
      faceImage,
      faceRegistered,
    });

    res.json({
      success: true,
      message: "Driver onboarding saved",
      onboarding,
    });
  } catch (error) {
    console.error("Error in /driver-onboarding endpoint:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to save driver onboarding",
    });
  }
});

/**
 * GET /api/auth/driver-onboarding/:phoneNumber
 */
router.get("/driver-onboarding/:phoneNumber", async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const onboarding = await getDriverOnboardingByPhone(phoneNumber);

    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: "Driver onboarding not found",
      });
    }

    res.json({
      success: true,
      onboarding,
    });
  } catch (error) {
    console.error("Error in GET /driver-onboarding endpoint:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch driver onboarding",
    });
  }
});

/**
 * Middleware to verify JWT token
 */
export const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "No token provided",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

export default router;
