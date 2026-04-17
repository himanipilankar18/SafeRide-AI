const CACHE_KEY = "saferide_driver_gps_cache";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readCache = () => {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const writeCache = (updates) => {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(updates));
  } catch {
    // Cache write may fail in restricted browser mode.
  }
};

const haversineMeters = (a, b) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const q =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(q));
};

export class SafeRideDriverTracker {
  constructor({
    apiBaseUrl,
    wsUrl,
    tripId,
    driverId,
    updateIntervalMs = 3000,
    minMovementMeters = 8,
    getRiskInputs = () => ({ fatigue: 0, distraction: 0 }),
    onAlert = () => {},
  }) {
    this.apiBaseUrl = apiBaseUrl;
    this.wsUrl = wsUrl;
    this.tripId = tripId;
    this.driverId = driverId;
    this.updateIntervalMs = Math.max(2000, Math.min(5000, updateIntervalMs));
    this.minMovementMeters = Math.max(0, minMovementMeters);
    this.getRiskInputs = getRiskInputs;
    this.onAlert = onAlert;

    this.watchId = null;
    this.latestPosition = null;
    this.lastSentPosition = null;
    this.timer = null;
    this.ws = null;
    this.isSending = false;
    this.started = false;
  }

  async start() {
    if (this.started) {
      return;
    }
    this.started = true;

    this.startWebSocket();
    this.startGpsWatch();
    this.startUploadLoop();
    this.startConnectivitySync();

    await this.syncCachedUpdates();
  }

  stop() {
    this.started = false;

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  startGpsWatch() {
    if (!navigator.geolocation) {
      throw new Error("Geolocation is not supported by this browser.");
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.latestPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          timestamp: new Date(position.timestamp).toISOString(),
        };
      },
      (error) => {
        console.error("GPS watch error:", error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1500,
        timeout: 10000,
      }
    );
  }

  startUploadLoop() {
    this.timer = setInterval(() => {
      this.sendLatestUpdate().catch((error) => {
        console.error("Location send failed:", error.message);
      });
    }, this.updateIntervalMs);
  }

  startConnectivitySync() {
    window.addEventListener("online", () => {
      this.syncCachedUpdates().catch((error) => {
        console.error("Cache sync failed:", error.message);
      });
    });
  }

  startWebSocket() {
    if (!this.wsUrl) {
      return;
    }

    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      this.ws.send(
        JSON.stringify({
          type: "join_trip",
          tripId: String(this.tripId),
          role: "driver",
        })
      );
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "driver_alert") {
          this.simulateBuzzer(payload.level || "medium");
          this.onAlert(payload);
        }
      } catch (error) {
        console.error("Failed to parse WS message:", error);
      }
    };
  }

  async sendLatestUpdate() {
    if (!this.latestPosition || this.isSending) {
      return;
    }

    if (
      this.lastSentPosition &&
      haversineMeters(this.lastSentPosition, this.latestPosition) < this.minMovementMeters
    ) {
      return;
    }

    const { fatigue = 0, distraction = 0 } = this.getRiskInputs() || {};
    const payload = {
      trip_id: this.tripId,
      driver_id: this.driverId,
      lat: this.latestPosition.lat,
      lng: this.latestPosition.lng,
      timestamp: this.latestPosition.timestamp,
      fatigue_score: fatigue,
      distraction_score: distraction,
    };

    this.isSending = true;
    try {
      await this.postUpdate(payload);
      this.lastSentPosition = this.latestPosition;
    } catch (error) {
      this.cacheUpdate(payload);
      throw error;
    } finally {
      this.isSending = false;
    }
  }

  async postUpdate(payload) {
    const response = await fetch(`${this.apiBaseUrl}/update-location`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Update location failed with status ${response.status}`);
    }

    return response.json();
  }

  cacheUpdate(payload) {
    const cache = readCache();
    cache.push(payload);
    writeCache(cache.slice(-500));
  }

  async syncCachedUpdates() {
    if (!navigator.onLine) {
      return;
    }

    const cache = readCache();
    if (!cache.length) {
      return;
    }

    const pending = [...cache];
    writeCache([]);

    for (const update of pending) {
      try {
        await this.postUpdate(update);
        await sleep(80);
      } catch {
        const current = readCache();
        writeCache([update, ...current].slice(-500));
        break;
      }
    }
  }

  simulateBuzzer(level) {
    const pattern = level === "high" ? [200, 80, 200, 80, 220] : [140, 70, 140];
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = level === "high" ? 970 : 760;
    gainNode.gain.value = 0.08;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.2);
  }
}

/*
Sample usage:

import { SafeRideDriverTracker } from "@/lib/driverTrackingSample";

const tracker = new SafeRideDriverTracker({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL?.replace("/api", "") || "http://localhost:5001",
  wsUrl: import.meta.env.VITE_WS_BASE_URL || "ws://localhost:5001",
  tripId: 101,
  driverId: 7,
  updateIntervalMs: 3000,
  getRiskInputs: () => ({
    fatigue: window.__aiFatigueScore || 0,
    distraction: window.__aiDistractionScore || 0,
  }),
  onAlert: (alert) => {
    console.log("Driver alert", alert);
  },
});

tracker.start();

// later
// tracker.stop();
*/
