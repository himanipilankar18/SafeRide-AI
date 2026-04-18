import base64
import json
import os
import sys
import time
from typing import Any, Dict, Optional

import cv2
import numpy as np

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from modules.distraction import DistractionMonitor  # noqa: E402
from modules.eye_analysis import EyeAnalyzer  # noqa: E402
from modules.face_detector import FaceLandmarkDetector  # noqa: E402
from modules.fatigue import FatigueMonitor  # noqa: E402
from modules.fusion import FusionEngine  # noqa: E402
from modules.hardware_interface import HardwareInterface  # noqa: E402
from config import CONFIG  # noqa: E402


class DrowsinessInferenceWorker:
    def __init__(self) -> None:
        self.detector = FaceLandmarkDetector()
        self.eye_analyzer = EyeAnalyzer()
        self.distraction_monitor = DistractionMonitor()
        self.fatigue_monitor = FatigueMonitor()
        self.fusion_engine = FusionEngine()

        self.current_session_key: Optional[str] = None
        self.no_face_since: Optional[float] = None

        self.hardware: Optional[HardwareInterface] = None
        self.previous_state: Optional[str] = None
        self.last_hardware_send_ts = 0.0
        self._init_hardware()

    def _init_hardware(self) -> None:
        enable_hardware = str(
            os.getenv("DROWSINESS_ENABLE_HARDWARE", str(CONFIG.enable_hardware)),
        ).strip().lower() in {"1", "true", "yes", "on"}

        if not enable_hardware:
            return

        serial_port = os.getenv("DROWSINESS_SERIAL_PORT", CONFIG.serial_port)
        serial_baudrate = int(
            os.getenv("DROWSINESS_SERIAL_BAUDRATE", str(CONFIG.serial_baudrate)),
        )

        hardware = HardwareInterface(
            port=serial_port,
            baudrate=serial_baudrate,
        )

        if hardware.connect():
            self.hardware = hardware
            default_state = os.getenv(
                "DROWSINESS_HARDWARE_DEFAULT_STATE",
                CONFIG.hardware_default_state,
            )
            if self.hardware.send_alert(default_state):
                self.previous_state = default_state
                self.last_hardware_send_ts = time.time()

    def _send_hardware_state(self, state: str, timestamp: float) -> None:
        if not self.hardware or not self.hardware.is_connected():
            return

        should_send = (
            state != self.previous_state
            or (timestamp - self.last_hardware_send_ts)
            >= float(CONFIG.hardware_resend_interval_seconds)
        )

        if not should_send:
            return

        if self.hardware.send_alert(state):
            self.previous_state = state
            self.last_hardware_send_ts = timestamp

    def reset(self, session_key: Optional[str] = None) -> None:
        self.eye_analyzer = EyeAnalyzer()
        self.distraction_monitor = DistractionMonitor()
        self.fatigue_monitor = FatigueMonitor()
        self.fusion_engine = FusionEngine()
        self.no_face_since = None
        self.current_session_key = session_key

    def _decode_frame(self, frame_data_url: str):
        if not frame_data_url:
            raise ValueError("frame is required")

        payload = frame_data_url
        if "," in frame_data_url:
            payload = frame_data_url.split(",", 1)[1]

        try:
            raw = base64.b64decode(payload)
        except Exception as exc:
            raise ValueError("invalid base64 frame payload") from exc

        np_buffer = np.frombuffer(raw, dtype=np.uint8)
        frame = cv2.imdecode(np_buffer, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("unable to decode frame image")
        return frame

    def analyze(self, frame_data_url: str, session_key: Optional[str], reset: bool) -> Dict[str, Any]:
        if reset or (session_key and session_key != self.current_session_key):
            self.reset(session_key)

        frame = self._decode_frame(frame_data_url)
        timestamp = time.time()
        detection = self.detector.process(frame)

        if not detection.face_detected or detection.landmarks is None:
            if self.no_face_since is None:
                self.no_face_since = timestamp

            missing_for = max(0.0, timestamp - self.no_face_since)
            if missing_for >= 1.5:
                decision = self.fusion_engine.force_critical_no_face(timestamp)
                state = decision.state
                risk_score = decision.risk_score
                fatigue_score = decision.fatigue_score
                distraction_score = decision.distraction_score
                reason = "no_face_timeout"
            elif missing_for >= 0.8:
                state = "WARNING"
                risk_score = 58.0
                fatigue_score = 52.0
                distraction_score = 62.0
                reason = "face_temporarily_missing"
            else:
                state = "WARNING"
                risk_score = 38.0
                fatigue_score = 28.0
                distraction_score = 48.0
                reason = "searching_for_face"

            self._send_hardware_state(state, timestamp)

            return {
                "state": state,
                "riskScore": float(round(risk_score, 2)),
                "fatigueScore": float(round(fatigue_score, 2)),
                "distractionScore": float(round(distraction_score, 2)),
                "confidence": 0.95,
                "reason": reason,
                "faceDetected": False,
            }

        self.no_face_since = None

        eye_metrics = self.eye_analyzer.update(detection.landmarks, timestamp)
        head_pose = self._estimate_head_pose_safe(detection.landmarks)
        distraction = self.distraction_monitor.update(head_pose, timestamp)
        fatigue = self.fatigue_monitor.update(detection.landmarks, eye_metrics, head_pose, timestamp)
        decision = self.fusion_engine.combine(fatigue, distraction, timestamp)
        self._send_hardware_state(decision.state, timestamp)

        confidence = 0.9 if head_pose.valid and fatigue.eyes_available else 0.7

        return {
            "state": decision.state,
            "riskScore": float(round(decision.risk_score, 2)),
            "fatigueScore": float(round(decision.fatigue_score, 2)),
            "distractionScore": float(round(decision.distraction_score, 2)),
            "confidence": float(round(confidence, 3)),
            "reason": decision.reasons[0] if decision.reasons else "model_update",
            "faceDetected": True,
            "blinkRatePerMinute": float(round(eye_metrics.blink_rate_per_minute, 2)),
            "eyeClosureSeconds": float(round(eye_metrics.eye_closure_duration, 3)),
            "yaw": float(round(head_pose.yaw, 2)) if head_pose.valid else 0.0,
            "pitch": float(round(head_pose.pitch, 2)) if head_pose.valid else 0.0,
            "roll": float(round(head_pose.roll, 2)) if head_pose.valid else 0.0,
            "fatigueFlags": {
                "closureState": fatigue.closure_state,
                "microsleep": bool(fatigue.microsleep_detected),
                "frequentBlinking": bool(fatigue.frequent_blinking),
                "lowEar": bool(fatigue.low_ear_detected),
            },
            "distractionReason": distraction.reason,
        }

    def _estimate_head_pose_safe(self, landmarks):
        from modules.head_pose import HeadPoseEstimator

        if not hasattr(self, "head_pose_estimator"):
            self.head_pose_estimator = HeadPoseEstimator()
        return self.head_pose_estimator.estimate(landmarks)

    def close(self) -> None:
        try:
            self.detector.close()
        except Exception:
            pass

        if self.hardware and self.hardware.is_connected():
            try:
                self.hardware.send_alert("OFF")
                time.sleep(0.2)
            finally:
                self.hardware.disconnect()


def _reply(payload: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def main() -> None:
    worker = DrowsinessInferenceWorker()

    try:
        for raw_line in sys.stdin:
            line = raw_line.strip()
            if not line:
                continue

            try:
                message = json.loads(line)
                msg_id = message.get("id")
                msg_type = message.get("type")

                if msg_type == "shutdown":
                    _reply({"id": msg_id, "ok": True, "result": {"status": "bye"}})
                    break

                if msg_type == "reset":
                    worker.reset(message.get("sessionKey"))
                    _reply({"id": msg_id, "ok": True, "result": {"status": "reset"}})
                    continue

                if msg_type != "analyze":
                    raise ValueError("unsupported message type")

                result = worker.analyze(
                    frame_data_url=message.get("frame", ""),
                    session_key=message.get("sessionKey"),
                    reset=bool(message.get("reset", False)),
                )

                _reply({"id": msg_id, "ok": True, "result": result})
            except Exception as exc:
                _reply({
                    "id": message.get("id") if isinstance(message, dict) else None,
                    "ok": False,
                    "error": str(exc),
                })
    finally:
        worker.close()


if __name__ == "__main__":
    main()
