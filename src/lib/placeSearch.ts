import { LatLng } from "@/lib/navigationSafety";

export type PlaceSuggestion = LatLng & {
  label: string;
};

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/search";
const LANDMARK_QUERIES = ["landmark", "hospital", "mall", "metro station", "park"];

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
