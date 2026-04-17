# Driver Safety System - Real-Time Monitoring with ESP32 Alerts

A real-time driver safety system using OpenCV and MediaPipe to detect fatigue and distraction, with hardware alerts via ESP32 (buzzer + LED).

## Features

✅ **Real-time driver monitoring**
- Eye closure detection (EAR-based)
- Blink rate analysis
- Yawn detection (mouth aspect ratio)
- Head pose estimation (yaw/pitch/roll)
- Distraction detection from head orientation

✅ **Intelligent state machine**
- NORMAL: Safe driving
- WARNING: Mild risk factors
- CRITICAL: Severe fatigue/distraction
- Hysteresis to avoid state jitter

✅ **Hardware integration**
- USB serial communication with ESP32
- Real-time alert triggers (buzzer + LED)
- Graceful fallback if hardware unavailable
- Non-blocking serial writes

✅ **Modular design**
- Separated concerns (face, eyes, head, fatigue, distraction, fusion)
- Centralized configuration
- Offline evaluation pipeline with metrics
- Production-ready error handling

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure (Optional)

Edit `config.py`:

```python
# Hardware settings
enable_hardware: bool = True
serial_port: str = "COM3"        # Your ESP32 port
serial_baudrate: int = 115200
```

### 3. Run

```bash
python main.py
```

**Exit**: Press ESC or Q

### 4. Test Hardware (Optional)

```bash
python test_serial.py --port COM3 --normal
python test_serial.py --port COM3 --warning
python test_serial.py --port COM3 --critical
```

## Project Structure

```
driver_safety_system/
├── app/
│   └── main.py                      # Real-time application loop
├── main.py                          # Compatibility entrypoint (calls app/main.py)
├── configs/
│   └── config.py                    # Canonical tunable parameters
├── config.py                        # Compatibility shim
├── requirements.txt                 # Python dependencies
│
├── modules/
│   ├── face_detector.py            # MediaPipe face landmarks
│   ├── eye_analysis.py             # EAR + blink + closure
│   ├── head_pose.py                # 3D head pose estimation
│   ├── distraction.py              # Head-based distraction detection
│   ├── fatigue.py                  # Multi-signal fatigue scoring
│   ├── fusion.py                   # Risk fusion + state machine
│   ├── alert.py                    # Console + UI overlay alerts
│   └── hardware_interface.py       # Serial communication (NEW)
│
├── utils/
│   ├── math_utils.py               # EAR, mouth ratio, Euler angles
│   └── timers.py                   # Duration + rolling window timers
│
├── testing/
│   ├── run_classification_frames_tests.py  # Offline evaluation
│   └── results/
│       └── clip_summary_test.csv
│
├── classification_frames/           # Annotated test dataset
│   ├── annotations_train.json
│   ├── annotations_val.json
│   ├── annotations_test.json
│   ├── annotations_holdout.json
│   └── [clip folders with frames]
│
├── models/
│   └── face_landmarker.task        # MediaPipe model (auto-downloaded)
│
├── hardware/
│   └── esp32/
│       ├── main.py                 # Canonical MicroPython firmware to flash
│       └── legacy/
│           └── esp32_firmware.py   # Older firmware version
│
├── test_serial.py                  # Manual hardware testing (NEW)
├── docs/                           # Project documentation
│   ├── HARDWARE_QUICKSTART.md      # Hardware setup guide
│   ├── HARDWARE_INTEGRATION.md     # Full hardware documentation
│   ├── HARDWARE_CHECKLIST.md       # Deployment checklist
│   ├── HARDWARE_WIRING.md          # Wiring reference
│   ├── HARDWARE_SETUP_MULTISTATE.md
│   ├── HARDWARE_IMPLEMENTATION_SUMMARY.md
│   └── ESP32_FLASH_GUIDE.md
└── README.md                        # This file
```

## Hardware Integration

### What It Does

When driver state changes, the system sends commands to an ESP32 via USB serial:

| State | Action | Command |
|-------|--------|---------|
| NORMAL | Green LED, buzzer off | `b'N'` |
| WARNING | Yellow LED blink, soft buzzer | `b'W'` |
| CRITICAL | Red LED, strong alert buzzer | `b'C'` |

### Setup

1. **Install pyserial**:
   ```bash
   pip install pyserial
   ```

2. **Find ESP32 serial port**:
   ```bash
   python -m serial.tools.list_ports
   ```

3. **Update config.py**:
   ```python
   serial_port: str = "COM3"  # Your port here
   enable_hardware: bool = True
   ```

4. **Flash ESP32 with canonical MicroPython listener**:
   ```python
   import machine
   # Upload hardware/esp32/main.py to ESP32 as device main.py using Thonny
   # Supported commands over USB serial: N, W, C
   ```

5. **Test it**:
   ```bash
   python test_serial.py --port COM3 --normal
   python test_serial.py --port COM3 --warning
   python test_serial.py --port COM3 --critical
   ```

For complete hardware guide, see **[docs/HARDWARE_QUICKSTART.md](docs/HARDWARE_QUICKSTART.md)** or **[docs/HARDWARE_INTEGRATION.md](docs/HARDWARE_INTEGRATION.md)**.

## Configuration

All tunable parameters in `config.py`:

### Detection & Tracking
- `min_detection_confidence`: MediaPipe face detection threshold
- `min_tracking_confidence`: Tracking stability threshold

### Eye Monitoring
- `ear_closed_threshold`: EAR below this = eyes closed
- `ear_open_threshold`: EAR above this = eyes open
- `blink_min_duration`, `blink_max_duration`: Valid blink time window
- `eye_closure_warning_duration`: Alert threshold for sustained closure
- `blink_rate_warning_low`: Low blink rate threshold

### Distraction Detection
- `yaw_warning_degrees`, `yaw_critical_degrees`: Head turn limits
- `pitch_warning_degrees`, `pitch_critical_degrees`: Head pitch limits
- `distraction_warning_duration`, `distraction_critical_duration`: Duration thresholds

### Fatigue Scoring
- Component weights: EAR (30%), blink rate (25%), eye closure (25%), yawn (10%), head pose (10%)

### State Machine
- 5 Hz logic loop (`logic_update_interval_seconds`)
- Smoothed risk: 0.6(previous) + 0.4(current)
- Timer-based transitions in `modules/fusion.py`
- No-face timeout forces CRITICAL

### Hardware
- `enable_hardware`: Toggle ESP32 alerts
- `serial_port`: Serial port name (COM3, /dev/ttyUSB0, etc.)
- `serial_baudrate`: Baud rate (115200 recommended)

## Usage Modes

### Mode 1: Real-Time Monitoring

```bash
python main.py
```

Outputs:
- Live video feed with state overlay
- Console state transitions + alerts
- Hardware alerts (if ESP32 connected)

### Mode 2: Offline Evaluation

```bash
python testing/run_classification_frames_tests.py --split test
```

Evaluates on annotated frames, outputs:
- `model_output_<split>.csv` - Frame-level predictions
- `clip_summary_<split>.csv` - Per-clip statistics
- `overall_summary_<split>.json` - Metrics (accuracy, F1, confusion)

### Mode 3: Hardware Testing

```bash
python test_serial.py --port COM3 --test-cycle
```

Manual serial testing without full pipeline.

## Current Performance

Offline evaluation on test split (2,491 frames from 5 clips):

```
Accuracy: 64.15%
Balanced Accuracy: 57.79%
Macro F1: 0.5780

Alert Class (normal/awake):
  Precision: 0.7406
  Recall: 0.7428
  F1: 0.7417

Microsleep Class (drowsy/fatigue):
  Precision: 0.4158
  Recall: 0.4131
  F1: 0.4144
```

⚠️ **Note**: Model is rule-based (threshold-driven), not ML-trained. Can be improved by:
- Tuning thresholds in `config.py`
- Collecting more annotated data
- Training a DNN classifier
- Adding temporal context (LSTM)

## Dependencies

```
opencv-python   # Video capture & overlay
mediapipe       # Face landmarks + pose
numpy           # Numeric operations
pyserial        # ESP32 serial communication
```

## Architecture Flow

```
Camera → Frame Capture
  ↓
Face Detector (MediaPipe)
  ├→ [No Face] → Skip to overlay
  └→ Extract 468 landmarks
      ↓
      +→ Eye Analyzer (EAR + blink + closure)
      +→ Head Pose Estimator (rotation matrix → Euler)
      +→ Fatigue Monitor (multi-signal scoring)
      |
      └→ Distraction Monitor (head angle + duration)
          ↓
               Fusion Engine (smoothed risk + timer state machine)
            ↓
            SafetyDecision (state, risk_score, reasons)
              ↓
              ├→ Alert Manager (console + overlay)
              └→ Hardware Interface (ESP32 serial)
                  ↓
                  Draw overlay → Display

Logic loop runs at ~5 Hz for state/risk updates while camera rendering stays at full FPS.
```

## Logging

All important events logged with timestamps:

```
2026-04-16 10:30:45 - __main__ - INFO - ESP32 connected on COM3 @ 115200 baud
2026-04-16 10:30:50 - __main__ - INFO - [STATE] NORMAL | risk=12.3 | fatigue=8.5 | distraction=0.0
2026-04-16 10:31:00 - __main__ - INFO - [STATE] CRITICAL | risk=75.2 | fatigue=68.1 | distraction=12.5
2026-04-16 10:31:00 - __main__ - INFO - [SIGNALS] eye_closure, blink_rate
2026-04-16 10:31:00 - __main__ - INFO - Sent CRITICAL
```

## Troubleshooting

### ESP32 Not Responding

```bash
# 1. Test connection
python test_serial.py --port COM3 --normal

# 2. Check port exists
python -m serial.tools.list_ports

# 3. Verify ESP32 code is running
# (Manually check ESP32 via separate serial terminal)
```

See **[docs/HARDWARE_CHECKLIST.md](docs/HARDWARE_CHECKLIST.md)** for detailed debugging.

### Performance Issues

- Reduce frame resolution in `config.py` (frame_width, frame_height)
- Lower detection confidence threshold
- Disable overlay drawing (comment out in main.py)

### No Face Detection

- Improve lighting
- Move closer to camera
- Adjust detection confidence lower

## Development Notes

### Adding New Signals

1. Create new detector module in `modules/`
2. Return dataclass with metrics
3. Add to `main.py` pipeline
4. Integrate into fatigue/distraction scoring
5. Update tests

### Tuning Thresholds

1. Edit `config.py` with new values
2. Run offline evaluation: `testing/run_classification_frames_tests.py`
3. Compare metrics before/after
4. Repeat until satisfied

### Extending to New Outputs

- Modify [modules/alert.py](modules/alert.py) for custom alerts
- Modify [modules/fusion.py](modules/fusion.py) for new states
- Add new hardware protocols in [modules/hardware_interface.py](modules/hardware_interface.py)

## Future Enhancements

- [ ] LSTM for temporal context
- [ ] Multi-face support
- [ ] Eye gaze direction
- [ ] Road scene understanding
- [ ] Driver behavior patterns
- [ ] Cloud telemetry
- [ ] Configurable alert profiles (gentle/aggressive)

## License

[Add your license here]

## Contact

[Contact info if applicable]

---

**Quick Links**:
- [Hardware Quick Start](docs/HARDWARE_QUICKSTART.md)
- [Hardware Full Guide](docs/HARDWARE_INTEGRATION.md)
- [Deployment Checklist](docs/HARDWARE_CHECKLIST.md)
- [Configuration Reference](configs/config.py)
