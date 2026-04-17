export type LatLng = {
  lat: number;
  lng: number;
};

const EARTH_RADIUS_KM = 6371;

export const toRad = (value: number): number => (value * Math.PI) / 180;

export const haversineKm = (a: LatLng, b: LatLng): number => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
};

export const interpolatePath = (from: LatLng, to: LatLng, points = 24): LatLng[] => {
  const path: LatLng[] = [];

  for (let i = 0; i <= points; i += 1) {
    const t = i / points;
    const curve = Math.sin(t * Math.PI) * 0.0018;

    path.push({
      lat: from.lat + (to.lat - from.lat) * t + curve,
      lng: from.lng + (to.lng - from.lng) * t - curve * 0.9,
    });
  }

  return path;
};
