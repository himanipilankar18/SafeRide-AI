from typing import Callable, Optional

import cv2

from config import CONFIG


class AlertManager:
    def __init__(self, hardware_hook: Optional[Callable[[dict], None]] = None) -> None:
        self._last_state = None
        self._hardware_hook = hardware_hook

    def publish(self, decision, eye_metrics, head_pose, fatigue_result, distraction_result) -> None:
        if decision.state != self._last_state:
            message = (
                f"[STATE] {decision.state} | risk={decision.risk_score:.1f} | "
                f"fatigue={decision.fatigue_score:.1f} | distraction={decision.distraction_score:.1f}"
            )
            print(message)
            if decision.reasons:
                print(f"[SIGNALS] {', '.join(decision.reasons)}")
            self._last_state = decision.state

            if self._hardware_hook is not None:
                self._hardware_hook(
                    {
                        'state': decision.state,
                        'risk_score': decision.risk_score,
                        'fatigue_score': decision.fatigue_score,
                        'distraction_score': decision.distraction_score,
                        'reasons': decision.reasons,
                    }
                )

    def _color(self, state: str):
        if state == 'CRITICAL':
            return (0, 0, 255)
        if state == 'WARNING':
            return (0, 165, 255)
        return (0, 200, 0)

    def draw_overlay(self, frame, decision, eye_metrics, head_pose, fatigue_result, distraction_result):
        color = self._color(decision.state)
        x, y = 20, 35
        line_height = 28

        overlay_lines = [
            f'State: {decision.state}',
            f'Risk Score: {decision.risk_score:.1f}',
            f'EAR: {eye_metrics.ear:.3f} | Blink Count: {eye_metrics.blink_count} | Blink Rate: {eye_metrics.blink_rate_per_minute:.1f}/min',
            f'Eye Closure: {eye_metrics.eye_closure_duration:.2f}s',
            f'Head Pose Yaw: {head_pose.yaw:.1f} deg | Pitch: {head_pose.pitch:.1f} deg | Roll: {head_pose.roll:.1f} deg',
            f'Distraction: {distraction_result.duration:.2f}s | Reason: {distraction_result.reason}',
            f'Fatigue Score: {fatigue_result.score:.1f}',
        ]

        cv2.rectangle(frame, (10, 10), (620, 10 + line_height * (len(overlay_lines) + 1)), (0, 0, 0), -1)
        cv2.rectangle(frame, (10, 10), (620, 10 + line_height * (len(overlay_lines) + 1)), color, 2)

        for line in overlay_lines:
            cv2.putText(
                frame,
                line,
                (x, y),
                cv2.FONT_HERSHEY_SIMPLEX,
                CONFIG.overlay_font_scale,
                color,
                CONFIG.overlay_thickness,
                cv2.LINE_AA,
            )
            y += line_height

        if decision.state == 'WARNING':
            cv2.putText(frame, 'ATTENTION', (700, 50), cv2.FONT_HERSHEY_DUPLEX, 1.0, (0, 165, 255), 2, cv2.LINE_AA)
        elif decision.state == 'CRITICAL':
            cv2.putText(frame, 'ALERT', (700, 50), cv2.FONT_HERSHEY_DUPLEX, 1.0, (0, 0, 255), 2, cv2.LINE_AA)

        return frame

    def draw_no_face_overlay(self, frame):
        cv2.putText(
            frame,
            'Face not detected',
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 0, 255),
            2,
            cv2.LINE_AA,
        )
        return frame