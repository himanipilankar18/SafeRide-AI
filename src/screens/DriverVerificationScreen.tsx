import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Play, ShieldCheck } from "lucide-react";

interface DriverVerificationScreenProps {
  phoneNumber: string;
  onVerified: () => void;
}

const FACE_STAGES = ["CENTER", "LEFT", "RIGHT"] as const;
type FaceStage = (typeof FACE_STAGES)[number];

const LIVE_AVG_THRESHOLD = 0.9;
const LIVE_MIN_THRESHOLD = 0.86;
const REGISTER_PAIRWISE_THRESHOLD = 0.68;

const DriverVerificationScreen = ({
  phoneNumber,
  onVerified,
}: DriverVerificationScreenProps) => {
  const [isOpeningCamera, setIsOpeningCamera] = useState(false);
  const [showInAppCamera, setShowInAppCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraMode, setCameraMode] = useState<"register" | "verify">(
    "register",
  );

  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [capturesByStage, setCapturesByStage] = useState<
    Record<FaceStage, string | null>
  >({
    CENTER: null,
    LEFT: null,
    RIGHT: null,
  });

  const [registeredEmbeddings, setRegisteredEmbeddings] = useState<
    Float32Array[]
  >([]);
  const [referenceEmbedding, setReferenceEmbedding] =
    useState<Float32Array | null>(null);
  const [hasLiveMlVerification, setHasLiveMlVerification] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (showInAppCamera && cameraStream) {
      video.srcObject = cameraStream;
      video.play().catch(() => {
        setError("Camera opened but preview could not start. Re-open camera.");
      });
      return;
    }

    video.srcObject = null;
  }, [cameraStream, showInAppCamera]);

  const currentStage = FACE_STAGES[currentStageIndex];
  const hasRegisteredFace =
    FACE_STAGES.every((stage) => Boolean(capturesByStage[stage])) &&
    Boolean(referenceEmbedding) &&
    registeredEmbeddings.length === 3;

  const toUserFriendlyError = (fallback: string, err: unknown) => {
    if (err instanceof Error && err.message.trim()) {
      return err.message;
    }
    return fallback;
  };

  const normalize = (vec: Float32Array) => {
    let norm = 0;
    for (let i = 0; i < vec.length; i += 1) {
      norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);
    if (norm === 0) {
      return vec;
    }
    const out = new Float32Array(vec.length);
    for (let i = 0; i < vec.length; i += 1) {
      out[i] = vec[i] / norm;
    }
    return out;
  };

  const cosineSimilarity = (a: Float32Array, b: Float32Array) => {
    const len = Math.min(a.length, b.length);
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < len; i += 1) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) {
      return 0;
    }
    return dot / Math.sqrt(na * nb);
  };

  const sleep = (ms: number) =>
    new Promise((resolve) => window.setTimeout(resolve, ms));

  const detectSingleFaceBox = async (sourceCanvas: HTMLCanvasElement) => {
    const FaceDetectorCtor = (window as unknown as { FaceDetector?: any })
      .FaceDetector;
    if (!FaceDetectorCtor) {
      return null;
    }

    const detector = new FaceDetectorCtor({
      fastMode: true,
      maxDetectedFaces: 5,
    });

    const faces = await detector.detect(sourceCanvas);
    if (!Array.isArray(faces) || faces.length !== 1) {
      throw new Error(
        "Exactly one face must be visible in frame. No bystanders in camera view.",
      );
    }

    const box = faces[0]?.boundingBox;
    if (!box || box.width < 24 || box.height < 24) {
      throw new Error(
        "Face is too small. Move closer and keep your face centered.",
      );
    }

    return {
      x: Number(box.x),
      y: Number(box.y),
      width: Number(box.width),
      height: Number(box.height),
    };
  };

  const extractFaceCanvas = async (image: HTMLImageElement) => {
    const source = document.createElement("canvas");
    source.width = image.naturalWidth || image.width;
    source.height = image.naturalHeight || image.height;
    const sourceCtx = source.getContext("2d");
    if (!sourceCtx) {
      throw new Error("Unable to process captured image.");
    }
    sourceCtx.drawImage(image, 0, 0, source.width, source.height);

    const detected = await detectSingleFaceBox(source);
    let cropX = 0;
    let cropY = 0;
    let cropW = source.width;
    let cropH = source.height;

    if (detected) {
      const padW = detected.width * 0.35;
      const padH = detected.height * 0.45;
      cropX = Math.max(0, Math.floor(detected.x - padW));
      cropY = Math.max(0, Math.floor(detected.y - padH));
      cropW = Math.min(
        source.width - cropX,
        Math.floor(detected.width + padW * 2),
      );
      cropH = Math.min(
        source.height - cropY,
        Math.floor(detected.height + padH * 2),
      );
    } else {
      // Fallback when FaceDetector API is unavailable.
      cropW = Math.floor(source.width * 0.72);
      cropH = Math.floor(source.height * 0.86);
      cropX = Math.floor((source.width - cropW) / 2);
      cropY = Math.floor((source.height - cropH) / 2);
    }

    const faceCanvas = document.createElement("canvas");
    faceCanvas.width = 128;
    faceCanvas.height = 128;
    const faceCtx = faceCanvas.getContext("2d");
    if (!faceCtx) {
      throw new Error("Unable to process face crop.");
    }

    faceCtx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, 128, 128);
    return faceCanvas;
  };

  const embeddingFromDataUrl = (dataUrl: string) =>
    new Promise<Float32Array>((resolve, reject) => {
      const image = new Image();
      image.onload = async () => {
        try {
          const faceCanvas = await extractFaceCanvas(image);
          const ctx = faceCanvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Unable to process image frame"));
            return;
          }

          const data = ctx.getImageData(0, 0, 128, 128).data;

          const gray = new Float32Array(128 * 128);
          let sum = 0;
          for (let i = 0; i < gray.length; i += 1) {
            const p = i * 4;
            const g =
              (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) /
              255;
            gray[i] = g;
            sum += g;
          }

          const mean = sum / gray.length;
          let variance = 0;
          for (let i = 0; i < gray.length; i += 1) {
            const d = gray[i] - mean;
            variance += d * d;
          }
          const std = Math.sqrt(variance / gray.length);

          if (std < 0.06) {
            reject(
              new Error("Image quality too low. Keep face clear and well-lit."),
            );
            return;
          }
          if (mean < 0.12 || mean > 0.92) {
            reject(
              new Error(
                "Lighting is not suitable. Avoid very dark or overexposed frames.",
              ),
            );
            return;
          }

          const coarse: number[] = [];
          for (let y = 0; y < 128; y += 4) {
            for (let x = 0; x < 128; x += 4) {
              coarse.push(gray[y * 128 + x]);
            }
          }

          const gradHist = new Float32Array(24);
          const intensityHist = new Float32Array(24);

          for (let y = 0; y < 128; y += 1) {
            for (let x = 0; x < 128; x += 1) {
              const idx = y * 128 + x;
              const center = gray[idx];

              const right = x < 127 ? gray[idx + 1] : center;
              const down = y < 127 ? gray[idx + 128] : center;
              const gx = right - center;
              const gy = down - center;
              const mag = Math.min(0.999, Math.sqrt(gx * gx + gy * gy));
              const gBin = Math.floor(mag * 24);
              gradHist[Math.min(23, Math.max(0, gBin))] += 1;

              const iBin = Math.floor(
                Math.min(0.999, Math.max(0, center)) * 24,
              );
              intensityHist[Math.min(23, Math.max(0, iBin))] += 1;
            }
          }

          const blockMeans: number[] = [];
          const blockStd: number[] = [];
          const blockSize = 16;
          for (let by = 0; by < 8; by += 1) {
            for (let bx = 0; bx < 8; bx += 1) {
              let blockSum = 0;
              let blockSq = 0;
              for (let y = 0; y < blockSize; y += 1) {
                for (let x = 0; x < blockSize; x += 1) {
                  const px = bx * blockSize + x;
                  const py = by * blockSize + y;
                  const value = gray[py * 128 + px];
                  blockSum += value;
                  blockSq += value * value;
                }
              }
              const n = blockSize * blockSize;
              const bMean = blockSum / n;
              const bVar = Math.max(0, blockSq / n - bMean * bMean);
              blockMeans.push(bMean);
              blockStd.push(Math.sqrt(bVar));
            }
          }

          const totalPixels = 128 * 128;
          for (let i = 0; i < 24; i += 1) {
            gradHist[i] /= totalPixels;
            intensityHist[i] /= totalPixels;
          }

          const signature = new Float32Array(
            coarse.length +
              gradHist.length +
              intensityHist.length +
              blockMeans.length +
              blockStd.length,
          );
          let cursor = 0;
          for (let i = 0; i < coarse.length; i += 1) {
            signature[cursor++] = coarse[i];
          }
          for (let i = 0; i < gradHist.length; i += 1) {
            signature[cursor++] = gradHist[i];
          }
          for (let i = 0; i < intensityHist.length; i += 1) {
            signature[cursor++] = intensityHist[i];
          }
          for (let i = 0; i < blockMeans.length; i += 1) {
            signature[cursor++] = blockMeans[i];
          }
          for (let i = 0; i < blockStd.length; i += 1) {
            signature[cursor++] = blockStd[i];
          }

          resolve(normalize(signature));
        } catch (e) {
          reject(
            e instanceof Error
              ? e
              : new Error("Failed to build in-app face signature"),
          );
        }
      };
      image.onerror = () => reject(new Error("Failed to read captured image"));
      image.src = dataUrl;
    });

  const averageEmbedding = (vectors: Float32Array[]) => {
    const len = vectors[0]?.length || 0;
    const avg = new Float32Array(len);
    for (const vec of vectors) {
      for (let i = 0; i < len; i += 1) {
        avg[i] += vec[i];
      }
    }
    for (let i = 0; i < len; i += 1) {
      avg[i] /= vectors.length;
    }
    return normalize(avg);
  };

  const minPairwiseSimilarity = (vectors: Float32Array[]) => {
    let minVal = 1;
    for (let i = 0; i < vectors.length; i += 1) {
      for (let j = i + 1; j < vectors.length; j += 1) {
        minVal = Math.min(minVal, cosineSimilarity(vectors[i], vectors[j]));
      }
    }
    return minVal;
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setShowInAppCamera(false);
  };

  const openInAppCamera = async (mode: "register" | "verify") => {
    setIsOpeningCamera(true);
    setError(null);
    setMessage(null);
    setCameraMode(mode);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera is not supported in this browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 960 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: false,
      });

      setCameraStream(stream);
      setShowInAppCamera(true);
      setMessage(
        mode === "register"
          ? "In-app ML capture: CENTER, LEFT, RIGHT."
          : "Live check mode: keep your face centered and verify.",
      );
    } catch (e) {
      if (e instanceof DOMException) {
        if (e.name === "NotAllowedError") {
          setError(
            "Camera permission denied. Allow camera access in browser/site settings.",
          );
        } else if (e.name === "NotFoundError") {
          setError("No camera device found.");
        } else if (e.name === "NotReadableError") {
          setError(
            "Camera is busy in another app/tab. Close other camera apps and retry.",
          );
        } else {
          setError(toUserFriendlyError("Failed to open in-app camera", e));
        }
      } else {
        setError(toUserFriendlyError("Failed to open in-app camera", e));
      }
    } finally {
      setIsOpeningCamera(false);
    }
  };

  const snapshotFromVideo = () => {
    if (!videoRef.current || !canvasRef.current) {
      throw new Error("Camera preview is not ready.");
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const width = video.videoWidth || 960;
    const height = video.videoHeight || 720;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to read camera frame.");
    }

    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.9);
  };

  const captureBurst = async (count: number, delayMs: number) => {
    const frames: string[] = [];
    for (let i = 0; i < count; i += 1) {
      frames.push(snapshotFromVideo());
      if (i < count - 1) {
        await sleep(delayMs);
      }
    }
    return frames;
  };

  const captureStage = async () => {
    setError(null);
    setMessage(null);

    try {
      const snapshot = snapshotFromVideo();

      setCapturesByStage((prev) => ({
        ...prev,
        [currentStage]: snapshot,
      }));

      if (currentStageIndex < FACE_STAGES.length - 1) {
        setCurrentStageIndex((value) => value + 1);
        setMessage(
          `${currentStage} captured. Now face ${FACE_STAGES[currentStageIndex + 1]}.`,
        );
        return;
      }

      const finalCaptures: Record<FaceStage, string> = {
        CENTER:
          currentStage === "CENTER"
            ? snapshot
            : capturesByStage.CENTER || snapshot,
        LEFT:
          currentStage === "LEFT" ? snapshot : capturesByStage.LEFT || snapshot,
        RIGHT:
          currentStage === "RIGHT"
            ? snapshot
            : capturesByStage.RIGHT || snapshot,
      };

      const vectors = await Promise.all([
        embeddingFromDataUrl(finalCaptures.CENTER),
        embeddingFromDataUrl(finalCaptures.LEFT),
        embeddingFromDataUrl(finalCaptures.RIGHT),
      ]);

      const pairMin = minPairwiseSimilarity(vectors);
      if (pairMin < REGISTER_PAIRWISE_THRESHOLD) {
        throw new Error(
          "Angles are inconsistent. Keep only one face in frame and retry capture.",
        );
      }

      setRegisteredEmbeddings(vectors);
      setReferenceEmbedding(averageEmbedding(vectors));
      setHasLiveMlVerification(false);
      stopCamera();
      setMessage("In-app ML profile created. Run live verification now.");
    } catch (e) {
      setError(
        toUserFriendlyError("Failed to capture/register in-app face", e),
      );
    }
  };

  const verifyLiveFaceNow = async () => {
    setError(null);
    setMessage(null);
    setIsVerifying(true);

    try {
      if (!referenceEmbedding || registeredEmbeddings.length !== 3) {
        throw new Error("Register face angles first.");
      }

      const burst = await captureBurst(3, 220);
      const probes = await Promise.all(
        burst.map((frame) => embeddingFromDataUrl(frame)),
      );
      const bestPerProbe = probes.map((probe) => {
        let best = -1;
        for (const reg of registeredEmbeddings) {
          best = Math.max(best, cosineSimilarity(reg, probe));
        }
        return best;
      });

      const avgSimilarity =
        bestPerProbe.reduce((sum, v) => sum + v, 0) / bestPerProbe.length;
      const minSimilarity = Math.min(...bestPerProbe);

      if (
        avgSimilarity < LIVE_AVG_THRESHOLD ||
        minSimilarity < LIVE_MIN_THRESHOLD
      ) {
        setHasLiveMlVerification(false);
        throw new Error(
          `Face mismatch. Avg ${(avgSimilarity * 100).toFixed(1)}%, min ${(minSimilarity * 100).toFixed(1)}%. Ensure only your face is visible and retry.`,
        );
      }

      setHasLiveMlVerification(true);
      stopCamera();
      setMessage(
        `Strict in-app ML approved. Avg ${(avgSimilarity * 100).toFixed(1)}%, min ${(minSimilarity * 100).toFixed(1)}%.`,
      );
    } catch (e) {
      setError(toUserFriendlyError("Failed to verify in-app face", e));
    } finally {
      setIsVerifying(false);
    }
  };

  const cameraStatusLabel = useMemo(() => {
    if (cameraMode === "verify") {
      return "Live check mode: keep your face centered, then tap verify.";
    }
    return `Current angle: ${currentStage}. Face this angle and tap capture.`;
  }, [cameraMode, currentStage]);

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraStream]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full overflow-y-auto px-5 pb-6 pt-12"
    >
      <div className="mb-4 pr-8">
        <h2 className="text-xl font-extrabold text-foreground">
          In-App Driver Face Verification
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          ML logic runs fully in-app. No profile registration form.
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm text-foreground font-medium">
            Driver: {phoneNumber || "driver-demo"}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-primary" />
            <p className="text-sm font-semibold text-foreground">
              Step 1: Register In-App Face Signature
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {FACE_STAGES.map((stage) => (
              <div
                key={stage}
                className="rounded-lg border border-border bg-background/60 p-2 text-center"
              >
                <p className="text-[10px] font-semibold text-muted-foreground">
                  {stage}
                </p>
                <p
                  className={`text-[11px] font-semibold ${capturesByStage[stage] ? "text-safe" : "text-warning"}`}
                >
                  {capturesByStage[stage] ? "Captured" : "Pending"}
                </p>
              </div>
            ))}
          </div>

          <button
            onClick={() => openInAppCamera("register")}
            disabled={isOpeningCamera || showInAppCamera}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
          >
            {isOpeningCamera
              ? "Opening camera..."
              : showInAppCamera
                ? "Camera Open"
                : "Open Camera For Registration"}
          </button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-primary" />
            <p className="text-sm font-semibold text-foreground">
              Step 2: Live Verify Against Registered Face
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background/60 p-2 text-center">
            <p className="text-[11px] font-semibold text-muted-foreground">
              Verification status
            </p>
            <p
              className={`text-[12px] font-semibold ${hasLiveMlVerification ? "text-safe" : "text-warning"}`}
            >
              {hasLiveMlVerification ? "Approved" : "Pending"}
            </p>
          </div>
          <button
            onClick={() => openInAppCamera("verify")}
            disabled={isOpeningCamera || showInAppCamera || !hasRegisteredFace}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
          >
            Open Live Verification Camera
          </button>
        </div>

        {showInAppCamera && (
          <div className="rounded-xl border border-border bg-background/70 p-3 space-y-3">
            <div className="rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
              {cameraStatusLabel}
            </div>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full rounded-lg border border-border bg-black/80 aspect-video object-cover"
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  videoRef.current.play().catch(() => {
                    setError(
                      "Camera opened but preview could not start. Re-open camera.",
                    );
                  });
                }
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              {cameraMode === "register" ? (
                <button
                  onClick={captureStage}
                  className="py-2 rounded-lg bg-safe text-safe-foreground font-semibold text-sm"
                >
                  Capture {currentStage}
                </button>
              ) : (
                <button
                  onClick={verifyLiveFaceNow}
                  disabled={isVerifying}
                  className="py-2 rounded-lg bg-safe text-safe-foreground font-semibold text-sm disabled:opacity-60"
                >
                  {isVerifying ? "Verifying..." : "Verify Me Now"}
                </button>
              )}
              <button
                onClick={stopCamera}
                className="py-2 rounded-lg bg-muted text-foreground font-semibold text-sm"
              >
                Close Camera
              </button>
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}

        {message && (
          <div className="rounded-xl bg-green-100 text-green-800 text-xs px-3 py-2">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-red-100 text-red-800 text-xs px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-4 mb-2">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={16} className="text-primary" />
          <p className="text-sm font-semibold text-foreground">
            Ready to Continue
          </p>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Continue only after successful strict in-app ML live verification.
        </p>
        <button
          onClick={onVerified}
          disabled={!hasLiveMlVerification}
          className="w-full py-3 rounded-xl bg-foreground text-background font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Play size={16} />
          Continue to Driver Dashboard
        </button>
      </div>
    </motion.div>
  );
};

export default DriverVerificationScreen;
