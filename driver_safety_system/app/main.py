import argparse
import logging
import time

import cv2

from config import CONFIG
from modules.alert import AlertManager
from modules.distraction import DistractionMonitor
from modules.eye_analysis import EyeAnalyzer
from modules.face_detector import FaceLandmarkDetector
from modules.fatigue import FatigueMonitor
from modules.fusion import FusionEngine
from modules.head_pose import HeadPoseEstimator
from modules.hardware_interface import HardwareInterface


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Real-time driver safety monitoring system')
    parser.add_argument('--camera', type=int, default=CONFIG.camera_index)
    parser.add_argument('--width', type=int, default=CONFIG.frame_width)
    parser.add_argument('--height', type=int, default=CONFIG.frame_height)
    parser.add_argument('--detection-confidence', type=float, default=CONFIG.min_detection_confidence)
    parser.add_argument('--tracking-confidence', type=float, default=CONFIG.min_tracking_confidence)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    logic_update_interval = CONFIG.logic_update_interval_seconds

    capture = cv2.VideoCapture(args.camera)
    capture.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)

    detector = FaceLandmarkDetector(
        min_detection_confidence=args.detection_confidence,
        min_tracking_confidence=args.tracking_confidence,
    )
    eye_analyzer = EyeAnalyzer()
    head_pose_estimator = HeadPoseEstimator()
    distraction_monitor = DistractionMonitor()
    fatigue_monitor = FatigueMonitor()
    fusion_engine = FusionEngine()
    alert_manager = AlertManager()

    # Initialize hardware interface
    hardware = None
    previous_state = None
    last_hardware_send_ts = 0.0
    no_face_since = None
    no_face_forced_critical = False
    last_logic_update_ts = 0.0
    last_no_face_log_ts = 0.0

    latest_eye_metrics = None
    latest_head_pose = None
    latest_distraction = None
    latest_fatigue = None
    latest_decision = None
    if CONFIG.enable_hardware:
        hardware = HardwareInterface(
            port=CONFIG.serial_port,
            baudrate=CONFIG.serial_baudrate,
        )
        if hardware.connect():
            # Sync ESP32 with a known state immediately after connection.
            hardware.send_alert(CONFIG.hardware_default_state)
            previous_state = CONFIG.hardware_default_state
            last_hardware_send_ts = time.time()

    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break

            timestamp = time.time()
            detection = detector.process(frame)

            if detection.face_detected and detection.landmarks is not None:
                no_face_since = None
                no_face_forced_critical = False

                # Run risk/state pipeline at controlled rate to reduce flicker and noise.
                if (timestamp - last_logic_update_ts) >= logic_update_interval:
                    latest_eye_metrics = eye_analyzer.update(detection.landmarks, timestamp)
                    latest_head_pose = head_pose_estimator.estimate(detection.landmarks)
                    latest_distraction = distraction_monitor.update(latest_head_pose, timestamp)
                    latest_fatigue = fatigue_monitor.update(detection.landmarks, latest_eye_metrics, latest_head_pose, timestamp)
                    latest_decision = fusion_engine.combine(latest_fatigue, latest_distraction, timestamp)
                    last_logic_update_ts = timestamp

                    alert_manager.publish(
                        latest_decision,
                        latest_eye_metrics,
                        latest_head_pose,
                        latest_fatigue,
                        latest_distraction,
                    )

                    target_state = latest_decision.state

                    # Send state on transition, and periodically resend for reliability.
                    if hardware and (
                        target_state != previous_state
                        or (timestamp - last_hardware_send_ts) >= CONFIG.hardware_resend_interval_seconds
                    ):
                        if hardware.send_alert(target_state):
                            previous_state = target_state
                            last_hardware_send_ts = timestamp

                if all(v is not None for v in (latest_decision, latest_eye_metrics, latest_head_pose, latest_fatigue, latest_distraction)):
                    frame = alert_manager.draw_overlay(
                        frame,
                        latest_decision,
                        latest_eye_metrics,
                        latest_head_pose,
                        latest_fatigue,
                        latest_distraction,
                    )
                else:
                    frame = alert_manager.draw_no_face_overlay(frame)
            else:
                if no_face_since is None:
                    no_face_since = timestamp
                    print("[STATE] NO_FACE detected")

                no_face_duration = timestamp - no_face_since
                if (timestamp - last_no_face_log_ts) >= 0.8:
                    print(f"[NO_FACE] duration={no_face_duration:.1f}s")
                    last_no_face_log_ts = timestamp

                # Strong no-face handling: force CRITICAL quickly when face is missing.
                if no_face_duration >= 1.5:
                    if not no_face_forced_critical:
                        print("[STATE] CRITICAL reason=NO_FACE_TIMEOUT")
                    latest_decision = fusion_engine.force_critical_no_face(timestamp)
                    no_face_forced_critical = True

                # If face is lost for a while, move hardware to fallback state.
                if hardware and no_face_forced_critical:
                    target_state = 'CRITICAL'
                    if (
                        target_state != previous_state
                        or (timestamp - last_hardware_send_ts) >= CONFIG.hardware_resend_interval_seconds
                    ):
                        if hardware.send_alert(target_state):
                            previous_state = target_state
                            last_hardware_send_ts = timestamp

                frame = alert_manager.draw_no_face_overlay(frame)

            cv2.imshow('Driver Safety Monitor', frame)
            key = cv2.waitKey(1) & 0xFF
            if key in (27, ord('q')):
                break
    finally:
        capture.release()
        detector.close()
        if hardware:
            try:
                # Send a safe shutdown state so ESP32 does not enter failsafe after app stop.
                if hardware.is_connected():
                    hardware.send_alert('NORMAL')
                    time.sleep(0.5)
            finally:
                hardware.disconnect()
        cv2.destroyAllWindows()


if __name__ == '__main__':
    main()