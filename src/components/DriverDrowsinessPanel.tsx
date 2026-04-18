import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Eye, Shield } from "lucide-react";

export type DrowsinessState = "NORMAL" | "WARNING" | "CRITICAL";

export interface DrowsinessSample {
  state: DrowsinessState;
  fatigueScore: number;
  distractionScore: number;
  riskScore: number;
  confidence: number;
  timestamp: string;
  reason: string;
  blinkRatePerMinute: number;
  eyeClosureSeconds: number;
  yaw: number;
  pitch: number;
  roll: number;
  faceDetected: boolean;
  distractionReason: string;
  closureState: string;
  microsleepDetected: boolean;
  frequentBlinking: boolean;
}

interface DriverDrowsinessPanelProps {
  active: boolean;
  tripId?: string;
  onSample: (sample: DrowsinessSample) => void;
}

const DriverDrowsinessPanel = ({
  active,
  tripId,
  onSample,
}: DriverDrowsinessPanelProps) => {
  const [state, setState] = useState<DrowsinessState>("NORMAL");
  const [reason, setReason] = useState("Monitoring started");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [fatigueScore, setFatigueScore] = useState(8);
  const [distractionScore, setDistractionScore] = useState(4);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionKeyRef = useRef(`driver-monitor-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const firstInferenceRef = useRef(true);
  const inFlightRef = useRef(false);

  const detectionTickMs = 1200;

  const apiBase = useMemo(() => {
    const configured = import.meta.env.VITE_API_BASE_URL;
    if (typeof configured === "string" && configured.trim()) {
      const clean = configured.trim().replace(/\/$/, "");
      return clean.endsWith("/api") ? clean : `${clean}/api`;
    }

    return `${window.location.protocol}//${window.location.hostname}:5001/api`;
  }, []);

  const badgeClass = useMemo(() => {
    if (state === "CRITICAL") return "bg-red-100 text-red-700 border-red-200";
    if (state === "WARNING") return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  }, [state]);

  useEffect(() => {
    let cancelled = false;

    const startCamera = async () => {
      if (!active) {
        return;
      }

      try {
        setCameraError(null);
        setCameraReady(false);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }

        setCameraReady(true);
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error && error.message
              ? error.message
              : "Unable to start camera for drowsiness monitoring.";
          setCameraError(message);
        }
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      firstInferenceRef.current = true;
      inFlightRef.current = false;
      setCameraReady(false);
    };
  }, [active]);

  useEffect(() => {
    if (!active || !cameraReady || !videoRef.current) {
      return;
    }

    const analyzeFrame = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || inFlightRef.current) {
        return;
      }

      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      ctx.drawImage(video, 0, 0, width, height);
      const frameDataUrl = canvas.toDataURL("image/jpeg", 0.85);

      inFlightRef.current = true;
      try {
        const response = await fetch(`${apiBase}/rides/drowsiness/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            frameDataUrl,
            sessionKey: sessionKeyRef.current,
            reset: firstInferenceRef.current,
            tripId,
          }),
        });

        const payload = await response.json();
        if (!response.ok || !payload?.success || !payload?.result) {
          throw new Error(payload?.message || "Inference request failed");
        }

        firstInferenceRef.current = false;

        const result = payload.result;
        const nextState: DrowsinessState =
          result.state === "CRITICAL" || result.state === "WARNING"
            ? result.state
            : "NORMAL";
        const nextFatigue = Number.isFinite(Number(result.fatigueScore))
          ? Math.max(0, Math.min(100, Number(result.fatigueScore)))
          : 0;
        const nextDistraction = Number.isFinite(Number(result.distractionScore))
          ? Math.max(0, Math.min(100, Number(result.distractionScore)))
          : 0;
        const confidence = Number.isFinite(Number(result.confidence))
          ? Math.max(0, Math.min(1, Number(result.confidence)))
          : 0.5;
        const riskScore = Number.isFinite(Number(result.riskScore))
          ? Math.max(0, Math.min(100, Number(result.riskScore)))
          : 0;
        const nextReason =
          typeof result.reason === "string" && result.reason.trim()
            ? result.reason
            : "model_update";
        const blinkRatePerMinute = Number.isFinite(Number(result.blinkRatePerMinute))
          ? Math.max(0, Number(result.blinkRatePerMinute))
          : 0;
        const eyeClosureSeconds = Number.isFinite(Number(result.eyeClosureSeconds))
          ? Math.max(0, Number(result.eyeClosureSeconds))
          : 0;
        const yaw = Number.isFinite(Number(result.yaw)) ? Number(result.yaw) : 0;
        const pitch = Number.isFinite(Number(result.pitch)) ? Number(result.pitch) : 0;
        const roll = Number.isFinite(Number(result.roll)) ? Number(result.roll) : 0;
        const faceDetected = Boolean(result.faceDetected);
        const distractionReason =
          typeof result.distractionReason === "string"
            ? result.distractionReason
            : "";
        const closureState =
          typeof result.fatigueFlags?.closureState === "string"
            ? result.fatigueFlags.closureState
            : "open";
        const microsleepDetected = Boolean(result.fatigueFlags?.microsleep);
        const frequentBlinking = Boolean(result.fatigueFlags?.frequentBlinking);

        setState(nextState);
        setReason(nextReason);
        setFatigueScore(nextFatigue);
        setDistractionScore(nextDistraction);
        setCameraError(null);

        onSample({
          state: nextState,
          fatigueScore: Number((nextFatigue / 100).toFixed(4)),
          distractionScore: Number((nextDistraction / 100).toFixed(4)),
          riskScore: Number(riskScore.toFixed(2)),
          confidence: Number(confidence.toFixed(4)),
          timestamp: new Date().toISOString(),
          reason: nextReason,
          blinkRatePerMinute: Number(blinkRatePerMinute.toFixed(2)),
          eyeClosureSeconds: Number(eyeClosureSeconds.toFixed(2)),
          yaw: Number(yaw.toFixed(2)),
          pitch: Number(pitch.toFixed(2)),
          roll: Number(roll.toFixed(2)),
          faceDetected,
          distractionReason,
          closureState,
          microsleepDetected,
          frequentBlinking,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Model inference is unavailable.";
        setCameraError(message);
      } finally {
        inFlightRef.current = false;
      }
    };

    const intervalId = window.setInterval(() => {
      analyzeFrame().catch(() => undefined);
    }, detectionTickMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [active, apiBase, cameraReady, onSample, tripId]);

  return (
    <div className="rounded-2xl border border-white/25 bg-white/95 p-3 text-gray-900 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-gray-700">
          Drowsiness Monitor
        </p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass}`}>
          {state}
        </span>
      </div>

      <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="h-28 w-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-gray-100 px-2 py-1.5">
          <p className="text-[10px] font-semibold text-gray-500">Fatigue</p>
          <p className="text-xs font-extrabold text-gray-800">{Math.round(fatigueScore)}%</p>
        </div>
        <div className="rounded-lg bg-gray-100 px-2 py-1.5">
          <p className="text-[10px] font-semibold text-gray-500">Attention Drift</p>
          <p className="text-xs font-extrabold text-gray-800">{Math.round(distractionScore)}%</p>
        </div>
      </div>

      <p className="mt-2 text-[11px] font-medium text-gray-600">
        {cameraError ? cameraError : reason}
      </p>

      <div className="mt-2 flex items-center gap-2 text-[10px] font-semibold text-gray-500">
        <span className="inline-flex items-center gap-1">
          <Camera size={12} /> {cameraReady ? "Live" : "Starting"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Eye size={12} /> In-app only
        </span>
        <span className="inline-flex items-center gap-1">
          {state === "CRITICAL" ? <AlertTriangle size={12} /> : <Shield size={12} />} Alert ready
        </span>
      </div>
    </div>
  );
};

export default DriverDrowsinessPanel;
