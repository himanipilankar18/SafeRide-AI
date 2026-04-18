from dataclasses import dataclass

from config import CONFIG
from utils.math_utils import eye_aspect_ratio
from utils.timers import DurationTimer, RollingTimeWindow


LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144]
RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380]


@dataclass
class EyeMetrics:
    ear: float
    left_ear: float
    right_ear: float
    blink_count: int
    blink_rate_per_minute: float
    eye_closure_duration: float
    is_eye_closed: bool
    blink_event: bool
    closure_event: bool


class EyeAnalyzer:
    def __init__(self) -> None:
        self._closure_timer = DurationTimer()
        self._blink_times = RollingTimeWindow(window_seconds=60.0)
        self._blink_count = 0
        self._is_eye_closed = False

    def _extract_eye_points(self, landmarks, indices):
        points = []
        for index in indices:
            if index not in landmarks.points:
                return None
            points.append(landmarks.points[index])
        return points

    def update(self, landmarks, timestamp: float) -> EyeMetrics:
        left_eye = self._extract_eye_points(landmarks, LEFT_EYE_INDICES)
        right_eye = self._extract_eye_points(landmarks, RIGHT_EYE_INDICES)

        if left_eye is None or right_eye is None:
            return EyeMetrics(
                ear=1.0,
                left_ear=1.0,
                right_ear=1.0,
                blink_count=self._blink_count,
                blink_rate_per_minute=self._blink_times.rate_per_minute(timestamp),
                eye_closure_duration=0.0,
                is_eye_closed=False,
                blink_event=False,
                closure_event=False,
            )

        left_ear = eye_aspect_ratio(left_eye)
        right_ear = eye_aspect_ratio(right_eye)
        ear = (left_ear + right_ear) / 2.0

        blink_event = False
        closure_event = False

        if ear <= CONFIG.ear_closed_threshold:
            if not self._closure_timer.running:
                self._closure_timer.start(timestamp)
            self._is_eye_closed = True
            closure_duration = self._closure_timer.elapsed(timestamp)
            closure_event = closure_duration >= CONFIG.eye_closure_warning_duration
        else:
            if self._closure_timer.running:
                closure_duration = self._closure_timer.elapsed(timestamp)
                if CONFIG.blink_min_duration <= closure_duration <= CONFIG.blink_max_duration:
                    self._blink_count += 1
                    self._blink_times.add(timestamp)
                    blink_event = True
                self._closure_timer.stop(timestamp)
            self._is_eye_closed = False
            closure_duration = 0.0

        if self._closure_timer.running:
            closure_duration = self._closure_timer.elapsed(timestamp)
        else:
            closure_duration = 0.0

        if ear >= CONFIG.ear_open_threshold and not self._closure_timer.running:
            self._is_eye_closed = False

        return EyeMetrics(
            ear=ear,
            left_ear=left_ear,
            right_ear=right_ear,
            blink_count=self._blink_count,
            blink_rate_per_minute=self._blink_times.rate_per_minute(timestamp),
            eye_closure_duration=closure_duration,
            is_eye_closed=self._is_eye_closed,
            blink_event=blink_event,
            closure_event=closure_event,
        )