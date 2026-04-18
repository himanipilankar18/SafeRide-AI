"""
ESP32 MicroPython Firmware for Driver Safety System

Hardware connections:
  GPIO 4  → Green LED (NORMAL)
  GPIO 5  → Yellow LED (WARNING)
  GPIO 18 → Red LED (CRITICAL)
  GPIO 15 → Buzzer

Serial protocol:
  'N' → NORMAL: Green LED ON, others OFF, buzzer OFF
  'W' → WARNING: Yellow LED blinking, buzzer beeping
  'C' → CRITICAL: Red LED ON, buzzer continuous, others OFF

Non-blocking design: Uses timers and counters for blinking/beeping
"""

import machine
import time
import sys

# GPIO Definitions
GREEN_LED = machine.Pin(4, machine.Pin.OUT)
YELLOW_LED = machine.Pin(5, machine.Pin.OUT)
RED_LED = machine.Pin(18, machine.Pin.OUT)
BUZZER = machine.Pin(15, machine.Pin.OUT)

# State tracking
current_state = 'N'  # Start with NORMAL
last_state_time = time.time()

# Timing for blinking/beeping (in milliseconds)
BLINK_INTERVAL = 500  # 500ms on/off for WARNING LED
BEEP_INTERVAL = 200   # 200ms on/off for WARNING buzzer
CRITICAL_BUZZER_ON = 1000  # Continuous on for CRITICAL

# Counters for non-blocking timing
blink_counter = 0
beep_counter = 0
critical_buzzer_toggle = True

# Serial setup
uart = machine.UART(0, 115200)
uart.init(115200, bits=8, parity=None, stop=1)


def all_leds_off():
    """Turn off all LEDs."""
    GREEN_LED.off()
    YELLOW_LED.off()
    RED_LED.off()


def all_off():
    """Turn off everything."""
    all_leds_off()
    BUZZER.off()


def set_normal():
    """NORMAL state: Green LED ON, everything else OFF."""
    global current_state
    current_state = 'N'
    all_off()
    GREEN_LED.on()
    print("STATE: NORMAL")


def set_warning():
    """WARNING state: Yellow LED blinking, buzzer beeping."""
    global current_state, blink_counter, beep_counter
    current_state = 'W'
    all_off()
    blink_counter = 0
    beep_counter = 0
    print("STATE: WARNING")


def set_critical():
    """CRITICAL state: Red LED ON, buzzer continuous."""
    global current_state, critical_buzzer_toggle
    current_state = 'C'
    all_off()
    RED_LED.on()
    BUZZER.on()
    critical_buzzer_toggle = True
    print("STATE: CRITICAL")


def handle_warning():
    """Non-blocking WARNING state handler: Blink LED, beep buzzer."""
    global blink_counter, beep_counter
    
    # Blink yellow LED
    blink_counter += 1
    if blink_counter < (BLINK_INTERVAL // 10):
        YELLOW_LED.on()
    else:
        YELLOW_LED.off()
    
    if blink_counter >= (BLINK_INTERVAL * 2 // 10):
        blink_counter = 0
    
    # Beep buzzer
    beep_counter += 1
    if beep_counter < (BEEP_INTERVAL // 10):
        BUZZER.on()
    else:
        BUZZER.off()
    
    if beep_counter >= (BEEP_INTERVAL * 2 // 10):
        beep_counter = 0


def read_serial_non_blocking():
    """Read single character from serial if available."""
    if uart.any():
        try:
            char = uart.read(1)
            if char:
                return char.decode('utf-8').strip()
        except Exception as e:
            print(f"Serial error: {e}")
    return None


def main():
    """Main loop."""
    global current_state
    
    print("=== Driver Safety System - ESP32 Firmware ===")
    print(f"GPIO 4 (Green) | GPIO 5 (Yellow) | GPIO 18 (Red) | GPIO 15 (Buzzer)")
    print("Waiting for commands: N (normal), W (warning), C (critical)")
    print()
    
    # Initialize to NORMAL
    set_normal()
    
    loop_counter = 0
    
    while True:
        # Read serial input (non-blocking)
        cmd = read_serial_non_blocking()
        if cmd:
            if cmd == 'N':
                set_normal()
            elif cmd == 'W':
                set_warning()
            elif cmd == 'C':
                set_critical()
            else:
                print(f"Unknown command: {cmd}")
        
        # Handle state-specific behavior
        if current_state == 'W':
            handle_warning()
        
        # Small delay to avoid tight loop (10ms = comfortable 100Hz update rate)
        time.sleep(0.01)
        
        # Print status every 100 loops (~1 second)
        loop_counter += 1
        if loop_counter >= 100:
            loop_counter = 0
            # Optional: print current state periodically
            # print(f"Still running. State: {current_state}")


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("Shutting down...")
        all_off()
    except Exception as e:
        print(f"Error: {e}")
        all_off()
