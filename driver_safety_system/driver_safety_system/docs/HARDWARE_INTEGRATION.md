# ESP32 Hardware Integration Guide

This document describes the ESP32 hardware integration for the Driver Safety System.

## Overview

The system sends real-time alerts to an ESP32 microcontroller via USB serial communication to control hardware (LED + buzzer) based on driver state:

- **CRITICAL** -> `b'C'` (red LED + continuous buzzer)
- **WARNING** -> `b'W'` (yellow LED blink + beeping buzzer)
- **NORMAL** -> `b'N'` (green LED + buzzer off)

## Architecture

```
Driver Safety Pipeline (main.py)
    |
Fusion Engine (compute state)
    |
State Change Detection
    |
Hardware Interface (hardware_interface.py)
    |
Serial Port (USB)
    |
ESP32 MicroPython
    |
LED + Buzzer
```

## Files

| File | Purpose |
|------|---------|
| `modules/hardware_interface.py` | Serial communication handler |
| `config.py` | Hardware configuration (port, baudrate, enable flag) |
| `main.py` | Integration with pipeline |
| `test_serial.py` | Manual testing utility |
| `requirements.txt` | Added `pyserial` dependency |

## Configuration

Edit `config.py`:

```python
# Hardware interface settings
enable_hardware: bool = True          # Toggle hardware alerts on/off
serial_port: str = "COM3"             # Serial port (Windows: COM3, Linux: /dev/ttyUSB0, Mac: /dev/tty.*)
serial_baudrate: int = 115200         # Baud rate
```

### Finding Your Serial Port

**Windows:**
- Device Manager -> Ports (COM & LPT) -> Note the COM port number

**Linux/Mac:**
```bash
ls /dev/tty* | grep -E "USB|FTDI"
# or
python -m serial.tools.list_ports
```

## Usage

### Run Full Pipeline with Hardware

```bash
python main.py
```

- Initializes serial connection on startup
- Sends alert only on state changes (no spam)
- Disconnects cleanly on exit (ESC or Q key)

### Test Serial Communication

```bash
# Send CRITICAL
python test_serial.py --port COM3 --critical

# Send NORMAL
python test_serial.py --port COM3 --normal

# Cycle test (NORMAL -> WARNING -> CRITICAL)
python test_serial.py --port COM3 --test-cycle

# Custom port/baudrate
python test_serial.py --port /dev/ttyUSB0 --baudrate 115200 --critical
```

## Serial Protocol

| Command | Byte | Action |
|---------|------|--------|
| NORMAL | `b'N'` | Green LED on, buzzer off |
| WARNING | `b'W'` | Yellow LED blink, buzzer beeping |
| CRITICAL | `b'C'` | Red LED on, buzzer continuous |

## Hardware Interface API

### HardwareInterface Class

```python
from modules.hardware_interface import HardwareInterface

# Initialize
hw = HardwareInterface(port="COM3", baudrate=115200)

# Connect
if hw.connect():
    print("Connected!")

# Send alert
hw.send_alert("CRITICAL")  # Sends b'C'
hw.send_alert("WARNING")   # Sends b'W'
hw.send_alert("NORMAL")    # Sends b'N'

# Check status
if hw.is_connected():
    print("Still connected")

# Disconnect
hw.disconnect()
```

## Logging

The system logs all hardware events:

```
2026-04-16 10:30:45 - __main__ - INFO - ESP32 connected on COM3 @ 115200 baud
2026-04-16 10:30:50 - __main__ - INFO - Sent CRITICAL
2026-04-16 10:31:00 - __main__ - INFO - Sent NORMAL
2026-04-16 10:31:30 - __main__ - INFO - ESP32 disconnected
```

## Behavior

### Connection Initialization

- Happens once at startup (not per frame)
- 2-second delay after opening to allow ESP32 bootloader to complete
- Gracefully handles missing/disconnected ESP32

### Frame Loop

- Processes video frame normally
- Computes driver state (NORMAL/WARNING/CRITICAL)
- **Only** sends serial command if state **changed**
- Does not block on serial write (timeout configured)

### Error Handling

| Scenario | Behavior |
|----------|----------|
| `enable_hardware = False` | Runs normally, skips all serial operations |
| Pyserial not installed | Logs warning, continues without hardware |
| ESP32 disconnected | Logs error, continues video pipeline |
| Serial write fails | Logs error, marks as disconnected |

## ESP32 MicroPython Example

```python
# On ESP32, listen for commands

import machine
import time

buzzer = machine.Pin(5, machine.Pin.OUT)   # GPIO5
led = machine.Pin(4, machine.Pin.OUT)      # GPIO4

def handle_command(cmd):
    if cmd == ord('N'):
        buzzer.off()
        led.on()
        print("NORMAL")
    elif cmd == ord('W'):
        led.on()
        buzzer.on()
        time.sleep(0.2)
        buzzer.off()
        time.sleep(0.3)
    elif cmd == ord('C'):
        buzzer.on()
        led.on()
        print("CRITICAL")

# In main loop
uart = machine.UART(0, 115200)
while True:
    if uart.any():
        byte = uart.read(1)
        handle_command(byte[0])
    time.sleep(0.1)
```

## Troubleshooting

### "ESP32 not connected" / "Failed to connect"

1. Check USB cable is connected
2. Verify correct serial port in `config.py`
3. Check ESP32 is running and listening
4. Try: `python test_serial.py --port COM3 --test-cycle`

### No response from ESP32

1. Check ESP32 MicroPython code is running
2. Verify baud rate matches (115200 default)
3. Check GPIO pins match your wiring
4. Monitor ESP32 serial output directly

### "pyserial not installed"

```bash
pip install pyserial
# or
pip install -r requirements.txt
```

### Serial data not reaching ESP32

1. Use `test_serial.py` to verify commands send
2. Monitor ESP32 UART with separate terminal:
   ```bash
   picocom /dev/ttyUSB0 -b 115200
   ```
3. Check USB driver (CH340, CP2102, etc.) is installed

## Performance

- **Latency**: < 10ms (serial write only on state change)
- **CPU Impact**: Negligible (separate background I/O)
- **Framerate**: No impact (non-blocking serial calls)
- **Memory**: ~2KB for serial buffer

## Safety Notes

1. **No blocking calls** in main loop
2. **State change detection** prevents serial spam
3. **Graceful degradation** if hardware unavailable
4. **Clean shutdown** on exit (disconnect serial)
5. **Timeout protection** on serial writes

## Future Enhancements

- [ ] Persistent connection status UI
- [ ] Serial health check with periodic heartbeat
- [ ] State history logging to file
- [ ] Multi-device support (multiple alerts)
- [ ] Configurable alert strength (WARNING ≠ CRITICAL)
- [ ] MQTT bridge for remote monitoring
