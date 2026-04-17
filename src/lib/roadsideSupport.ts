import { LatLng, haversineKm } from "@/lib/navigationSafety";

export type NearbyGarage = {
  id: string;
  name: string;
  phone: string;
  address: string;
  location: LatLng;
  services: string[];
};

export type NearbyHospital = {
  id: string;
  name: string;
  phone: string;
  address: string;
  location: LatLng;
};

export type NearbyDriver = {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  rating: number;
  location: LatLng;
};

export type DistanceEntry<T> = {
  item: T;
  distanceKm: number;
};

export type DriverIncidentRecord = {
  reason: "puncture" | "mechanical";
  location: LatLng;
  reportedAt: string;
  nearestGarage?: {
    name: string;
    phone: string;
    distanceKm: number;
  };
};

const GARAGE_CACHE_KEY = "saferide_cached_nearby_garages";
const HOSPITAL_CACHE_KEY = "saferide_cached_nearby_hospitals";
const INCIDENT_KEY = "saferide_driver_vehicle_issue";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const NOMINATIM_REVERSE_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const reverseAddressCache = new Map<string, string>();

const GARAGE_DIRECTORY: NearbyGarage[] = [
  {
    id: "garage-mg-1",
    name: "City Tyre & Wheel Care",
    phone: "+919845001122",
    address: "1st Cross, MG Road, Bengaluru",
    location: { lat: 12.9751, lng: 77.6037 },
    services: ["Tyre puncture", "Wheel alignment", "Battery jumpstart"],
  },
  {
    id: "garage-kora-1",
    name: "Koramangala Auto Rescue",
    phone: "+919845003344",
    address: "80 Feet Road, Koramangala 4th Block, Bengaluru",
    location: { lat: 12.9348, lng: 77.6201 },
    services: ["Mechanical repair", "Breakdown towing", "Engine diagnostics"],
  },
  {
    id: "garage-indi-1",
    name: "Indiranagar Rapid Garage",
    phone: "+919845005566",
    address: "CMH Road, Indiranagar, Bengaluru",
    location: { lat: 12.9783, lng: 77.6408 },
    services: ["Puncture fix", "Clutch issues", "Starter motor repair"],
  },
  {
    id: "garage-eco-1",
    name: "East Bengaluru Motor Clinic",
    phone: "+919845007788",
    address: "HAL 2nd Stage, Bengaluru",
    location: { lat: 12.9654, lng: 77.6388 },
    services: ["Suspension", "Tyre replacement", "Electrical checks"],
  },
  {
    id: "garage-jaya-1",
    name: "Jayanagar Emergency Garage",
    phone: "+919845009900",
    address: "11th Main, Jayanagar, Bengaluru",
    location: { lat: 12.9289, lng: 77.5835 },
    services: ["Roadside support", "Fuel delivery", "Minor repairs"],
  },
];

const HOSPITAL_DIRECTORY: NearbyHospital[] = [
  {
    id: "hospital-kh-1",
    name: "BMC Civil Hospital",
    phone: "+912228962100",
    address: "Brahma Kumaris Marg, Kandivali East, Mumbai",
    location: { lat: 19.2094, lng: 72.8617 },
  },
  {
    id: "hospital-kh-2",
    name: "Karuna Hospital",
    phone: "+912228063000",
    address: "Shivaji Nagar, Dahisar East, Mumbai",
    location: { lat: 19.2572, lng: 72.8641 },
  },
  {
    id: "hospital-kh-3",
    name: "Apex Multi Speciality Hospital",
    phone: "+912228953333",
    address: "Western Express Highway, Borivali East, Mumbai",
    location: { lat: 19.2349, lng: 72.8568 },
  },
];

const DRIVER_DIRECTORY: NearbyDriver[] = [
  {
    id: "driver-1",
    name: "Arjun S",
    phone: "+919876540111",
    vehicle: "Hyundai i20 KA-03-AA-4411",
    rating: 4.8,
    location: { lat: 12.9742, lng: 77.6071 },
  },
  {
    id: "driver-2",
    name: "Megha R",
    phone: "+919876540222",
    vehicle: "Maruti Dzire KA-05-BB-5522",
    rating: 4.9,
    location: { lat: 12.9686, lng: 77.6169 },
  },
  {
    id: "driver-3",
    name: "Rahul K",
    phone: "+919876540333",
    vehicle: "Honda Amaze KA-04-CC-6633",
    rating: 4.7,
    location: { lat: 12.9432, lng: 77.6112 },
  },
  {
    id: "driver-4",
    name: "Nisha P",
    phone: "+919876540444",
    vehicle: "Toyota Etios KA-01-DD-7744",
    rating: 4.85,
    location: { lat: 12.9363, lng: 77.6244 },
  },
];

const rankByDistance = <T extends { location: LatLng }>(
  origin: LatLng,
  list: T[],
): DistanceEntry<T>[] =>
  list
    .map((item) => ({
      item,
      distanceKm: haversineKm(origin, item.location),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

const readCachedGarages = (): NearbyGarage[] => {
  try {
    const raw = window.localStorage.getItem(GARAGE_CACHE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as { garages?: NearbyGarage[] };
    return Array.isArray(parsed.garages) ? parsed.garages : [];
  } catch {
    return [];
  }
};

const readCachedHospitals = (): NearbyHospital[] => {
  try {
    const raw = window.localStorage.getItem(HOSPITAL_CACHE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as { hospitals?: NearbyHospital[] };
    return Array.isArray(parsed.hospitals) ? parsed.hospitals : [];
  } catch {
    return [];
  }
};

const writeCachedGarages = (garages: NearbyGarage[]) => {
  try {
    window.localStorage.setItem(
      GARAGE_CACHE_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        garages,
      }),
    );
  } catch {
    // Ignore localStorage quota or private-mode errors.
  }
};

const writeCachedHospitals = (hospitals: NearbyHospital[]) => {
  try {
    window.localStorage.setItem(
      HOSPITAL_CACHE_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        hospitals,
      }),
    );
  } catch {
    // Ignore localStorage quota or private-mode errors.
  }
};

const toAddressText = (tags: Record<string, string> | undefined) => {
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

const toPhoneText = (tags: Record<string, string> | undefined) =>
  String(
    tags?.phone ||
      tags?.["contact:phone"] ||
      tags?.["contact:mobile"] ||
      "Phone unavailable",
  ).trim();

const isFiniteCoordinate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const formatReverseAddress = (payload: {
  display_name?: string;
  address?: Record<string, string>;
}) => {
  const addr = payload.address || {};
  const pieces = [
    addr.shop,
    addr.road,
    addr.neighbourhood,
    addr.suburb,
    addr.city,
    addr.town,
    addr.village,
  ].filter(Boolean);

  if (pieces.length > 0) {
    return pieces.slice(0, 4).join(", ");
  }

  if (typeof payload.display_name === "string" && payload.display_name.trim()) {
    return payload.display_name.split(",").slice(0, 4).join(",").trim();
  }

  return "";
};

const reverseGeocodeAddress = async (lat: number, lng: number) => {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = reverseAddressCache.get(key);
  if (cached) {
    return cached;
  }

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 2200);
    const url = new URL(NOMINATIM_REVERSE_ENDPOINT);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "Accept-Language": "en",
      },
    });
    window.clearTimeout(timeoutId);

    if (!response.ok) {
      return "";
    }

    const payload = (await response.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };

    const resolved = formatReverseAddress(payload);
    if (resolved) {
      reverseAddressCache.set(key, resolved);
    }

    return resolved;
  } catch {
    return "";
  }
};

const fetchGaragesFromOverpass = async (
  origin: LatLng,
): Promise<NearbyGarage[]> => {
  const radiusMeters = 5000;
  const query = `[out:json][timeout:20];(node[\"shop\"=\"car_repair\"](around:${radiusMeters},${origin.lat},${origin.lng});node[\"amenity\"=\"car_repair\"](around:${radiusMeters},${origin.lat},${origin.lng});way[\"shop\"=\"car_repair\"](around:${radiusMeters},${origin.lat},${origin.lng});way[\"amenity\"=\"car_repair\"](around:${radiusMeters},${origin.lat},${origin.lng});relation[\"shop\"=\"car_repair\"](around:${radiusMeters},${origin.lat},${origin.lng});relation[\"amenity\"=\"car_repair\"](around:${radiusMeters},${origin.lat},${origin.lng}););out center tags;`;

  let lastError: unknown = null;

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

      const payload = (await response.json()) as {
        elements?: Array<{
          id: number;
          type: string;
          lat?: number;
          lon?: number;
          center?: { lat?: number; lon?: number };
          tags?: Record<string, string>;
        }>;
      };

      const elements = Array.isArray(payload.elements) ? payload.elements : [];

      const garages = elements
        .map((element) => {
          const lat =
            element.lat ??
            (isFiniteCoordinate(element.center?.lat)
              ? element.center?.lat
              : undefined);
          const lng =
            element.lon ??
            (isFiniteCoordinate(element.center?.lon)
              ? element.center?.lon
              : undefined);

          if (!isFiniteCoordinate(lat) || !isFiniteCoordinate(lng)) {
            return null;
          }

          const name =
            String(element.tags?.name || "Nearby Garage").trim() ||
            "Nearby Garage";
          const address = toAddressText(element.tags);

          return {
            id: `osm-${element.type}-${element.id}`,
            name,
            phone: toPhoneText(element.tags),
            address,
            location: { lat, lng },
            services: ["Roadside assistance", "Mechanical support"],
          } satisfies NearbyGarage;
        })
        .filter((item): item is NearbyGarage => Boolean(item));

      const unresolved = garages
        .filter((garage) => garage.address === "Address unavailable")
        .slice(0, 6);

      if (unresolved.length > 0) {
        await Promise.all(
          unresolved.map(async (garage) => {
            const resolved = await reverseGeocodeAddress(
              garage.location.lat,
              garage.location.lng,
            );

            garage.address =
              resolved ||
              `Near ${garage.location.lat.toFixed(4)}, ${garage.location.lng.toFixed(4)}`;
          }),
        );
      }

      if (garages.length > 0) {
        return garages;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to fetch nearby garages from map service.");
};

const fetchHospitalsFromOverpass = async (
  origin: LatLng,
): Promise<NearbyHospital[]> => {
  const radiusMeters = 7000;
  const query = `[out:json][timeout:20];(node["amenity"="hospital"](around:${radiusMeters},${origin.lat},${origin.lng});way["amenity"="hospital"](around:${radiusMeters},${origin.lat},${origin.lng});relation["amenity"="hospital"](around:${radiusMeters},${origin.lat},${origin.lng}););out center tags;`;

  let lastError: unknown = null;

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

      const payload = (await response.json()) as {
        elements?: Array<{
          id: number;
          type: string;
          lat?: number;
          lon?: number;
          center?: { lat?: number; lon?: number };
          tags?: Record<string, string>;
        }>;
      };

      const elements = Array.isArray(payload.elements) ? payload.elements : [];

      const hospitals = elements
        .map((element) => {
          const lat =
            element.lat ??
            (isFiniteCoordinate(element.center?.lat)
              ? element.center?.lat
              : undefined);
          const lng =
            element.lon ??
            (isFiniteCoordinate(element.center?.lon)
              ? element.center?.lon
              : undefined);

          if (!isFiniteCoordinate(lat) || !isFiniteCoordinate(lng)) {
            return null;
          }

          const name =
            String(element.tags?.name || "Nearby Hospital").trim() ||
            "Nearby Hospital";

          return {
            id: `osm-hospital-${element.type}-${element.id}`,
            name,
            phone: toPhoneText(element.tags),
            address: toAddressText(element.tags),
            location: { lat, lng },
          } satisfies NearbyHospital;
        })
        .filter((item): item is NearbyHospital => Boolean(item));

      if (hospitals.length > 0) {
        return hospitals;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to fetch nearby hospitals from map service.");
};

export const getNearbyGarages = async (
  origin: LatLng,
  limit = 3,
): Promise<{
  garages: DistanceEntry<NearbyGarage>[];
  source: "online" | "offline-cache";
}> => {
  const online = typeof navigator !== "undefined" ? navigator.onLine : true;

  if (!online) {
    const cached = readCachedGarages();
    const fallback = cached.length > 0 ? cached : GARAGE_DIRECTORY;
    return {
      garages: rankByDistance(origin, fallback).slice(0, limit),
      source: "offline-cache",
    };
  }

  try {
    const liveGarages = await fetchGaragesFromOverpass(origin);
    writeCachedGarages(liveGarages);

    return {
      garages: rankByDistance(origin, liveGarages).slice(0, limit),
      source: "online",
    };
  } catch {
    const cached = readCachedGarages();
    const fallback = cached.length > 0 ? cached : GARAGE_DIRECTORY;

    return {
      garages: rankByDistance(origin, fallback).slice(0, limit),
      source: "offline-cache",
    };
  }
};

export const getNearbyHospitals = async (
  origin: LatLng,
  limit = 3,
): Promise<{
  hospitals: DistanceEntry<NearbyHospital>[];
  source: "online" | "offline-cache";
}> => {
  const online = typeof navigator !== "undefined" ? navigator.onLine : true;

  if (!online) {
    const cached = readCachedHospitals();
    const fallback = cached.length > 0 ? cached : HOSPITAL_DIRECTORY;
    return {
      hospitals: rankByDistance(origin, fallback).slice(0, limit),
      source: "offline-cache",
    };
  }

  try {
    const liveHospitals = await fetchHospitalsFromOverpass(origin);
    writeCachedHospitals(liveHospitals);

    return {
      hospitals: rankByDistance(origin, liveHospitals).slice(0, limit),
      source: "online",
    };
  } catch {
    const cached = readCachedHospitals();
    const fallback = cached.length > 0 ? cached : HOSPITAL_DIRECTORY;

    return {
      hospitals: rankByDistance(origin, fallback).slice(0, limit),
      source: "offline-cache",
    };
  }
};

export const getNearestAvailableDriver = (
  origin: LatLng,
): DistanceEntry<NearbyDriver> | null => {
  const ranked = rankByDistance(origin, DRIVER_DIRECTORY);
  return ranked.length > 0 ? ranked[0] : null;
};

export const reportDriverIncident = (incident: DriverIncidentRecord) => {
  try {
    window.localStorage.setItem(INCIDENT_KEY, JSON.stringify(incident));
    window.dispatchEvent(new Event("saferide-driver-incident"));
  } catch {
    // Ignore localStorage event failures.
  }
};

export const clearDriverIncident = () => {
  try {
    window.localStorage.removeItem(INCIDENT_KEY);
    window.dispatchEvent(new Event("saferide-driver-incident"));
  } catch {
    // Ignore localStorage event failures.
  }
};

export const getDriverIncident = (): DriverIncidentRecord | null => {
  try {
    const raw = window.localStorage.getItem(INCIDENT_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as DriverIncidentRecord;
  } catch {
    return null;
  }
};
