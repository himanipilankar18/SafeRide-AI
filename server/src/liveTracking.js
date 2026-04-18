import { WebSocketServer } from "ws";

// Store active trips: { tripId: { driver: ws, passenger: ws, location, route } }
const activeTrips = new Map();

// Store connected clients
const clients = new Map();

export const initializeLiveTracking = (server) => {
  const wss = new WebSocketServer({ server });

  wss.on("error", (error) => {
    if (error?.code === "EADDRINUSE") {
      console.log("⚠️ WebSocket startup skipped because port is already in use by another backend instance.");
      return;
    }

    console.error("❌ WebSocket server error:", error);
  });

  wss.on("connection", (ws) => {
    const clientId = `client_${Date.now()}_${Math.random()}`;
    clients.set(clientId, ws);

    console.log(`🟢 Client connected: ${clientId}`);

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data);
        handleMessage(ws, clientId, message);
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Invalid message format",
          })
        );
      }
    });

    ws.on("close", () => {
      console.log(`🔴 Client disconnected: ${clientId}`);
      clients.delete(clientId);
      handleClientDisconnect(clientId);
    });

    ws.on("error", (error) => {
      console.error(`❌ WebSocket error for ${clientId}:`, error);
      clients.delete(clientId);
      handleClientDisconnect(clientId);
    });
  });

  return wss;
};

function handleMessage(ws, clientId, message) {
  const { type, tripId, role, data } = message;
  const resolvedTripId = String(tripId ?? data?.tripId ?? "").trim();
  const resolvedRole = String(role ?? data?.role ?? "").trim().toLowerCase();

  switch (type) {
    case "join_trip":
      if (!resolvedTripId || !resolvedRole) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "join_trip requires tripId and role",
          })
        );
        return;
      }
      handleJoinTrip(ws, clientId, resolvedTripId, resolvedRole);
      break;

    case "location_update":
      handleLocationUpdate(clientId, resolvedTripId, data || {});
      break;

    case "deviation_alert":
      handleDeviationAlert(clientId, resolvedTripId, data || {});
      break;

    case "trip_complete":
      handleTripComplete(tripId);
      break;

    default:
      console.warn(`Unknown message type: ${type}`);
  }
}

function handleJoinTrip(ws, clientId, tripId, role) {
  if (!activeTrips.has(tripId)) {
    activeTrips.set(tripId, {
      driver: null,
      passenger: null,
      location: null,
      route: null,
      clientMap: new Map(),
    });
  }

  const trip = activeTrips.get(tripId);
  trip.clientMap.set(clientId, { ws, role });

  if (role === "driver") {
    trip.driver = { clientId, ws };
  } else if (role === "passenger") {
    trip.passenger = { clientId, ws };
  }

  console.log(
    `👤 ${role} joined trip ${tripId} (client: ${clientId})`
  );

  ws.send(
    JSON.stringify({
      type: "trip_joined",
      tripId,
      role,
      message: `You joined as ${role}`,
    })
  );

  broadcastToTrip(tripId, {
    type: "user_joined",
    role,
    tripId,
  });
}

function handleLocationUpdate(clientId, tripId, data) {
  const trip = activeTrips.get(tripId);
  if (!trip) return;

  const { location, route } = data;

  trip.location = location;
  if (route) trip.route = route;

  // Broadcast to all clients in this trip
  broadcastToTrip(tripId, {
    type: "location_update",
    tripId,
    location,
    route: route || null,
    timestamp: Date.now(),
  });
}

function handleDeviationAlert(clientId, tripId, data) {
  const trip = activeTrips.get(tripId);
  if (!trip) return;

  const { severity, message, location, riskScore, trend } = data;

  console.log(
    `⚠️ Deviation alert in trip ${tripId}: ${message} (severity: ${severity})`
  );

  // Broadcast alert only to passenger in this trip
  if (trip.passenger) {
    trip.passenger.ws.send(
      JSON.stringify({
        type: "deviation_alert",
        tripId,
        severity, // "warning" | "danger"
        message,
        location,
        riskScore,
        trend,
        timestamp: Date.now(),
      })
    );
  }
}

function handleTripComplete(tripId) {
  const trip = activeTrips.get(tripId);
  if (!trip) return;

  console.log(`✅ Trip completed: ${tripId}`);

  broadcastToTrip(tripId, {
    type: "trip_complete",
    tripId,
    message: "Ride completed",
  });

  // Clean up after 30 seconds
  setTimeout(() => {
    activeTrips.delete(tripId);
  }, 30000);
}

function handleClientDisconnect(clientId) {
  // Find and clean up trip if passenger/driver disconnects
  for (const [tripId, trip] of activeTrips) {
    const clientEntry = trip.clientMap.get(clientId);
    if (clientEntry) {
      trip.clientMap.delete(clientId);

      if (clientEntry.role === "driver") {
        trip.driver = null;
      } else if (clientEntry.role === "passenger") {
        trip.passenger = null;
      }

      console.log(
        `🔌 ${clientEntry.role} disconnected from trip ${tripId}`
      );

      broadcastToTrip(tripId, {
        type: "user_disconnected",
        role: clientEntry.role,
        tripId,
      });

      // Clean up trip if both disconnected
      if (trip.clientMap.size === 0) {
        setTimeout(() => {
          activeTrips.delete(tripId);
        }, 10000);
      }
    }
  }
}

function broadcastToTrip(tripId, message) {
  const trip = activeTrips.get(tripId);
  if (!trip) return;

  const payload = JSON.stringify(message);
  for (const [, client] of trip.clientMap) {
    if (client.ws.readyState === 1) {
      // WebSocket.OPEN
      client.ws.send(payload);
    }
  }
}

export function emitTripEvent(tripId, event) {
  if (!tripId || !event) {
    return;
  }

  broadcastToTrip(String(tripId), {
    ...event,
    tripId: String(tripId),
    timestamp: Date.now(),
  });
}

export { activeTrips };
