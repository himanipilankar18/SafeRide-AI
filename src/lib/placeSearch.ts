import { LatLng } from "@/lib/navigationSafety";

export type PlaceSuggestion = LatLng & {
  label: string;
};

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
const LANDMARK_QUERIES = [
  "landmark",
  "college",
  "institute",
  "university",
  "school",
  "hospital",
  "mall",
  "metro station",
  "park",
];

const toRadians = (value: number) => (value * Math.PI) / 180;

const haversineMeters = (a: LatLng, b: LatLng) => {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const q =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(q));
};

const compactDisplayName = (displayName: string) =>
  displayName
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");

const firstValidField = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const isRoadLike = (value: string) => {
  const lower = value.toLowerCase();
  return lower.includes("road") || lower.includes("marg") || lower.includes("street") || lower.includes("lane");
};

const normalizePlace = (item: Record<string, unknown>): PlaceSuggestion | null => {
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  const displayName = item.display_name;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || typeof displayName !== "string") {
    return null;
  }

  return {
    lat,
    lng,
    label: displayName,
  };
};

export const searchPlaces = async (query: string, limit = 5): Promise<PlaceSuggestion[]> => {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 3) {
    return [];
  }

  const searchUrl = new URL(NOMINATIM_BASE_URL);
  searchUrl.searchParams.set("q", trimmedQuery);
  searchUrl.searchParams.set("format", "jsonv2");
  searchUrl.searchParams.set("addressdetails", "1");
  searchUrl.searchParams.set("limit", String(limit));

  const response = await fetch(searchUrl.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as Array<Record<string, unknown>>;
  return payload.map(normalizePlace).filter((item): item is PlaceSuggestion => item !== null);
};

export const geocodePlace = async (query: string): Promise<PlaceSuggestion | null> => {
  const results = await searchPlaces(query, 1);
  return results[0] ?? null;
};

export const searchNearbyLandmarks = async (center: LatLng, limit = 5): Promise<PlaceSuggestion[]> => {
  const delta = 0.03;
  const seen = new Set<string>();
  const results: PlaceSuggestion[] = [];

  for (const query of LANDMARK_QUERIES) {
    if (results.length >= limit) {
      break;
    }

    const searchUrl = new URL(NOMINATIM_BASE_URL);
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("format", "jsonv2");
    searchUrl.searchParams.set("addressdetails", "1");
    searchUrl.searchParams.set("limit", String(limit));
    searchUrl.searchParams.set(
      "viewbox",
      `${center.lng - delta},${center.lat + delta},${center.lng + delta},${center.lat - delta}`,
    );
    searchUrl.searchParams.set("bounded", "1");

    try {
      const response = await fetch(searchUrl.toString(), {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as Array<Record<string, unknown>>;
      for (const place of payload.map(normalizePlace).filter((item): item is PlaceSuggestion => item !== null)) {
        const key = `${place.label.toLowerCase()}-${place.lat.toFixed(5)}-${place.lng.toFixed(5)}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        results.push(place);
        if (results.length >= limit) {
          break;
        }
      }
    } catch {
      // Keep the source picker usable even if nearby suggestions fail.
    }
  }

  return results;
};

export const reverseGeocodePlace = async (location: LatLng): Promise<string | null> => {
  const reverseUrl = new URL(NOMINATIM_REVERSE_URL);
  reverseUrl.searchParams.set("lat", String(location.lat));
  reverseUrl.searchParams.set("lon", String(location.lng));
  reverseUrl.searchParams.set("format", "jsonv2");
  reverseUrl.searchParams.set("zoom", "18");
  reverseUrl.searchParams.set("addressdetails", "1");
  reverseUrl.searchParams.set("namedetails", "1");

  try {
    const response = await fetch(reverseUrl.toString(), {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      display_name?: unknown;
      name?: unknown;
      address?: unknown;
      namedetails?: unknown;
    };

    const address =
      payload.address && typeof payload.address === "object"
        ? (payload.address as Record<string, unknown>)
        : {};
    const namedetails =
      payload.namedetails && typeof payload.namedetails === "object"
        ? (payload.namedetails as Record<string, unknown>)
        : {};

    const primaryName =
      (typeof payload.name === "string" && payload.name.trim())
        ? payload.name.trim()
        : firstValidField(namedetails, ["name", "name:en"]);

    const poiName =
      firstValidField(address, [
        "college",
        "university",
        "school",
        "hospital",
        "amenity",
        "building",
        "attraction",
      ]) || primaryName;

    const areaName = firstValidField(address, ["suburb", "neighbourhood", "city_district", "city", "town", "village"]);

    if (poiName && !isRoadLike(poiName)) {
      if (areaName && !poiName.toLowerCase().includes(areaName.toLowerCase())) {
        return `${poiName}, ${areaName}`;
      }
      return poiName;
    }

    const nearby = await searchNearbyLandmarks(location, 8);
    if (nearby.length > 0) {
      const nearest = nearby
        .map((place) => ({
          place,
          distance: haversineMeters(location, { lat: place.lat, lng: place.lng }),
        }))
        .sort((a, b) => a.distance - b.distance)[0];

      if (nearest.distance <= 350) {
        return compactDisplayName(nearest.place.label);
      }
    }

    if (typeof payload.display_name !== "string" || !payload.display_name.trim()) {
      return null;
    }

    return compactDisplayName(payload.display_name);
  } catch {
    return null;
  }
};
