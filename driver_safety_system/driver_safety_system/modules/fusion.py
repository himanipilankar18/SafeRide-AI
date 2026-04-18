from dataclasses import dataclass, field
from typing import List, Optional
import time

from config import CONFIG


@dataclass
class SafetyDecision:
    state: str
    risk_score: float
    fatigue_score: float
    distraction_score: float
    reasons: List[str] = field(default_factory=list)
    timestamp: float = 0.0
    state_changed: bool = False


class FusionEngine:
    def __init__(self) -> None:
        self._state = 'NORMAL'
        self._smoothed_risk = 0.0
        self._state_since: Optional[float] = None

        # Simple persistence timers per transition.
        self._normal_to_warning_since: Optional[float] = None
        self._warning_to_critical_since: Optional[float] = None
        self._critical_to_warning_since: Optional[float] = None
        self._warning_to_normal_since: Optional[float] = None

    def _reset_transition_timers(self) -> None:
        self._normal_to_warning_since = None
        self._warning_to_critical_since = None
        self._critical_to_warning_since = None
        self._warning_to_normal_since = None

    def _set_state(self, new_state: str, timestamp: float) -> None:
        self._state = new_state
        self._state_since = timestamp
        self._reset_transition_timers()

    def _raw_risk(self, fatigue_score: float, distraction_score: float) -> float:
        # Keep fatigue-priority weighting while staying simple.
        return min(100.0, max(0.0, 0.7 * fatigue_score + 0.3 * distraction_score))

    def force_critical_no_face(self, timestamp: Optional[float] = None) -> SafetyDecision:
        if timestamp is None:
            timestamp = time.time()

        state_changed = self._state != 'CRITICAL'
        self._set_state('CRITICAL', timestamp)
        self._smoothed_risk = 100.0

        return SafetyDecision(
            state='CRITICAL',
            risk_score=100.0,
            fatigue_score=100.0,
            distraction_score=100.0,
            reasons=['no_face_timeout'],
            timestamp=timestamp,
            state_changed=state_changed,
        )

    def combine(self, fatigue_result, distraction_result, timestamp: Optional[float] = None) -> SafetyDecision:
        if timestamp is None:
            timestamp = time.time()

        distraction_score = distraction_result.score
        fatigue_score = fatigue_result.score
        reasons: List[str] = []

        raw_risk = self._raw_risk(fatigue_score, distraction_score)
        if self._state_since is None:
            self._smoothed_risk = raw_risk
            self._state_since = timestamp
        else:
            self._smoothed_risk = 0.6 * self._smoothed_risk + 0.4 * raw_risk

        state_changed = False

        # NORMAL -> WARNING if risk > 35 for 1s
        if self._state == 'NORMAL':
            if self._smoothed_risk > CONFIG.fusion_warning_risk_threshold:
                if self._normal_to_warning_since is None:
                    self._normal_to_warning_since = timestamp
                elif (timestamp - self._normal_to_warning_since) >= CONFIG.fusion_normal_to_warning_seconds:
                    self._set_state('WARNING', timestamp)
                    reasons.append('risk_gt_35_for_1s')
                    state_changed = True
            else:
                self._normal_to_warning_since = None

        # WARNING -> CRITICAL if risk > 60 for 1.5s
        # WARNING -> NORMAL if risk < 25 for 2s
        elif self._state == 'WARNING':
            if self._smoothed_risk > CONFIG.fusion_critical_risk_threshold:
                if self._warning_to_critical_since is None:
                    self._warning_to_critical_since = timestamp
                elif (timestamp - self._warning_to_critical_since) >= CONFIG.fusion_warning_to_critical_seconds:
                    self._set_state('CRITICAL', timestamp)
                    reasons.append('risk_gt_60_for_1_5s')
                    state_changed = True
            else:
                self._warning_to_critical_since = None

            if not state_changed:
                if self._smoothed_risk < CONFIG.fusion_warning_to_normal_threshold:
                    if self._warning_to_normal_since is None:
                        self._warning_to_normal_since = timestamp
                    elif (timestamp - self._warning_to_normal_since) >= CONFIG.fusion_warning_to_normal_seconds:
                        self._set_state('NORMAL', timestamp)
                        reasons.append('risk_lt_25_for_2s')
                        state_changed = True
                else:
                    self._warning_to_normal_since = None

        # CRITICAL -> WARNING if risk < 40 for 2s
        elif self._state == 'CRITICAL':
            if self._smoothed_risk < CONFIG.fusion_critical_to_warning_threshold:
                if self._critical_to_warning_since is None:
                    self._critical_to_warning_since = timestamp
                elif (timestamp - self._critical_to_warning_since) >= CONFIG.fusion_critical_to_warning_seconds:
                    self._set_state('WARNING', timestamp)
                    reasons.append('risk_lt_40_for_2s')
                    state_changed = True
            else:
                self._critical_to_warning_since = None

        if not reasons:
            reasons.append('timer_state_machine')

        return SafetyDecision(
            state=self._state,
            risk_score=self._smoothed_risk,
            fatigue_score=fatigue_score,
            distraction_score=distraction_score,
            reasons=reasons,
            timestamp=timestamp,
            state_changed=state_changed,
        )