import "@testing-library/jest-dom";
import React from "react";
import { vi } from "vitest";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

vi.mock("leaflet", () => ({
  default: {
    divIcon: () => ({}),
  },
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "leaflet-map" }, children),
  TileLayer: () => null,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => ({
    setView: () => undefined,
    getZoom: () => 13,
  }),
  useMapEvents: () => ({
    setView: () => undefined,
    getZoom: () => 13,
  }),
}));

Object.defineProperty(navigator, "geolocation", {
  writable: true,
  value: {
    getCurrentPosition: (success: PositionCallback) =>
      success({
        coords: {
          latitude: 12.9758,
          longitude: 77.6058,
          accuracy: 5,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      } as GeolocationPosition),
    watchPosition: (success: PositionCallback) => {
      success({
        coords: {
          latitude: 12.9758,
          longitude: 77.6058,
          accuracy: 5,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      } as GeolocationPosition);
      return 1;
    },
    clearWatch: () => undefined,
  },
});

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();

    if (url.includes("nominatim.openstreetmap.org/search")) {
      const searchUrl = new URL(url);
      const query = searchUrl.searchParams.get("q")?.toLowerCase() ?? "";

      const placeMap: Record<string, { lat: number; lon: number; display_name: string }> = {
        "mg road, bangalore": { lat: 12.9758, lon: 77.6058, display_name: "MG Road, Bengaluru, Karnataka, India" },
        "koramangala, bangalore": { lat: 12.9352, lon: 77.6245, display_name: "Koramangala, Bengaluru, Karnataka, India" },
        "indiranagar, bangalore": { lat: 12.9719, lon: 77.6412, display_name: "Indiranagar, Bengaluru, Karnataka, India" },
        "majestic, bangalore": { lat: 12.9784, lon: 77.5727, display_name: "Majestic, Bengaluru, Karnataka, India" },
        "electronic city, bangalore": { lat: 12.8399, lon: 77.677, display_name: "Electronic City, Bengaluru, Karnataka, India" },
      };

      const matched = Object.entries(placeMap).find(([key]) => query.includes(key));

      return {
        ok: true,
        json: async () => (matched ? [matched[1]] : []),
      };
    }

    if (url.includes("router.project-osrm.org/route/v1/driving")) {
      return {
        ok: true,
        json: async () => ({ routes: [{ geometry: { coordinates: [[77.6058, 12.9758], [77.6245, 12.9352]] } }] }),
      };
    }

    return {
      ok: true,
      json: async () => ({}),
    };
  }),
);
