import {
  completeRideOtp,
  createRideOtp,
  ensureUser,
  getNearbyAvailableDrivers,
  getRideByOtp,
  joinRideByOtpAsDriver,
  upsertDriverOnboarding,
  updateRideOtpLocation,
} from "../db/sqlite.js";

const DEFAULTS = {
  driverPhone: "+919000000222",
  driverName: "Nearby Test Driver",
  carNumber: "MH-47-AB-2222",
  carModel: "Swift Dzire",
  faceCredential: "seed-face-nearby-2222",
  passengerPhone: "+919000009999",
  passengerLat: 19.24354,
  passengerLng: 72.8559,
  radiusKm: 8,
  limit: 5,
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed = { ...DEFAULTS };

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];

    if (!key.startsWith("--") || value === undefined) {
      continue;
    }

    const normalized = key.slice(2);

    if (
      ["passengerLat", "passengerLng", "radiusKm", "limit"].includes(normalized)
    ) {
      parsed[normalized] = Number(value);
    } else {
      parsed[normalized] = value;
    }

    index += 1;
  }

  return parsed;
};

const generateSixDigitOtp = async () => {
  for (let attempts = 0; attempts < 8; attempts += 1) {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const existing = await getRideByOtp(otp);
    if (!existing) {
      return otp;
    }
  }

  throw new Error("Failed to generate a unique OTP");
};

const seed = async () => {
  const config = parseArgs();

  if (
    !Number.isFinite(config.passengerLat) ||
    !Number.isFinite(config.passengerLng)
  ) {
    throw new Error("passengerLat and passengerLng must be valid numbers");
  }

  const driverUser = await ensureUser({
    role: "driver",
    name: config.driverName,
    phone: config.driverPhone,
    verified: true,
  });

  const onboarding = await upsertDriverOnboarding({
    userId: driverUser.id,
    phone: config.driverPhone,
    driverName: config.driverName,
    carNumber: config.carNumber,
    carModel: config.carModel,
    faceCredential: config.faceCredential,
    faceRegistered: true,
  });

  const otpCode = await generateSixDigitOtp();

  const ride = await createRideOtp({
    otpCode,
    driverPhone: "UNASSIGNED_DRIVER",
    passengerPhone: config.passengerPhone,
    sourceLabel: "Seed source",
    destinationLabel: "Seed destination",
    startLat: config.passengerLat,
    startLng: config.passengerLng,
    endLat: config.passengerLat + 0.004,
    endLng: config.passengerLng + 0.004,
  });

  await joinRideByOtpAsDriver({
    otpCode,
    driverPhone: config.driverPhone,
  });

  const nearbyLat = config.passengerLat + 0.0005;
  const nearbyLng = config.passengerLng + 0.0005;

  await updateRideOtpLocation({
    otpCode,
    lat: nearbyLat,
    lng: nearbyLng,
    timestamp: new Date().toISOString(),
  });

  await completeRideOtp({
    otpCode,
    endedBy: "driver",
    finalLat: nearbyLat,
    finalLng: nearbyLng,
    distanceKm: 0.2,
    durationSec: 120,
    driverPerformance: "safe",
  });

  const candidates = await getNearbyAvailableDrivers({
    lat: config.passengerLat,
    lng: config.passengerLng,
    radiusKm: config.radiusKm,
    limit: config.limit,
  });

  const seededMatch = candidates.find(
    (candidate) => candidate.phone === config.driverPhone,
  );

  const output = {
    seededDriver: {
      id: onboarding.id,
      phone: onboarding.phone,
      driverName: onboarding.driver_name,
      carModel: onboarding.car_model,
      faceRegistered: onboarding.face_registered,
    },
    seedRideOtp: ride.otp_code,
    query: {
      lat: config.passengerLat,
      lng: config.passengerLng,
      radiusKm: config.radiusKm,
      limit: config.limit,
    },
    matchedInNearbyResults: Boolean(seededMatch),
    matchedDriver: seededMatch || null,
    nearbyDrivers: candidates,
  };

  console.log(JSON.stringify(output, null, 2));
};

seed().catch((error) => {
  console.error("Failed to seed nearby driver test data:", error.message);
  process.exit(1);
});
