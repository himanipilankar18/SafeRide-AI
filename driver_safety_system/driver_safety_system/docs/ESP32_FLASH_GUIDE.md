# ESP32 Firmware Flash Guide

## Requirements

- **USB cable**: Micro-B USB cable (same as Android phones)
- **USB driver** (Windows only): CH340/CH341 driver if not already installed
- **MicroPython**: Version 1.20+ recommended
- **ESP32 board**: Any ESP32 variant

## Option 1: Thonny IDE (Easiest - Recommended)

### Step 1: Download & Install Thonny

Download from: **https://thonny.org/**

Install like any normal application.

### Step 2: Connect ESP32

1. Connect ESP32 to computer via USB Micro-B cable
2. LED on ESP32 board should light up (power indicator)
3. Wait 2-3 seconds for driver initialization

### Step 3: Install MicroPython on ESP32

In Thonny:

1. Go to **Tools → Options → Interpreter**
2. Select **MicroPython (ESP32)**
3. Port: Auto or select your COM port
4. Click **Install or upgrade firmware**
5. Wait for download and installation (~30 seconds)
6. Click OK when done

### Step 4: Upload Firmware Code

1. In Thonny, open the file: `hardware/esp32/main.py`
2. Right-click on the file in file browser on left
3. Select **Save to / → main.py** (saves to ESP32)
4. **Ctrl+Shift+F5** to restart ESP32 and run code

**Expected Output** (in Thonny console):
```
=== Driver Safety System - ESP32 Firmware ===
GPIO 4 (Green) | GPIO 5 (Yellow) | GPIO 18 (Red) | GPIO 15 (Buzzer)
Waiting for commands: N (normal), W (warning), C (critical)
```

### Step 5: Test

Open serial terminal in Thonny:

```bash
# Type in Thonny console:
from machine import Pin
green = Pin(4, Pin.OUT)
green.on()
```

Green LED should light up.

---

## Option 2: Command-Line Flash (Advanced)

### Using `esptool.py`

**Install**:
```bash
pip install esptool
```

**Erase ESP32**:
```bash
esptool.py -p COM3 erase_flash
```

**Flash MicroPython binary**:
```bash
# Download MicroPython from: https://micropython.org/download/esp32/
# Latest: esp32-20240102-v1.22.0.bin

esptool.py -p COM3 --baud 460800 write_flash -z 0x1000 esp32-20240102-v1.22.0.bin
```

**Upload firmware code** (using `ampy`):
```bash
pip install adafruit-ampy

ampy -p COM3 -b 115200 put hardware/esp32/main.py :/
ampy -p COM3 -b 115200 run hardware/esp32/main.py
```

---

## Option 3: Web-based Flash (Modern Option)

**No installation required!**

1. Go to: **https://labs.ubidots.com/microbit/**
2. Or: **https://espressif.github.io/esptool-js/**
3. Click **Connect**
4. Select your ESP32 port
5. Load `hardware/esp32/main.py` from file browser
6. Click **Flash**

---

## Windows: Installing USB Driver (If Needed)

If Thonny doesn't detect COM port:

1. **Check Device Manager** for unknown device
2. Download **CH340 driver**: https://www.wch.cn/downloads/ch341ser_exe.html
3. Install the driver
4. Restart Thonny
5. Reconnect ESP32

---

## Verify Installation

### Option A: Test with Thonny

1. Open Thonny console
2. Type:
   ```python
   import machine
   led = machine.Pin(4, machine.Pin.OUT)
   led.on()
   led.off()
   ```
3. Green LED should toggle on/off

### Option B: Test with Python Test Script

1. Flash hardware/esp32/main.py as described above
2. Run in separate terminal:
   ```bash
   python test_serial.py --port COM3 --normal
   ```
3. Check console for "Sent NORMAL"
4. Watch for green LED to light up

---

## Troubleshooting

### "Port not found" or "No serial devices found"

**Solution**:
1. Try a different USB cable (must be data cable, not power-only)
2. Try different USB port on computer
3. Restart ESP32 (unplug USB, wait 2s, plug back in)
4. On Windows: Reinstall CH340 driver

### "Device not responding" during flash

**Solution**:
1. Hold **BOOT** button on ESP32 while uploading
2. Or press **RST** (reset) button after upload starts
3. Try slower baud rate: `esptool.py -p COM3 --baud 115200 write_flash ...`

### MicroPython not working after flash

**Solution**:
1. In Thonny, go to **Tools → Options → Interpreter**
2. Select **MicroPython (ESP32)**
3. Click **Install or upgrade micropython firmware**
4. Wait for installation
5. Restart Thonny

### "ModuleNotFoundError: No module named 'machine'"

**Solution**:
1. MicroPython is not installed on ESP32
2. Use Thonny to install (Option 1 above)
3. Or use esptool to flash official MicroPython binary

---

## Quick Command Reference

| Task | Command |
|------|---------|
| List ports | `python -m serial.tools.list_ports` |
| Flash MicroPython | `esptool.py -p COM3 write_flash -z 0x1000 esp32-*.bin` |
| Upload code | `ampy -p COM3 put hardware/esp32/main.py :main.py` |
| Read serial | `python -m serial.tools.miniterm COM3 115200` |
| Test system | `python test_serial.py --port COM3 --test-cycle` |

---

## After Successful Flash

1. **System restarts automatically**
2. **Console shows startup message** (in Thonny or miniterm)
3. **Ready to receive serial commands** (N, W, C)
4. **Can now test with test_serial.py**

---

## Backup: Manual Debugging

If something isn't working, use Thonny to manually test:

```python
# Test Green LED
import machine
green = machine.Pin(4, machine.Pin.OUT)
green.on()   # Should light up
green.off()

# Test Yellow LED
yellow = machine.Pin(5, machine.Pin.OUT)
yellow.on()
yellow.off()

# Test Red LED
red = machine.Pin(18, machine.Pin.OUT)
red.on()
red.off()

# Test Buzzer
buzzer = machine.Pin(15, machine.Pin.OUT)
buzzer.on()    # Should beep
import time
time.sleep(1)
buzzer.off()
```

If any LED doesn't light up:
- Check GPIO number in code matches your wiring
- Check resistor is in place for LED
- Check LED polarity (long leg = +)
- Check GND connection

---

## Next Steps

✅ Flash ESP32 with `hardware/esp32/main.py`
✅ Test LEDs/buzzer with Thonny console
✅ Verify serial communication works
✅ Assemble full hardware per `HARDWARE_WIRING.md`
✅ Run `python main.py` and enjoy!

---

**Recommended Setup Path**:

```
1. Download Thonny (5 min)
2. Install MicroPython via Thonny (5 min)
3. Upload hardware/esp32/main.py (1 min)
4. Test basic LED control in Thonny console (3 min)
5. Assemble breadboard hardware (10 min)
6. Run test_serial.py --test-cycle (2 min)
7. Run main.py with camera (go!)
```

**Total time: ~30 minutes**
