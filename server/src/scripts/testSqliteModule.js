import {
  initDatabase,
  createUser,
  startTrip,
  insertRiskLog,
  triggerAlert,
  triggerEmergencyEvent,
  fetchNearbyGarages,
  upsertGarage,
  closeDatabase,
} from "../db/sqlite.js";

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const createGeneratedPhone = () => {
  const digits = `${Date.now()}${Math.floor(Math.random() * 10000)}`.slice(-10);
  return `+91${digits}`;
};

const createSampleConfig = () => {
  const suffix = `${Date.now()}`.slice(-6);

  const startLat = parseNumber(process.env.SAMPLE_START_LAT, 12.9716);
  const startLng = parseNumber(process.env.SAMPLE_START_LNG, 77.5946);
  const endLat = parseNumber(process.env.SAMPLE_END_LAT, 12.926);
  const endLng = parseNumber(process.env.SAMPLE_END_LNG, 77.6762);

  return {
    driverName: process.env.SAMPLE_DRIVER_NAME || `Driver-${suffix}`,
    passengerName: process.env.SAMPLE_PASSENGER_NAME || `Passenger-${suffix}`,
    driverPhone: process.env.SAMPLE_DRIVER_PHONE || createGeneratedPhone(),
    passengerPhone: process.env.SAMPLE_PASSENGER_PHONE || createGeneratedPhone(),
    startLat,
    startLng,
    endLat,
    endLng,
    garageA: {
      id: parseNumber(process.env.SAMPLE_GARAGE_A_ID, 1000 + parseNumber(suffix, 1)),
      name: process.env.SAMPLE_GARAGE_A_NAME || `Garage-A-${suffix}`,
      phone: process.env.SAMPLE_GARAGE_A_PHONE || createGeneratedPhone(),
      lat: parseNumber(process.env.SAMPLE_GARAGE_A_LAT, startLat + 0.0004),
      lng: parseNumber(process.env.SAMPLE_GARAGE_A_LNG, startLng + 0.0005),
    },
    garageB: {
      id: parseNumber(process.env.SAMPLE_GARAGE_B_ID, 2000 + parseNumber(suffix, 1)),
      name: process.env.SAMPLE_GARAGE_B_NAME || `Garage-B-${suffix}`,
      phone: process.env.SAMPLE_GARAGE_B_PHONE || createGeneratedPhone(),
      lat: parseNumber(process.env.SAMPLE_GARAGE_B_LAT, startLat + 0.0032),
      lng: parseNumber(process.env.SAMPLE_GARAGE_B_LNG, startLng + 0.0059),
    },
    fatigueScore: parseNumber(process.env.SAMPLE_FATIGUE_SCORE, 0.66),
    distractionScore: parseNumber(process.env.SAMPLE_DISTRACTION_SCORE, 0.41),
    routeDeviationScore: parseNumber(process.env.SAMPLE_ROUTE_DEVIATION_SCORE, 0.22),
    combinedRisk: parseNumber(process.env.SAMPLE_COMBINED_RISK, 0.46),
  };
};

const runSampleQueries = async () => {
  try {
    const sample = createSampleConfig();
    const { dbPath } = await initDatabase();
    console.log(`SQLite initialized at: ${dbPath}`);

    // Sample query 1: create users
    const driver = await createUser({
      role: "driver",
      name: sample.driverName,
      phone: sample.driverPhone,
      verified: true,
    });

    const passenger = await createUser({
      role: "passenger",
      name: sample.passengerName,
      phone: sample.passengerPhone,
      verified: true,
    });

    console.log("Created driver:", driver);
    console.log("Created passenger:", passenger);

    // Seed garage cache for location lookup tests
    await upsertGarage({
      garageId: sample.garageA.id,
      name: sample.garageA.name,
      phone: sample.garageA.phone,
      lat: sample.garageA.lat,
      lng: sample.garageA.lng,
    });

    await upsertGarage({
      garageId: sample.garageB.id,
      name: sample.garageB.name,
      phone: sample.garageB.phone,
      lat: sample.garageB.lat,
      lng: sample.garageB.lng,
    });

    // Sample query 2: start trip
    const trip = await startTrip({
      driverId: driver.id,
      passengerId: passenger.id,
      startLat: sample.startLat,
      startLng: sample.startLng,
      endLat: sample.endLat,
      endLng: sample.endLng,
      expectedRoute: JSON.stringify({
        polyline: [
          [sample.startLat, sample.startLng],
          [sample.startLat - 0.0151, sample.startLng + 0.0153],
          [sample.startLat - 0.0312, sample.startLng + 0.0462],
          [sample.endLat, sample.endLng],
        ],
      }),
      status: "active",
    });

    console.log("Started trip:", trip);

    // Sample query 3: insert risk log
    const riskLog = await insertRiskLog({
      tripId: trip.trip_id,
      fatigueScore: sample.fatigueScore,
      distractionScore: sample.distractionScore,
      routeDeviationScore: sample.routeDeviationScore,
      combinedRisk: sample.combinedRisk,
    });

    console.log("Inserted risk log:", riskLog);

    // Sample query 4: trigger alert
    const alert = await triggerAlert({
      tripId: trip.trip_id,
      type: "fatigue",
      level: "warning",
      actionTaken: "audio_prompt",
    });

    console.log("Triggered alert:", alert);

    // Sample query 5: trigger emergency event
    const emergency = await triggerEmergencyEvent({
      tripId: trip.trip_id,
      triggeredBy: "passenger",
      locationLat: sample.startLat - 0.0066,
      locationLng: sample.startLng + 0.0154,
      status: "open",
    });

    console.log("Triggered emergency event:", emergency);

    // Sample query 6: fetch nearby garages
    const garages = await fetchNearbyGarages({
      lat: sample.startLat,
      lng: sample.startLng,
      radiusKm: 10,
      limit: 5,
    });

    console.log("Nearby garages:", garages);
  } catch (error) {
    console.error("SQLite sample query failed:", error.message);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
};

runSampleQueries();
