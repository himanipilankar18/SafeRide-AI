import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import otpRoutes from "./routes/otp.js";
import authRoutes from "./routes/auth.js";
import emergencyRoutes from "./routes/emergency.js";
import faceRoutes from "./routes/face.js";
import tripMonitoringRoutes from "./routes/tripMonitoring.js";
import rideOtpRoutes from "./routes/rideOtp.js";
import garageRoutes from "./routes/garages.js";
import emergencyContactsRoutes from "./routes/emergencyContacts.js";
import tripLifecycleRoutes from "./routes/tripLifecycle.js";
import { initializeLiveTracking } from "./liveTracking.js";
import { initDatabase } from "./db/sqlite.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Create HTTP server for WebSocket support
const httpServer = http.createServer(app);

// Initialize WebSocket for live tracking
initializeLiveTracking(httpServer);

// Middleware
app.use(cors());
app.use(express.json({ limit: "15mb" }));

// Routes
app.use("/api/otp", otpRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/emergency", emergencyRoutes);
app.use("/api/face", faceRoutes);
app.use("/api/rides", rideOtpRoutes);
app.use("/api/garages", garageRoutes);
app.use("/api/driver", emergencyContactsRoutes);
app.use("/api/trip", tripLifecycleRoutes);
app.use("/", tripMonitoringRoutes);

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

const bootstrap = async () => {
  const { dbPath } = await initDatabase();
  console.log(`🗄️ SQLite initialized at ${dbPath}`);

  httpServer.once("error", (error) => {
    if (error?.code === "EADDRINUSE") {
      console.log(`⚠️ Port ${PORT} is already in use. Another SafeRide backend instance is likely running.`);
      console.log(`ℹ️ Use the existing instance on http://localhost:${PORT} or stop it before starting a new one.`);
      process.exit(0);
      return;
    }

    console.error("HTTP server startup error:", error);
    process.exit(1);
  });

  httpServer.listen(PORT, () => {
    console.log(`✅ SafeRide backend running on http://localhost:${PORT}`);
    console.log(`🟢 WebSocket server running on ws://localhost:${PORT}`);
    console.log(`📱 OTP API: POST /api/otp/send`);
    console.log(`✓ Verify API: POST /api/otp/verify`);
    console.log(`🚨 Emergency API: POST /api/emergency/alert`);
    console.log(`🚘 Start trip API: POST /start-trip`);
    console.log(`📍 Update location API: POST /update-location`);
    console.log(`🏁 End trip API: POST /end-trip`);
    console.log(`📊 Trip status API: GET /trip-status?trip_id=<id>`);
    console.log(`🧭 Lifecycle API: POST /api/trip/verify | /otp-verify | /start | /end`);
  });
};

bootstrap().catch((error) => {
  console.error("Failed to bootstrap SafeRide backend:", error);
  process.exit(1);
});
