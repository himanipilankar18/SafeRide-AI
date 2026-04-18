# Hardware Integration - Quick Start Guide

## 1. Install Dependency

```bash
pip install pyserial
# or
pip install -r requirements.txt
```

## 2. Configure Serial Port

Edit `config.py`:

```python
enable_hardware: bool = True      # Enable/disable hardware alerts
serial_port: str = "COM3"         # Change to your ESP32 port
serial_baudrate: int = 115200     # Usually 115200
```

**Find your port:**

- **Windows**: Device Manager -> Ports -> Look for "USB Serial" or similar
- **Linux**: `ls /dev/tty* | grep USB`
- **Mac**: `ls /dev/tty.* | grep -i usb`

## 3. Test Connection (Before Running Full Pipeline)

```bash
# Test if ESP32 is on the port
python test_serial.py --port COM3 --critical

# Expected output:
# INFO - Attempting to connect to COM3...
# INFO - Connection successful!
# INFO - ESP32 connected on COM3 @ 115200 baud
# INFO - Sent CRITICAL
```

## 4. Run Full Pipeline

```bash
python main.py
```

You should see in the console:

```
INFO - ESP32 connected on COM3 @ 115200 baud
INFO - Sent CRITICAL     # When driver state -> CRITICAL
INFO - Sent NORMAL       # When driver state -> NORMAL
INFO - ESP32 disconnected           # On exit (ESC/Q)
```

## 5. What to Expect

| Driver State | Action | Serial Command |
|-------------|--------|-----------------|
| CRITICAL | Red LED ON, buzzer continuous | `b'C'` |
| WARNING | Yellow LED blinking, buzzer beeping | `b'W'` |
| NORMAL | Green LED ON, buzzer OFF | `b'N'` |

**Important**: Commands only send when state **changes**, not every frame.

## Disable Hardware (for testing without ESP32)

In `config.py`, set:

```python
enable_hardware: bool = False
```

The system will run normally without sending serial commands.

## Manual Testing Scenarios

```bash
# Test 1: Send CRITICAL state
python test_serial.py --port COM3 --critical

# Test 2: Send NORMAL state
python test_serial.py --port COM3 --normal

# Test 3: Cycle test (NORMAL -> WARNING -> CRITICAL)
python test_serial.py --port COM3 --test-cycle

# Test 4: Custom baudrate
python test_serial.py --port COM3 --baudrate 9600 --critical
```

## Logs

The system logs:

- Connection success/failure
- Each state command sent
- Disconnection

View in console when running:

```
2026-04-16 10:30:45 - __main__ - INFO - ESP32 connected on COM3 @ 115200 baud
2026-04-16 10:30:50 - __main__ - INFO - Sent CRITICAL
```

## Common Issues

| Problem | Solution |
|---------|----------|
| "Failed to connect to ESP32" | Check serial port in config.py |
| No output from --critical test | Verify USB cable, try different port |
| Buzzer doesn't turn on | ESP32 code not listening, check MicroPython code |
| Serial timeout errors | Try slower baudrate (9600 instead of 115200) |

## ESP32 MicroPython Code Example

```python
import machine
import time

green = machine.Pin(4, machine.Pin.OUT)
yellow = machine.Pin(5, machine.Pin.OUT)
red = machine.Pin(18, machine.Pin.OUT)
buzzer = machine.Pin(15, machine.Pin.OUT)
uart = machine.UART(0, 115200)

while True:
    if uart.any():
        cmd = uart.read(1)
        if cmd == b'N':
            green.on(); yellow.off(); red.off(); buzzer.off()
        elif cmd == b'W':
            green.off(); yellow.on(); red.off(); buzzer.on(); time.sleep(0.2)
            yellow.off(); buzzer.off(); time.sleep(0.3)
        elif cmd == b'C':
            green.off(); yellow.off(); red.on(); buzzer.on()
```

## Expected File Structure

```
driver_safety_system/
|- main.py
|- config.py
|- test_serial.py
|- modules/
|  |- hardware_interface.py
|- hardware/esp32/main.py
|- docs/HARDWARE_INTEGRATION.md
`- requirements.txt
```

## Next Steps

1. Install pyserial
2. Find and configure serial port
3. Test with `test_serial.py`
4. Flash ESP32 with `hardware/esp32/main.py`
5. Run full pipeline with `python main.py`

## Support

See `HARDWARE_INTEGRATION.md` for:
- Detailed architecture
- Complete API reference
- Troubleshooting guide
- Performance notes
- Safety considerations
