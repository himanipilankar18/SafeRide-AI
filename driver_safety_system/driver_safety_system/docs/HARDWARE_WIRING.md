# Hardware Wiring & Assembly Guide

## Components Required

| Component | Qty | Notes |
|-----------|-----|-------|
| ESP32 Development Board | 1 | Any ESP32 variant (tested on ESP32 DevKit) |
| Breadboard | 1 | Standard 400-hole breadboard |
| LED (Green) | 1 | 3mm or 5mm, common cathode |
| LED (Yellow) | 1 | 3mm or 5mm, common cathode |
| LED (Red) | 1 | 3mm or 5mm, common cathode |
| Resistor (220Ω) | 3 | 1/4W carbon film |
| Buzzer | 1 | Active buzzer (5V or 3.3V rated) |
| Jumper Wires | ~15 | Standard male-to-male breadboard wires |
| USB Cable | 1 | USB-A to USB Micro-B (for ESP32 power + serial) |

## Breadboard Layout Diagram

```
ESP32 PINS (Left side)                    POWER RAILS (Right side)

GND ━━━━━━━━━━━━━━━━━┓                    ┏━━━ 3.3V
VCC (3.3V) ━━━━━━━━━┓│┌───────────────────┐
GPIO 4 (Green)  ━━━━━┃│                   ├─┫ Green LED (long leg)
GPIO 5 (Yellow) ━━━━┃│ BREADBOARD        ├─┫ Yellow LED (long leg)
GPIO 18 (Red)   ━━━━┃│                   ├─┫ Red LED (long leg)
GPIO 15 (Buzzer)━━━━┃│                   │ └─220Ω to each LED short leg
GND ━━━━━━━━━━━━━━━━┃│                   ├─┫ Buzzer Signal
                    ││                   ├─┫ Buzzer VCC (3.3V)
                    ││                   ├─ Buzzer GND
                    └┴───────────────────┘
```

## Detailed Wiring Instructions

### Step 1: Prepare Resistors

Cut and bend three 220Ω resistors. These will be used as current-limiting resistors for the LEDs.

### Step 2: Connect Power Rails

1. **GND Rail**: Connect ESP32 GND pin to the ground rail on breadboard
2. **VCC Rail**: Connect ESP32 3.3V pin to the positive rail on breadboard
   - Ensure both positive and ground rails run the full length of breadboard

### Step 3: Connect Green LED (NORMAL State)

```
Breadboard layout:
┌─────────────────┐
│ Positive Rail   │
├─────────────────┤
│ GPIO4 - 220Ω ─ LED+ (long)
│                 LED- (short) ─ GND Rail
└─────────────────┘
```

**Wiring**:
1. ESP32 GPIO 4 → jumper wire → breadboard column
2. Into same column, attach 220Ω resistor
3. Other end of resistor → Green LED long leg (anode, +)
4. Green LED short leg (cathode, -) → GND rail via jumper wire

### Step 4: Connect Yellow LED (WARNING State)

```
Breadboard layout:
┌─────────────────┐
│ Positive Rail   │
├─────────────────┤
│ GPIO5 - 220Ω ─ LED+ (long)
│                 LED- (short) ─ GND Rail
└─────────────────┘
```

**Wiring**:
1. ESP32 GPIO 5 → jumper wire → breadboard column
2. Into same column, attach 220Ω resistor
3. Other end of resistor → Yellow LED long leg
4. Yellow LED short leg → GND rail

### Step 5: Connect Red LED (CRITICAL State)

```
Breadboard layout:
┌─────────────────┐
│ Positive Rail   │
├─────────────────┤
│ GPIO18 - 220Ω ─ LED+ (long)
│                  LED- (short) ─ GND Rail
└─────────────────┘
```

**Wiring**:
1. ESP32 GPIO 18 → jumper wire → breadboard column
2. Into same column, attach 220Ω resistor
3. Other end of resistor → Red LED long leg
4. Red LED short leg → GND rail

### Step 6: Connect Buzzer

**Active Buzzer (recommended for ease)**:
- Buzzer has +, -, and signal pins (check datasheet)
- Signal → ESP32 GPIO 15
- VCC → 3.3V rail (or 5V if rated for it)
- GND → GND rail

**Alternative: Passive Buzzer**:
- One leg → GPIO 15 (via 220Ω resistor)
- Other leg → GND rail

### Step 7: Verify Connections

Before powering on, check:
- ✅ All LEDs have 220Ω resistor in series
- ✅ All LED cathodes (short legs) connected to same GND rail
- ✅ All LED anodes (long legs) connected through resistor to their GPIO
- ✅ Buzzer VCC connected to 3.3V or 5V power
- ✅ Buzzer GND connected to GND rail
- ✅ Buzzer signal pin connected to GPIO 15
- ✅ No jumper wire bridges overlapping positions

## Physical Assembly Checklist

### Before Connecting USB

- [ ] Breadboard layout matches diagram above
- [ ] All resistors in place and not bent into adjacent holes
- [ ] No jumper wires accidentally crossing other connections
- [ ] ESP32 properly seated in breadboard (not tilted)
- [ ] LEDs inserted with correct polarity (long leg = +, short leg = -)

### Visual Test (No Power)

Hold breadboard up to light and verify:
- [ ] No jumper wires touching each other
- [ ] Components not touching the back of the board
- [ ] Resistors fully seated in breadboard

### Power On

1. Connect ESP32 USB to computer
2. ESP32 should power on (LED indicator on board lights up)
3. Check device appears in Device Manager (Windows) or `lsusb` (Linux/Mac)

## GPIO Pin Summary

| Function | GPIO | Voltage | Purpose |
|----------|------|---------|---------|
| Green LED | 4 | 3.3V | NORMAL state indicator |
| Yellow LED | 5 | 3.3V | WARNING state indicator |
| Red LED | 18 | 3.3V | CRITICAL state indicator |
| Buzzer | 15 | PWM | Audio alert |
| GND | GND | 0V | Common ground (all components) |
| 3.3V | 3.3V | 3.3V | Power rail (LED resistors, buzzer) |

## Current Draw Estimation

| Component | Current | Notes |
|-----------|---------|-------|
| Green LED | ~10mA | LED current with 220Ω resistor |
| Yellow LED | ~10mA | LED current with 220Ω resistor |
| Red LED | ~10mA | LED current with 220Ω resistor |
| Buzzer | ~30-50mA | Depends on buzzer model |
| **Total** | **~60-80mA** | Well within ESP32 pin current limits |

**Note**: ESP32 GPIO pins can supply up to 40mA per pin and 1A total. Our design is safe.

## Testing After Assembly

### Step 1: Flash ESP32

Load `hardware/esp32/main.py` onto ESP32 using:
- Thonny IDE (easiest)
- ampy command-line tool
- Or MicroPython WebIDE

### Step 2: Check Serial Connection

```bash
python -m serial.tools.list_ports
```

Find your ESP32 port (e.g., `COM3`)

### Step 3: Test Each State

Open separate terminal:

```bash
# Test NORMAL - should light green LED only
python test_serial.py --port COM3 --normal
[Wait 5 seconds, watch green LED]

# Test WARNING - should blink yellow LED, beep buzzer
python test_serial.py --port COM3 --warning
[Watch yellow LED blink, listen for buzzer beeping for 5 seconds]

# Test CRITICAL - should light red LED, continuous buzzer
python test_serial.py --port COM3 --critical
[Watch red LED, listen for continuous buzzer for 5 seconds]

# Full cycle test
python test_serial.py --port COM3 --test-cycle
[Watches all states cycle continuously]
```

## Troubleshooting

### LED Doesn't Light Up

1. **Check polarity**: Long leg (+) should go to resistor, short leg (-) to GND
2. **Test LED independently**: 
   - Use multimeter to check LED current
   - Or swap with known working LED
3. **Check resistor**: 
   - Measure resistance (should be ~220Ω)
   - Try different resistor value (180Ω-470Ω range okay)

### LED Very Dim

- Resistor value too high (try 150Ω or 180Ω)
- Or LED rated for higher current (try 150Ω resistor)

### Buzzer Doesn't Work

1. **Check polarity**: Buzzer is polarity-sensitive
   - Try reversing the connections
2. **Check voltage**: Buzzer may need 5V instead of 3.3V
3. **Test directly**: Briefly connect buzzer to 3.3V/5V and GND directly
4. **Check pin**: Ensure GPIO 15 is not reserved by ESP32 for other functions

### Serial Connection Fails

1. Check USB cable (should be data cable, not power-only)
2. Install USB CH340 driver if needed (for some ESP32 boards)
3. Try different USB port
4. Restart ESP32 (unplug USB, wait 2s, plug back in)

## Improvements & Advanced Features

### Adding Potentiometer for Brightness Control

```
Potentiometer → ADC pin (GPIO 35)
Scale PWM brightness 0-255 based on pot value
```

### Adding Button for Manual Reset

```
Button → GPIO pin with debouncing
Press to reset to NORMAL state
```

### PWM LED Brightness (Instead of Full On/Off)

Modify `hardware/esp32/main.py` to use PWM for smoother control:
```python
led = machine.PWM(machine.Pin(4))
led.freq(1000)  # 1kHz PWM
led.duty(512)   # 50% brightness (0-1023)
```

## Safety Notes

⚠️ **Do NOT**:
- Exceed 40mA per GPIO pin
- Use 5V directly to ESP32 GPIO (except where specified)
- Leave buzzer running continuously for > 1 minute (can overheat)
- Short circuit power rails

✅ **Always**:
- Use resistors with LEDs
- Keep GND references common
- Double-check polarity before powering
- Have USB power available during development

## Component Substitutions

| Original | Alternative | Notes |
|----------|--------------|-------|
| 220Ω resistor | 180-470Ω | Will adjust LED brightness |
| Green/Yellow/Red LEDs | Any color | Just update silkscreen labeling |
| Active Buzzer | Passive buzzer | Passive needs PWM signal for tone |
| 3.3V VCC | 5V VCC | Use 5V buzzer if available, LEDs still use 220Ω |

## Bill of Materials (BOM)

For easy ordering:

```
1x ESP32 Development Board (AmazonBasics / Amazon)
1x 400-Hole Breadboard (generic, ~$3)
3x 3mm LED (Green, Yellow, Red - mixed pack)
3x 220Ω Resistor 1/4W (resistor assortment pack)
1x Active Buzzer 5V (generic electronics supplier)
1x Jumper Wire Kit (65 pieces, both colors)
1x USB Micro-B Cable (if not included with ESP32)
```

**Total estimated cost**: $20-30 USD

---

**Next Steps**:
1. Gather components
2. Follow wiring steps above
3. Test with `test_serial.py`
4. Integrate into main driver safety system (`main.py`)
5. Demo with live video feed!
