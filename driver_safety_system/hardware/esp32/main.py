import sys
import time
import machine
import uselect

# -------------------------
# Hardware Configuration
# -------------------------
GREEN_LED = machine.Pin(4, machine.Pin.OUT)
YELLOW_LED = machine.Pin(5, machine.Pin.OUT)
RED_LED = machine.Pin(18, machine.Pin.OUT)
BUZZER = machine.Pin(15, machine.Pin.OUT)
BUTTON_PIN = machine.Pin(19, machine.Pin.IN, machine.Pin.PULL_UP)

# -------------------------
# TEST MODE (very low sound)
# -------------------------
TEST_MODE = True

# -------------------------
# Timing Configuration
# -------------------------
BLINK_INTERVAL_MS = 500
FAILSAFE_TIMEOUT_MS = 3000
LOOP_DELAY_MS = 20
BUTTON_DEBOUNCE_MS = 300

if TEST_MODE:
    # VERY QUIET MODE (testing)
    WARNING_BUZZ_ON_MS = 10
    WARNING_BUZZ_OFF_MS = 3000

    CRITICAL_BUZZ_ON_MS = 20
    CRITICAL_BUZZ_OFF_MS = 1500
else:
    # NORMAL DEMO MODE
    WARNING_BUZZ_ON_MS = 100
    WARNING_BUZZ_OFF_MS = 1000

    CRITICAL_BUZZ_ON_MS = 120
    CRITICAL_BUZZ_OFF_MS = 120

# -------------------------
# Runtime State
# -------------------------
current_state = None
failsafe_active = False
last_valid_cmd_ms = time.ticks_ms()

last_blink_toggle_ms = time.ticks_ms()
yellow_on = False

last_buzzer_toggle_ms = time.ticks_ms()
buzzer_on = False
failsafe_armed = False

# Button runtime state (pull-up: released=1, pressed=0)
last_button_state = BUTTON_PIN.value()
last_button_press_ms = time.ticks_ms()

# -------------------------
# Non-blocking serial
# -------------------------
poller = uselect.poll()
poller.register(sys.stdin, uselect.POLLIN)

# -------------------------
# Helpers
# -------------------------
def all_off():
    global yellow_on, buzzer_on
    GREEN_LED.off()
    YELLOW_LED.off()
    RED_LED.off()
    BUZZER.off()
    yellow_on = False
    buzzer_on = False

def set_state(state):
    global current_state, yellow_on, buzzer_on
    global last_blink_toggle_ms, last_buzzer_toggle_ms

    now = time.ticks_ms()
    current_state = state

    if state == "O":
        all_off()
        print("STATE: OFF")

    elif state == "N":
        GREEN_LED.on()
        YELLOW_LED.off()
        RED_LED.off()
        BUZZER.off()
        yellow_on = False
        buzzer_on = False
        print("STATE: NORMAL")

    elif state == "W":
        GREEN_LED.off()
        RED_LED.off()
        YELLOW_LED.on()
        yellow_on = True
        last_blink_toggle_ms = now

        BUZZER.off()
        buzzer_on = False
        last_buzzer_toggle_ms = now
        print("STATE: WARNING")

    elif state == "C":
        GREEN_LED.off()
        YELLOW_LED.off()
        RED_LED.on()

        BUZZER.on()
        buzzer_on = True
        last_buzzer_toggle_ms = now
        print("STATE: CRITICAL")

def update_blink(now_ms):
    global yellow_on, last_blink_toggle_ms

    if current_state != "W":
        return

    if time.ticks_diff(now_ms, last_blink_toggle_ms) >= BLINK_INTERVAL_MS:
        yellow_on = not yellow_on
        YELLOW_LED.value(yellow_on)
        last_blink_toggle_ms = now_ms

def update_buzzer(now_ms):
    global buzzer_on, last_buzzer_toggle_ms

    effective_state = "C" if failsafe_active else current_state

    if effective_state in (None, "N"):
        if buzzer_on:
            BUZZER.off()
            buzzer_on = False
        return

    if effective_state == "W":
        interval = WARNING_BUZZ_ON_MS if buzzer_on else WARNING_BUZZ_OFF_MS
    else:  # CRITICAL
        interval = CRITICAL_BUZZ_ON_MS if buzzer_on else CRITICAL_BUZZ_OFF_MS

    if time.ticks_diff(now_ms, last_buzzer_toggle_ms) >= interval:
        buzzer_on = not buzzer_on
        BUZZER.value(buzzer_on)
        last_buzzer_toggle_ms = now_ms

def check_timeout(now_ms):
    global failsafe_active

    if not failsafe_armed:
        return

    if failsafe_active:
        return

    if current_state == "O":
        return

    if time.ticks_diff(now_ms, last_valid_cmd_ms) >= FAILSAFE_TIMEOUT_MS:
        failsafe_active = True
        set_state("C")
        print("FAILSAFE: NO SIGNAL")

def check_button(now_ms):
    global last_button_state, last_button_press_ms

    current_button_state = BUTTON_PIN.value()

    # Detect a valid press on HIGH -> LOW transition with debounce.
    if last_button_state == 1 and current_button_state == 0:
        if time.ticks_diff(now_ms, last_button_press_ms) >= BUTTON_DEBOUNCE_MS:
            last_button_press_ms = now_ms
            print("EMERGENCY_TRIGGERED")

    last_button_state = current_button_state

# -------------------------
# Startup
# -------------------------
all_off()
print("ESP32 ready (quiet test mode)")
print("Waiting for commands: O / N / W / C")

# -------------------------
# Main Loop
# -------------------------
while True:
    now_ms = time.ticks_ms()

    try:
        events = poller.poll(0)

        if events:
            ch = sys.stdin.read(1)

            if ch is not None:
                cmd = ch.strip().upper()

                if cmd in ("O", "N", "W", "C"):
                    last_valid_cmd_ms = now_ms

                    if cmd == "O":
                        failsafe_armed = False
                    else:
                        failsafe_armed = True

                    if failsafe_active:
                        failsafe_active = False
                        print("FAILSAFE CLEARED")

                    if cmd != current_state:
                        print("RECEIVED:", cmd)
                        set_state(cmd)

    except Exception:
        pass

    update_blink(now_ms)
    update_buzzer(now_ms)
    check_timeout(now_ms)
    check_button(now_ms)

    time.sleep_ms(LOOP_DELAY_MS)
