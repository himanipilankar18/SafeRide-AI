import express from "express";
import {
  completeRideOtp,
  completeRideOtpByCode,
  createDriverIncident,
  createRideOtp,
  getNearbyAvailableDrivers,
  getLatestActiveRideByDriverPhone,
  getRideByOtp,
  getRideOtpPassengerView,
  getRideSummariesByDriverPhone,
  getRideSummariesByPassengerPhone,
  joinRideByOtp,
  joinRideByOtpAsDriver,
  updateDriverAvailabilityLocation,
  updateRideOtpLocation,
} from "../db/sqlite.js";
import {
  analyzeDrowsinessFrame,
  resetDrowsinessSession,
} from "../services/drowsinessBridge.js";
import { emitTripEvent } from "../liveTracking.js";
import { discoverAndStoreRouteGarages } from "../services/garageDiscovery.js";
import {
  emitDrowsinessEvent,
  endTripLifecycle,
} from "../services/tripLifecycleService.js";

const router = express.Router();

const generateSixDigitOtp = () =>
  String(Math.floor(100000 + Math.random() * 900000));

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
  }),
);

router.post(
  "/drowsiness/analyze",
  asyncHandler(async (req, res) => {
    const { frameDataUrl, sessionKey, reset = false, tripId } = req.body || {};

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

    if (tripId) {
      const fatigue = Number.isFinite(Number(result?.fatigueScore))
        ? Number(result.fatigueScore)
        : 0;
      const distraction = Number.isFinite(Number(result?.distractionScore))
        ? Number(result.distractionScore)
        : 0;
      const riskScore = Number.isFinite(Number(result?.riskScore))
        ? Number(result.riskScore)
        : 0;
      const blinkRatePerMinute = Number.isFinite(
        Number(result?.blinkRatePerMinute),
      )
        ? Number(result.blinkRatePerMinute)
        : 0;
      const eyeClosureSeconds = Number.isFinite(
        Number(result?.eyeClosureSeconds),
      )
        ? Number(result.eyeClosureSeconds)
        : 0;
      const yaw = Number.isFinite(Number(result?.yaw)) ? Number(result.yaw) : 0;
      const pitch = Number.isFinite(Number(result?.pitch))
        ? Number(result.pitch)
        : 0;
      const roll = Number.isFinite(Number(result?.roll))
        ? Number(result.roll)
        : 0;

      emitDrowsinessEvent({
        tripId: String(tripId),
        level:
          result?.state === "CRITICAL"
            ? "CRITICAL"
            : result?.state === "WARNING"
              ? "WARNING"
              : "NORMAL",
        eyeClosure: fatigue,
        attention: Math.max(0, Math.min(100, 100 - distraction)),
        riskScore,
        fatigueScore: fatigue,
        distractionScore: distraction,
        confidence: Number.isFinite(Number(result?.confidence))
          ? Number(result.confidence)
          : 0,
        reason:
          typeof result?.reason === "string" ? result.reason : "model_update",
        blinkRatePerMinute,
        eyeClosureSeconds,
        yaw,
        pitch,
        roll,
        faceDetected: Boolean(result?.faceDetected),
        fatigueFlags:
          result?.fatigueFlags && typeof result.fatigueFlags === "object"
            ? result.fatigueFlags
            : {},
        distractionReason:
          typeof result?.distractionReason === "string"
            ? result.distractionReason
            : "",
      });
    }

    res.json({
      success: true,
      result,
    });
  }),
);

router.post(
  "/incident",
  asyncHandler(async (req, res) => {
    const {
      driverPhone,
      reason,
      location,
      reportedAt,
      nearestGarage = null,
      otpCode = null,
    } = req.body || {};

    if (!driverPhone || !reason) {
      return res.status(400).json({
        success: false,
        message: "driverPhone and reason are required",
      });
    }

    const explicitOtp = otpCode ? String(otpCode).trim() : null;
    const ride = explicitOtp
      ? await getRideByOtp(explicitOtp)
      : await getLatestActiveRideByDriverPhone(String(driverPhone).trim());

    const incident = await createDriverIncident({
      rideId: ride?.ride_id ?? null,
      otpCode: ride?.otp_code ?? explicitOtp,
      driverPhone: String(driverPhone).trim(),
      reason: String(reason).trim().toLowerCase(),
      lat:
        location?.lat === undefined || location?.lat === null
          ? null
          : Number(location.lat),
      lng:
        location?.lng === undefined || location?.lng === null
          ? null
          : Number(location.lng),
      nearestGarage,
      reportedAt: reportedAt || new Date().toISOString(),
    });

    if (ride?.otp_code) {
      emitTripEvent(String(ride.otp_code), {
        type: "driver_incident",
        message: `Driver reported ${String(reason).toLowerCase()} issue`,
        level: "high",
        incident: {
          reason: String(reason).toLowerCase(),
          reportedAt: incident.reported_at,
          location:
            incident.lat !== null && incident.lng !== null
              ? { lat: Number(incident.lat), lng: Number(incident.lng) }
              : null,
          nearestGarage: incident.nearest_garage_name
            ? {
                name: incident.nearest_garage_name,
                phone: incident.nearest_garage_phone,
                distanceKm: incident.nearest_garage_distance_km,
              }
            : null,
        },
      });
    }

    res.status(201).json({
      success: true,
      incident,
      rideOtpCode: ride?.otp_code || explicitOtp || null,
    });
  }),
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
  }),
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
      passengerPhone: String(passengerPhone).trim(),
    });

    const passengerView = await getRideOtpPassengerView(ride.otp_code);

    res.json({
      success: true,
      ride: passengerView,
    });
  }),
);

router.post(
  "/join-driver",
  asyncHandler(async (req, res) => {
    const { otpCode, driverPhone, pickupLat, pickupLng, pickupLabel } =
      req.body || {};

    if (!otpCode || !driverPhone) {
      return res.status(400).json({
        success: false,
        message: "otpCode and driverPhone are required",
      });
    }

    const ride = await joinRideByOtpAsDriver({
      otpCode: String(otpCode).trim(),
      driverPhone,
      pickupLat:
        pickupLat === undefined || pickupLat === null
          ? null
          : Number(pickupLat),
      pickupLng:
        pickupLng === undefined || pickupLng === null
          ? null
          : Number(pickupLng),
      pickupLabel:
        typeof pickupLabel === "string" && pickupLabel.trim()
          ? pickupLabel.trim()
          : null,
    });

    const passengerView = await getRideOtpPassengerView(ride.otp_code);

    res.json({
      success: true,
      ride: passengerView,
    });
  }),
);

router.post(
  "/end",
  asyncHandler(async (req, res) => {
    const {
      otpCode,
      endedBy = "passenger",
      finalLat,
      finalLng,
      distanceKm,
      durationSec,
      driverPerformance,
    } = req.body || {};

    if (!otpCode) {
      return res.status(400).json({
        success: false,
        message: "otpCode is required",
      });
    }

    const summary = await completeRideOtp({
      otpCode: String(otpCode).trim(),
      endedBy,
      finalLat,
      finalLng,
      distanceKm,
      durationSec,
      driverPerformance,
    });

    await endTripLifecycle({ tripId: String(otpCode).trim() });

    emitTripEvent(String(otpCode).trim(), {
      type: "trip_complete",
      message: "Ride completed",
      summary,
    });

    res.json({
      success: true,
      summary,
    });
  }),
);

router.post(
  "/complete",
  asyncHandler(async (req, res) => {
    const { otpCode, lat, lng, completedAt, behaviorScore, drowsinessSummary } =
      req.body || {};

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
  }),
);

router.post(
  "/availability-location",
  asyncHandler(async (req, res) => {
    const { driverPhone, lat, lng, timestamp } = req.body || {};

    if (!driverPhone || lat === undefined || lng === undefined) {
      return res.status(400).json({
        success: false,
        message: "driverPhone, lat and lng are required",
      });
    }

    const driver = await updateDriverAvailabilityLocation({
      phone: String(driverPhone).trim(),
      lat: Number(lat),
      lng: Number(lng),
      timestamp,
    });

    res.json({
      success: true,
      driver,
    });
  }),
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
  }),
);

router.get(
  "/nearby-drivers",
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radiusKm || 8);
    const limit = Number(req.query.limit || 5);
    const excludePhone = req.query.excludePhone
      ? String(req.query.excludePhone)
      : null;

    const drivers = await getNearbyAvailableDrivers({
      lat,
      lng,
      radiusKm,
      limit,
      excludePhone,
    });

    res.json({
      success: true,
      drivers,
    });
  }),
);

router.get(
  "/history",
  asyncHandler(async (req, res) => {
    const role = String(req.query.role || "passenger").toLowerCase();
    const phone = String(req.query.phone || "").trim();

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "phone query param is required",
      });
    }

    const rides =
      role === "driver"
        ? await getRideSummariesByDriverPhone(phone)
        : await getRideSummariesByPassengerPhone(phone);

    res.json({
      success: true,
      rides,
    });
  }),
);

router.get(
  "/live-track/:otpCode",
  asyncHandler(async (req, res) => {
    const otpCode = String(req.params.otpCode || "").trim();
    if (!otpCode) {
      return res.status(400).send("Invalid ride link");
    }

    const safeOtp = otpCode.replace(/[^0-9A-Za-z_-]/g, "");
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SafeRide Live Tracking</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      crossorigin=""
    />
    <style>
      html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
      #map { height: 75vh; width: 100%; }
      .panel { padding: 12px; }
      .label { font-size: 12px; color: #444; }
      .value { font-size: 14px; font-weight: 600; margin-top: 4px; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <div class="panel">
      <div class="label">Tracking OTP</div>
      <div class="value">${safeOtp}</div>
      <div class="label" style="margin-top:8px;">Last update</div>
      <div id="updatedAt" class="value">Waiting for live location...</div>
      <div id="driverInfo" class="label" style="margin-top:8px;"></div>
    </div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
    <script>
      const otp = ${JSON.stringify(safeOtp)};
      const map = L.map('map').setView([12.9716, 77.5946], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      let marker = null;

      const refresh = async () => {
        try {
          const response = await fetch('/api/rides/status/' + encodeURIComponent(otp));
          const data = await response.json();
          if (!response.ok || !data.success || !data.ride) {
            return;
          }

          const ride = data.ride;
          if (ride.current_lat != null && ride.current_lng != null) {
            const lat = Number(ride.current_lat);
            const lng = Number(ride.current_lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              return;
            }
            if (!marker) {
              marker = L.marker([lat, lng]).addTo(map);
            } else {
              marker.setLatLng([lat, lng]);
            }
            map.setView([lat, lng], map.getZoom() < 15 ? 15 : map.getZoom(), { animate: true });
            document.getElementById('updatedAt').textContent = ride.location_updated_at || new Date().toISOString();
            const driverInfo = [ride.driver_name || 'Driver', ride.car_model || '', ride.car_number || ''].filter(Boolean).join(' · ');
            document.getElementById('driverInfo').textContent = driverInfo;
          }
        } catch (_err) {
          // ignore transient failures
        }
      };

      refresh();
      setInterval(refresh, 5000);
    </script>
  </body>
</html>`;

    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  }),
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
  }),
);

export default router;
