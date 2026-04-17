from collections import deque
from dataclasses import dataclass, field
from typing import Dict, Optional

from config import CONFIG
from utils.math_utils import mouth_aspect_ratio, clamp
from utils.timers import DurationTimer


MOUTH_INDICES = [61, 13, 14, 291]


@dataclass
class FatigueResult:
    score: float
    ear_score: float
    blink_rate_score: float
    eye_closure_score: float
    yawn_score: float
    head_pose_score: float
    mouth_ratio: float
    yawn_duration: float
    fatigue_flag: bool
    smoothed_ear: float = 0.0
    baseline_ear: float = 0.0
    dynamic_ear_threshold: float = 0.0
    eyes_available: bool = True
    closed_frames: int = 0
    closed_time: float = 0.0
    closure_state: str = 'open'
    microsleep_detected: bool = False
    low_ear_detected: bool = False
    frequent_blinking: bool = False
    feature_vector: Dict[str, float] = field(default_factory=dict)


class FatigueMonitor:
    def __init__(self) -> None:
        self._yawn_timer = DurationTimer()
        self._ear_history = deque(maxlen=max(CONFIG.ear_smoothing_window, 1))
        self._smoothed_ear = CONFIG.ear_open_threshold

        # One-time per-session personalized EAR calibration.
        self._session_start_ts: Optional[float] = None
        self._baseline_ear: Optional[float] = None
        self._baseline_locked = False
        self._baseline_sum = 0.0
        self._baseline_count = 0

        # Temporal closure tracking with estimated FPS.
        self._closed_frames = 0
        self._last_timestamp: Optional[float] = None
        self._estimated_fps = CONFIG.default_fps

    def _mouth_points(self, landmarks):
        if landmarks is None or not hasattr(landmarks, 'points'):
            return None
        points = []
        for index in MOUTH_INDICES:
            if index not in landmarks.points:
                return None
            points.append(landmarks.points[index])
        return points

    def _update_fps(self, timestamp: float) -> float:
        if self._last_timestamp is not None:
            dt = timestamp - self._last_timestamp
            if dt > 1e-3:
                instant_fps = 1.0 / dt
                instant_fps = clamp(instant_fps, 5.0, 120.0)
                self._estimated_fps = 0.85 * self._estimated_fps + 0.15 * instant_fps
        self._last_timestamp = timestamp
        return max(self._estimated_fps, 1.0)

    def _smooth_ear(self, raw_ear: float) -> float:
        raw_ear = clamp(raw_ear, 0.05, 0.70)
        if CONFIG.use_ear_ema_smoothing:
            alpha = clamp(CONFIG.ear_ema_alpha, 0.05, 0.95)
            self._smoothed_ear = alpha * raw_ear + (1.0 - alpha) * self._smoothed_ear
            return self._smoothed_ear

        self._ear_history.append(raw_ear)
        if self._ear_history:
            self._smoothed_ear = sum(self._ear_history) / len(self._ear_history)
        return self._smoothed_ear

    def _update_baseline(self, smoothed_ear: float, timestamp: float, eyes_available: bool) -> None:
        if self._session_start_ts is None:
            self._session_start_ts = timestamp

        if self._baseline_locked:
            return

        elapsed = timestamp - self._session_start_ts
        if eyes_available and elapsed <= CONFIG.ear_baseline_calibration_seconds:
            if 0.08 <= smoothed_ear <= 0.60:
                self._baseline_sum += smoothed_ear
                self._baseline_count += 1

        if elapsed >= CONFIG.ear_baseline_calibration_seconds:
            if self._baseline_count >= CONFIG.ear_baseline_min_samples:
                self._baseline_ear = self._baseline_sum / self._baseline_count
            elif self._baseline_count > 0:
                self._baseline_ear = self._baseline_sum / self._baseline_count
            else:
                self._baseline_ear = CONFIG.ear_open_threshold
            self._baseline_locked = True

    def _dynamic_ear_threshold(self) -> float:
        baseline = self._baseline_ear if self._baseline_ear is not None else CONFIG.ear_open_threshold
        dynamic = CONFIG.ear_threshold_multiplier * baseline
        return clamp(dynamic, 0.12, 0.38)

    def update(self, landmarks, eye_metrics, head_pose, timestamp: float) -> FatigueResult:
        fps = self._update_fps(timestamp)

        eyes_available = not (
            eye_metrics is None
            or (eye_metrics.left_ear >= 0.99 and eye_metrics.right_ear >= 0.99)
        )

        raw_ear = eye_metrics.ear if eyes_available else self._smoothed_ear
        smoothed_ear = self._smooth_ear(raw_ear) if eyes_available else self._smoothed_ear

        self._update_baseline(smoothed_ear, timestamp, eyes_available)
        dynamic_ear_threshold = self._dynamic_ear_threshold()

        if eyes_available and smoothed_ear < dynamic_ear_threshold:
            self._closed_frames += 1
        else:
            self._closed_frames = 0

        closed_time = self._closed_frames / max(fps, 1.0)
        if self._closed_frames == 0:
            closure_state = 'open'
        elif closed_time < CONFIG.blink_duration_max_seconds:
            closure_state = 'blink'
        elif closed_time <= CONFIG.microsleep_duration_seconds:
            closure_state = 'fatigue_warning'
        else:
            closure_state = 'microsleep'

        microsleep_detected = closure_state == 'microsleep'
        low_ear_detected = eyes_available and smoothed_ear < (dynamic_ear_threshold + CONFIG.low_ear_margin)
        blink_rate = eye_metrics.blink_rate_per_minute
        frequent_blinking = eyes_available and blink_rate >= CONFIG.frequent_blink_rate_warning

        mouth_points = self._mouth_points(landmarks)
        mouth_ratio = 0.0
        yawn_duration = 0.0
        yawn_score = 0.0

        if mouth_points is not None:
            mouth_ratio = mouth_aspect_ratio(mouth_points)
            if mouth_ratio >= CONFIG.mar_yawn_threshold:
                if not self._yawn_timer.running:
                    self._yawn_timer.start(timestamp)
                yawn_duration = self._yawn_timer.elapsed(timestamp)
                if yawn_duration >= CONFIG.yawn_warning_duration:
                    # Yawning should immediately elevate risk to at least warning range.
                    yawn_score = 55.0 + min(yawn_duration / CONFIG.yawn_critical_duration, 1.0) * 35.0
            else:
                if self._yawn_timer.running:
                    yawn_duration = self._yawn_timer.elapsed(timestamp)
                self._yawn_timer.stop(timestamp)

        baseline_ref = self._baseline_ear if self._baseline_ear is not None else CONFIG.ear_open_threshold
        ear_span = max(baseline_ref - dynamic_ear_threshold, 1e-6)
        ear_score = (
            clamp((dynamic_ear_threshold - smoothed_ear) / ear_span, 0.0, 1.0) * 45.0
            if eyes_available
            else 0.0
        )

        blink_rate_score = 0.0
        low_blink_rate = eyes_available and blink_rate <= CONFIG.blink_rate_warning_low
        very_low_blink_rate = eyes_available and blink_rate <= CONFIG.blink_rate_critical_low
        very_high_blink_rate = eyes_available and blink_rate >= (CONFIG.frequent_blink_rate_warning * 1.45)
        if very_low_blink_rate:
            blink_rate_score = 45.0
        elif low_blink_rate:
            blink_rate_score = 30.0
        elif frequent_blinking and low_ear_detected:
            blink_rate_score = 35.0
        elif very_high_blink_rate:
            blink_rate_score = 28.0
        elif frequent_blinking:
            blink_rate_score = 18.0

        if closed_time > 1.0:
            eye_closure_score = 100.0
        elif microsleep_detected:
            eye_closure_score = 100.0
        elif closure_state == 'fatigue_warning':
            progress = clamp(
                (closed_time - CONFIG.fatigue_warning_closure_seconds)
                / max(CONFIG.microsleep_duration_seconds - CONFIG.fatigue_warning_closure_seconds, 1e-6),
                0.0,
                1.0,
            )
            eye_closure_score = 55.0 + 35.0 * progress
        elif closed_time >= CONFIG.moderate_eye_closure_warning_seconds:
            eye_closure_score = 35.0
        else:
            eye_closure_score = 0.0

        head_pose_score = 0.0
        if head_pose.valid:
            pitch_component = 0.0
            if head_pose.pitch <= -CONFIG.head_nod_pitch_threshold:
                pitch_component = min(abs(head_pose.pitch) / max(CONFIG.pitch_critical_degrees, 1e-6), 1.0) * 20.0
            head_pose_score = pitch_component

        score = (
            0.30 * ear_score
            + 0.25 * blink_rate_score
            + 0.25 * eye_closure_score
            + 0.10 * yawn_score
            + 0.10 * head_pose_score
        )

        if yawn_duration >= CONFIG.yawn_warning_duration:
            score = max(score, 52.0)

        return FatigueResult(
            score=clamp(score, 0.0, 100.0),
            ear_score=ear_score,
            blink_rate_score=blink_rate_score,
            eye_closure_score=eye_closure_score,
            yawn_score=yawn_score,
            head_pose_score=head_pose_score,
            mouth_ratio=mouth_ratio,
            yawn_duration=yawn_duration,
            fatigue_flag=closure_state in {'fatigue_warning', 'microsleep'} or score >= 35.0,
            smoothed_ear=smoothed_ear,
            baseline_ear=baseline_ref,
            dynamic_ear_threshold=dynamic_ear_threshold,
            eyes_available=eyes_available,
            closed_frames=self._closed_frames,
            closed_time=closed_time,
            closure_state=closure_state,
            microsleep_detected=microsleep_detected,
            low_ear_detected=low_ear_detected,
            frequent_blinking=frequent_blinking,
            feature_vector={
                'smoothed_ear': smoothed_ear,
                'baseline_ear': baseline_ref,
                'dynamic_ear_threshold': dynamic_ear_threshold,
                'blink_rate_per_minute': blink_rate,
                'closed_time': closed_time,
                'head_pitch': head_pose.pitch if head_pose.valid else 0.0,
                'head_yaw': head_pose.yaw if head_pose.valid else 0.0,
            },
        )