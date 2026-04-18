from dataclasses import dataclass

from config import CONFIG
from utils.timers import DurationTimer


@dataclass
class DistractionResult:
    distracted: bool
    duration: float
    score: float
    reason: str
    yaw: float
    pitch: float
    roll: float
    valid: bool


class DistractionMonitor:
    def __init__(self) -> None:
        self._away_timer = DurationTimer()
        self._distracted = False

    def update(self, head_pose, timestamp: float) -> DistractionResult:
        if not head_pose.valid:
            return DistractionResult(False, 0.0, 0.0, 'head_pose_unavailable', head_pose.yaw, head_pose.pitch, head_pose.roll, False)

        away_yaw = abs(head_pose.yaw) >= CONFIG.yaw_warning_degrees
        away_pitch = abs(head_pose.pitch) >= CONFIG.pitch_warning_degrees
        is_away = away_yaw or away_pitch

        if is_away:
            if not self._away_timer.running:
                self._away_timer.start(timestamp)
            self._distracted = True
            duration = self._away_timer.elapsed(timestamp)
        else:
            duration = self._away_timer.elapsed(timestamp) if self._away_timer.running else 0.0
            self._away_timer.stop(timestamp)
            self._distracted = False

        score = 0.0
        if is_away:
            angle_component = max(
                min(abs(head_pose.yaw) / CONFIG.yaw_critical_degrees, 1.0),
                min(abs(head_pose.pitch) / CONFIG.pitch_critical_degrees, 1.0),
            )
            if duration >= 2.5:
                duration_component = 1.0
            elif duration >= 1.5:
                duration_component = 0.7
            else:
                duration_component = min(duration / 1.5, 1.0) * 0.7
            score = 100.0 * (0.45 * angle_component + 0.55 * duration_component)

        reason = 'on_road'
        if is_away and duration >= 2.5:
            reason = 'sustained_distraction_critical'
        elif is_away and duration >= 1.5:
            reason = 'sustained_distraction_warning'
        elif is_away and abs(head_pose.yaw) >= CONFIG.yaw_critical_degrees:
            reason = 'yaw_exceeded'
        elif is_away and abs(head_pose.pitch) >= CONFIG.pitch_critical_degrees:
            reason = 'pitch_exceeded'
        elif is_away:
            reason = 'duration_tracking'

        return DistractionResult(
            distracted=is_away and duration >= 1.5,
            duration=duration,
            score=score,
            reason=reason,
            yaw=head_pose.yaw,
            pitch=head_pose.pitch,
            roll=head_pose.roll,
            valid=True,
        )