from dataclasses import dataclass


@dataclass(frozen=True)
class SystemConfig:
    camera_index: int = 0
    frame_width: int = 1280
    frame_height: int = 720
    min_detection_confidence: float = 0.5
    min_tracking_confidence: float = 0.5

    ear_closed_threshold: float = 0.22
    ear_open_threshold: float = 0.25
    blink_min_duration: float = 0.08
    blink_max_duration: float = 0.45
    eye_closure_warning_duration: float = 1.0
    eye_closure_critical_duration: float = 2.0

    # Adaptive EAR calibration and smoothing
    ear_baseline_calibration_seconds: float = 8.0
    ear_baseline_min_samples: int = 50
    ear_threshold_multiplier: float = 0.70
    ear_smoothing_window: int = 10
    use_ear_ema_smoothing: bool = False
    ear_ema_alpha: float = 0.35
    default_fps: float = 30.0

    # Temporal closure classification
    blink_duration_max_seconds: float = 0.4
    fatigue_warning_closure_seconds: float = 0.4
    microsleep_duration_seconds: float = 1.0
    moderate_eye_closure_warning_seconds: float = 0.6
    frequent_blink_rate_warning: float = 18.0
    low_ear_margin: float = 0.03

    blink_rate_warning_low: float = 8.0
    blink_rate_critical_low: float = 5.0

    mar_yawn_threshold: float = 0.62
    yawn_warning_duration: float = 0.7
    yawn_critical_duration: float = 1.5

    yaw_warning_degrees: float = 20.0
    yaw_critical_degrees: float = 35.0
    pitch_warning_degrees: float = 15.0
    pitch_critical_degrees: float = 25.0
    distraction_warning_duration: float = 1.0
    distraction_critical_duration: float = 2.0

    # Head-pose temporal filtering
    head_pose_stability_seconds: float = 1.2
    head_nod_pitch_threshold: float = 18.0
    head_nod_sustain_seconds: float = 1.5

    fatigue_weight: float = 0.6
    distraction_weight: float = 0.4
    warning_state_threshold: float = 35.0
    critical_state_threshold: float = 70.0
    state_hysteresis_seconds: float = 1.0

    # Simplified fusion state-machine thresholds
    fusion_warning_risk_threshold: float = 35.0
    fusion_critical_risk_threshold: float = 60.0
    fusion_warning_to_normal_threshold: float = 25.0
    fusion_critical_to_warning_threshold: float = 40.0
    fusion_normal_to_warning_seconds: float = 1.0
    fusion_warning_to_critical_seconds: float = 1.5
    fusion_warning_to_normal_seconds: float = 2.0
    fusion_critical_to_warning_seconds: float = 2.0

    # Runtime loop control
    logic_update_interval_seconds: float = 0.2

    # Rule-based fusion persistence (state confirmation)
    warning_confirmation_seconds: float = 2.5
    critical_confirmation_seconds: float = 1.8

    # Vision robustness (reserved for preprocessing integration)
    enable_low_light_equalization: bool = True

    overlay_font_scale: float = 0.6
    overlay_thickness: int = 2

    # Hardware interface settings
    enable_hardware: bool = True
    serial_port: str = "COM3"
    serial_baudrate: int = 115200
    hardware_default_state: str = "OFF"
    hardware_resend_interval_seconds: float = 1.5
    no_face_hardware_timeout_seconds: float = 2.0
    no_face_hardware_state: str = "WARNING"


CONFIG = SystemConfig()