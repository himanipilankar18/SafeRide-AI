import argparse
import time

import requests
import serial


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Listen for ESP32 emergency trigger and notify SafeRide backend."
    )
    parser.add_argument("--port", type=str, default="COM3", help="Serial port for ESP32")
    parser.add_argument("--baudrate", type=int, default=115200, help="Serial baud rate")
    parser.add_argument(
        "--api-url",
        type=str,
        default="http://localhost:5001/api/emergency/trigger",
        help="Backend emergency trigger API URL",
    )
    parser.add_argument("--driver-id", type=int, default=1, help="Driver ID to trigger")
    parser.add_argument(
        "--debounce-seconds",
        type=float,
        default=2.0,
        help="Ignore repeated triggers within this many seconds",
    )
    parser.add_argument(
        "--request-timeout",
        type=float,
        default=6.0,
        help="HTTP request timeout in seconds",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=2,
        help="Retries for failed API call",
    )
    return parser.parse_args()


def call_emergency_api(api_url: str, driver_id: int, timeout: float, retries: int) -> bool:
    payload = {"driverId": driver_id}

    for attempt in range(1, retries + 2):
        try:
            response = requests.post(api_url, json=payload, timeout=timeout)
            if response.ok:
                print(
                    f"[API] Trigger success (status={response.status_code}) -> {response.text.strip()}"
                )
                return True

            print(
                f"[API] Trigger failed (attempt {attempt}, status={response.status_code}) -> {response.text.strip()}"
            )
        except requests.RequestException as error:
            print(f"[API] Request error (attempt {attempt}): {error}")

        if attempt < retries + 1:
            time.sleep(0.7)

    return False


def main() -> None:
    args = parse_args()
    print(
        f"[LISTENER] Starting on port={args.port}, baudrate={args.baudrate}, driverId={args.driver_id}"
    )
    print(f"[LISTENER] API target: {args.api_url}")

    try:
        with serial.Serial(args.port, args.baudrate, timeout=1) as ser:
            print("[LISTENER] Serial connection established")
            last_trigger_ts = 0.0

            while True:
                raw = ser.readline()
                if not raw:
                    continue

                line = raw.decode("utf-8", errors="ignore").strip()
                if not line:
                    continue

                print(f"[SERIAL] {line}")

                if line == "EMERGENCY_TRIGGERED":
                    now = time.time()
                    if (now - last_trigger_ts) < args.debounce_seconds:
                        print("[LISTENER] Debounced repeated emergency trigger")
                        continue

                    last_trigger_ts = now
                    print("[LISTENER] Emergency trigger detected. Calling backend API...")
                    ok = call_emergency_api(
                        api_url=args.api_url,
                        driver_id=args.driver_id,
                        timeout=args.request_timeout,
                        retries=args.retries,
                    )

                    if not ok:
                        print("[LISTENER] Emergency API call failed after retries")
    except serial.SerialException as error:
        print(f"[LISTENER] Serial error: {error}")
    except KeyboardInterrupt:
        print("[LISTENER] Stopped by user")


if __name__ == "__main__":
    main()
