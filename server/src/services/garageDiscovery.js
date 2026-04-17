import {
  fetchNearbyGarages,
  getRideGarages,
  getRideByOtp,
  getLatestActiveRideByDriverPhone,
  upsertGarage,
  upsertRideGarages,
} from "../db/sqlite.js";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const toRadians = (value) => (value * Math.PI) / 180;

const haversineKm = (a, b) => {
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);

  const q =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(q));
};

const toAddressText = (tags) => {
  if (!tags) {
    return "Address unavailable";
  }

  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:suburb"],
    tags["addr:city"],
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "Address unavailable";
};

const toPhoneText = (tags) =>
  String(
    tags?.phone ||
      tags?.["contact:phone"] ||
      tags?.["contact:mobile"] ||
      "Phone unavailable",
  ).trim();

const uniqueByGarageId = (garages) => {
  const seen = new Set();
  const out = [];
  for (const garage of garages) {
    if (!garage?.garageId || seen.has(garage.garageId)) {
      continue;
    }
    seen.add(garage.garageId);
    out.push(garage);
  }
  return out;
};

const sampleRoutePoints = (start, end, count = 7) => {
  const samples = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    samples.push({
      lat: start.lat + (end.lat - start.lat) * t,
      lng: start.lng + (end.lng - start.lng) * t,
    });
  }
  return samples;
};

const minDistanceToRouteKm = (point, routePoints) => {
  let minKm = Number.POSITIVE_INFINITY;
  for (const routePoint of routePoints) {
    minKm = Math.min(minKm, haversineKm(point, routePoint));
  }
  return Number.isFinite(minKm) ? minKm : null;
};

const fetchOverpassGaragesAtPoint = async (origin, radiusMeters = 3500) => {
  const query = `[out:json][timeout:20];(node["shop"="car_repair"](around:${radiusMeters},${origin.lat},${origin.lng});node["amenity"="car_repair"](around:${radiusMeters},${origin.lat},${origin.lng});way["shop"="car_repair"](around:${radiusMeters},${origin.lat},${origin.lng});way["amenity"="car_repair"](around:${radiusMeters},${origin.lat},${origin.lng});relation["shop"="car_repair"](around:${radiusMeters},${origin.lat},${origin.lng});relation["amenity"="car_repair"](around:${radiusMeters},${origin.lat},${origin.lng}););out center tags;`;

  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({ data: query }).toString(),
      });

      if (!response.ok) {
        throw new Error(`Overpass request failed (${response.status})`);
      }

      const payload = await response.json();
      const elements = Array.isArray(payload?.elements) ? payload.elements : [];

      const garages = elements
        .map((element) => {
          const lat = element.lat ?? element.center?.lat;
          const lng = element.lon ?? element.center?.lon;
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return null;
          }

          const name =
            String(element.tags?.name || "Nearby Garage").trim() ||
            "Nearby Garage";

          return {
            garageId: `osm-${element.type}-${element.id}`,
            name,
            phone: toPhoneText(element.tags),
            address: toAddressText(element.tags),
            lat,
            lng,
            services: ["Roadside assistance", "Mechanical support"],
          };
        })
        .filter(Boolean);

      return garages;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to fetch garages from map service");
};

const parseServices = (servicesJson) => {
  if (!servicesJson) {
    return ["Roadside assistance", "Mechanical support"];
  }

  try {
    const parsed = JSON.parse(servicesJson);
    return Array.isArray(parsed) ? parsed : ["Roadside assistance"];
  } catch {
    return ["Roadside assistance", "Mechanical support"];
  }
};

const buildSyntheticNearbyGarages = (origin) => {
  const toFixedCoord = (value) => Number(value).toFixed(4);
  const directionText = (latOffset, lngOffset) => {
    const ns = latOffset >= 0 ? "north" : "south";
    const ew = lngOffset >= 0 ? "east" : "west";
    return `${ns}-${ew}`;
  };

  const makeAddress = (latOffset, lngOffset) => {
    const lat = origin.lat + latOffset;
    const lng = origin.lng + lngOffset;
    return `Near ${directionText(latOffset, lngOffset)} side of your location (${toFixedCoord(lat)}, ${toFixedCoord(lng)})`;
  };

  const templates = [
    {
      id: "demo-nearby-1",
      name: "QuickFix Auto Point",
      phone: "+919811001001",
      services: ["Roadside assistance", "Tyre puncture", "Battery jumpstart"],
      latOffset: 0.0042,
      lngOffset: 0.0026,
    },
    {
      id: "demo-nearby-2",
      name: "Metro Garage Assist",
      phone: "+919811001002",
      services: ["Mechanical support", "Engine check", "Emergency tow"],
      latOffset: -0.0038,
      lngOffset: 0.0031,
    },
    {
      id: "demo-nearby-3",
      name: "City Rescue Motors",
      phone: "+919811001003",
      services: ["Roadside assistance", "Electrical checks", "Minor repairs"],
      latOffset: 0.0029,
      lngOffset: -0.004,
    },
  ];

  return templates.map((template) => {
    const lat = origin.lat + template.latOffset;
    const lng = origin.lng + template.lngOffset;
    return {
      garageId: template.id,
      name: template.name,
      phone: template.phone,
      address: makeAddress(template.latOffset, template.lngOffset),
      lat,
      lng,
      services: template.services,
      distanceKm: haversineKm(origin, { lat, lng }),
      distanceToRouteKm: null,
    };
  });
};

const mapRowToGarage = (row, origin = null) => ({
  garageId: row.garage_id,
  name: row.name,
  phone: row.phone || "Phone unavailable",
  address: row.address || "Address unavailable",
  lat: row.lat,
  lng: row.lng,
  services: parseServices(row.services_json),
  distanceKm:
    row.distance_km !== undefined && row.distance_km !== null
      ? Number(row.distance_km)
      : origin
        ? haversineKm(origin, { lat: row.lat, lng: row.lng })
        : null,
  distanceToRouteKm:
    row.distance_to_route_km !== undefined && row.distance_to_route_km !== null
      ? Number(row.distance_to_route_km)
      : null,
});

export const discoverNearbyGarages = async ({
  lat,
  lng,
  limit = 8,
  allowSynthetic = true,
}) => {
  const origin = { lat: Number(lat), lng: Number(lng) };

  try {
    const live = await fetchOverpassGaragesAtPoint(origin, 4500);
    const withDistance = uniqueByGarageId(live)
      .map((garage) => ({
        ...garage,
        distanceKm: haversineKm(origin, { lat: garage.lat, lng: garage.lng }),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, Number(limit));

    await Promise.all(
      withDistance.map((garage) =>
        upsertGarage({
          garageId: garage.garageId,
          name: garage.name,
          phone: garage.phone,
          address: garage.address,
          services: garage.services,
          lat: garage.lat,
          lng: garage.lng,
        }),
      ),
    );

    return {
      source: "online",
      garages: withDistance,
    };
  } catch {
    const cached = await fetchNearbyGarages({
      lat: origin.lat,
      lng: origin.lng,
      radiusKm: 30,
      limit: Number(limit),
    });

    if (cached.length === 0 && allowSynthetic) {
      return {
        source: "demo-nearby",
        garages: buildSyntheticNearbyGarages(origin)
          .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
          .slice(0, Number(limit)),
      };
    }

    return {
      source: "offline-cache",
      garages: cached.map((row) => mapRowToGarage(row, origin)),
    };
  }
};

export const discoverAndStoreRouteGarages = async ({
  rideId,
  startLat,
  startLng,
  endLat,
  endLng,
  limit = 12,
}) => {
  if (!rideId) {
    throw new Error("discoverAndStoreRouteGarages requires rideId");
  }

  if (
    !Number.isFinite(Number(startLat)) ||
    !Number.isFinite(Number(startLng)) ||
    !Number.isFinite(Number(endLat)) ||
    !Number.isFinite(Number(endLng))
  ) {
    throw new Error("Route coordinates are required to discover route garages");
  }

  const start = { lat: Number(startLat), lng: Number(startLng) };
  const end = { lat: Number(endLat), lng: Number(endLng) };
  const routePoints = sampleRoutePoints(start, end, 7);

  const pointGarages = await Promise.all(
    routePoints.map((point) =>
      fetchOverpassGaragesAtPoint(point, 2500).catch(() => []),
    ),
  );

  const merged = uniqueByGarageId(pointGarages.flat());

  const ranked = merged
    .map((garage) => ({
      ...garage,
      distanceToRouteKm: minDistanceToRouteKm(
        { lat: garage.lat, lng: garage.lng },
        routePoints,
      ),
    }))
    .sort((a, b) => (a.distanceToRouteKm ?? 999) - (b.distanceToRouteKm ?? 999))
    .slice(0, Number(limit));

  await Promise.all(
    ranked.map((garage) =>
      upsertGarage({
        garageId: garage.garageId,
        name: garage.name,
        phone: garage.phone,
        address: garage.address,
        services: garage.services,
        lat: garage.lat,
        lng: garage.lng,
      }),
    ),
  );

  await upsertRideGarages({
    rideId,
    garages: ranked.map((garage) => ({
      garageId: garage.garageId,
      name: garage.name,
      phone: garage.phone,
      address: garage.address,
      lat: garage.lat,
      lng: garage.lng,
      services: garage.services,
      distanceToRouteKm: garage.distanceToRouteKm,
    })),
  });

  const rows = await getRideGarages({ rideId, limit: Number(limit) });
  return rows.map((row) => mapRowToGarage(row));
};

export const discoverGaragesForDriverContext = async ({
  lat,
  lng,
  driverPhone,
  limit = 8,
  preferNearby = false,
}) => {
  const origin = { lat: Number(lat), lng: Number(lng) };

  if (preferNearby) {
    return discoverNearbyGarages({
      lat: origin.lat,
      lng: origin.lng,
      limit,
      allowSynthetic: true,
    });
  }

  if (driverPhone) {
    const activeRide = await getLatestActiveRideByDriverPhone(driverPhone);
    let hasActiveRideContext = false;

    if (activeRide) {
      hasActiveRideContext = true;
      const existingRouteRows = await getRideGarages({
        rideId: activeRide.ride_id,
        limit: Number(limit),
      });

      if (existingRouteRows.length > 0) {
        return {
          source: "ride-route",
          rideId: activeRide.ride_id,
          garages: existingRouteRows.map((row) => mapRowToGarage(row, origin)),
        };
      }

      if (
        Number.isFinite(Number(activeRide.start_lat)) &&
        Number.isFinite(Number(activeRide.start_lng)) &&
        Number.isFinite(Number(activeRide.end_lat)) &&
        Number.isFinite(Number(activeRide.end_lng))
      ) {
        const routeGarages = await discoverAndStoreRouteGarages({
          rideId: activeRide.ride_id,
          startLat: activeRide.start_lat,
          startLng: activeRide.start_lng,
          endLat: activeRide.end_lat,
          endLng: activeRide.end_lng,
          limit,
        });

        if (routeGarages.length > 0) {
          return {
            source: "ride-route",
            rideId: activeRide.ride_id,
            garages: routeGarages.map((garage) => ({
              ...garage,
              distanceKm: haversineKm(origin, { lat: garage.lat, lng: garage.lng }),
            })),
          };
        }
      }
    }

    if (hasActiveRideContext) {
      const nearbyNoSynthetic = await discoverNearbyGarages({
        lat: origin.lat,
        lng: origin.lng,
        limit,
        allowSynthetic: true,
      });

      return {
        source: nearbyNoSynthetic.source,
        garages: nearbyNoSynthetic.garages,
      };
    }
  }

  const nearby = await discoverNearbyGarages({
    lat: origin.lat,
    lng: origin.lng,
    limit,
    allowSynthetic: true,
  });

  return {
    source: nearby.source,
    garages: nearby.garages,
  };
};

export const storeRouteGaragesForOtpCode = async ({ otpCode, limit = 12 }) => {
  if (!otpCode) {
    return null;
  }

  const ride = await getRideByOtp(String(otpCode));
  if (!ride) {
    return null;
  }

  if (
    !Number.isFinite(Number(ride.start_lat)) ||
    !Number.isFinite(Number(ride.start_lng)) ||
    !Number.isFinite(Number(ride.end_lat)) ||
    !Number.isFinite(Number(ride.end_lng))
  ) {
    return null;
  }

  return discoverAndStoreRouteGarages({
    rideId: ride.ride_id,
    startLat: ride.start_lat,
    startLng: ride.start_lng,
    endLat: ride.end_lat,
    endLng: ride.end_lng,
    limit,
  });
};
