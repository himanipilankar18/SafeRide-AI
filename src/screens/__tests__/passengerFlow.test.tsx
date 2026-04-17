import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomeScreen from "@/screens/HomeScreen";
import MonitoringScreen from "@/screens/MonitoringScreen";
import { TripConfig } from "@/screens/HomeScreen";

const baseTrip: TripConfig = {
  sourceLabel: "MG Road, Bangalore",
  destinationLabel: "Koramangala, Bangalore",
  source: { lat: 12.9758, lng: 77.6058 },
  destination: { lat: 12.9352, lng: 77.6245 },
  toleranceKm: 0.3,
  sampleIntervalSec: 5,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("passenger trip flow", () => {
  it("starts ride with required sampling and tolerance config", async () => {
    const onStartRide = vi.fn();

    render(<HomeScreen onStartRide={onStartRide} onNavigate={() => undefined} />);

    fireEvent.change(screen.getByPlaceholderText("Enter pickup location"), {
      target: { value: "MG Road, Bangalore" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter drop-off location"), {
      target: { value: "Koramangala, Bangalore" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Start Ride" }));

    await waitFor(() => expect(onStartRide).toHaveBeenCalledTimes(1));
    expect(onStartRide).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLabel: expect.stringContaining("MG Road"),
        destinationLabel: expect.stringContaining("Koramangala"),
        sampleIntervalSec: 5,
        toleranceKm: 0.3,
      }),
    );
  });

  it("shows the navigation ride view with map mode controls", async () => {
    const onTripChange = vi.fn();
    const onEmergency = vi.fn();

    render(
      <MonitoringScreen
        onEmergency={onEmergency}
        onNavigate={() => undefined}
        tripConfig={baseTrip}
        onTripChange={onTripChange}
      />,
    );

    expect(screen.getByText("Ride Mode Active")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3d" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2d" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "offline" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "offline" }));
    expect(screen.getByText("toward destination")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Emergency" }));
    expect(onEmergency).toHaveBeenCalledTimes(1);
  });

  it("shows ride choices when no trip is active", () => {
    render(
      <MonitoringScreen
        onEmergency={() => undefined}
        onNavigate={() => undefined}
        tripConfig={baseTrip}
        onTripChange={() => undefined}
        hasActiveTrip={false}
      />,
    );

    expect(screen.getByText("No ride active")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join a Ride" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous Rides" })).toBeInTheDocument();
  });
});
