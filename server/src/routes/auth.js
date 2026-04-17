import express from "express";
import jwt from "jsonwebtoken";

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

    // Generate JWT token
    const jwtToken = jwt.sign(
      {
        phoneNumber,
        userType,
      },
      process.env.JWT_SECRET || "dev-secret",
      { expiresIn: "7d" }
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
      message: "Failed to register user",
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
      { expiresIn: "7d" }
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
      message: "Failed to login",
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
