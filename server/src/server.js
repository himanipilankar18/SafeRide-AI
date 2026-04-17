import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import otpRoutes from "./routes/otp.js";
import authRoutes from "./routes/auth.js";
import emergencyRoutes from "./routes/emergency.js";
import faceRoutes from "./routes/face.js";
import { initializeLiveTracking } from "./liveTracking.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Create HTTP server for WebSocket support
const httpServer = http.createServer(app);

// Initialize WebSocket for live tracking
initializeLiveTracking(httpServer);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/otp", otpRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/emergency", emergencyRoutes);
app.use("/api/face", faceRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "SafeRide backend is running" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: err.message || "Internal server error",
  });
});

httpServer.listen(PORT, () => {
  console.log(`✅ SafeRide backend running on http://localhost:${PORT}`);
  console.log(`🟢 WebSocket server running on ws://localhost:${PORT}`);
  console.log(`📱 OTP API: POST /api/otp/send`);
  console.log(`✓ Verify API: POST /api/otp/verify`);
  console.log(`🚨 Emergency API: POST /api/emergency/alert`);
});
