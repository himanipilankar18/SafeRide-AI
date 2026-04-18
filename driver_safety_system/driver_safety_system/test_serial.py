"""
Test script for ESP32 serial communication.

Use this to manually test sending state commands to the ESP32
without running the full driver safety pipeline.

Hardware connections:
  GPIO 4  → Green LED (NORMAL)
  GPIO 5  → Yellow LED (WARNING)
  GPIO 18 → Red LED (CRITICAL)
  GPIO 15 → Buzzer

Example:
    python test_serial.py --port COM3 --normal
    python test_serial.py --port COM3 --warning
    python test_serial.py --port COM3 --critical
    python test_serial.py --port COM3 --test-cycle
"""

import argparse
import logging
import time

from modules.hardware_interface import HardwareInterface


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(
        description='Test ESP32 serial communication for driver safety system'
    )
    parser.add_argument(
        '--port',
        type=str,
        default='COM3',
        help='Serial port (default: COM3)'
    )
    parser.add_argument(
        '--baudrate',
        type=int,
        default=115200,
        help='Baud rate (default: 115200)'
    )
    parser.add_argument(
        '--normal',
        action='store_true',
        help='Send NORMAL command (green LED on)'
    )
    parser.add_argument(
        '--warning',
        action='store_true',
        help='Send WARNING command (yellow LED blinking, buzzer beeping)'
    )
    parser.add_argument(
        '--critical',
        action='store_true',
        help='Send CRITICAL command (red LED on, buzzer continuous)'
    )
    parser.add_argument(
        '--test-cycle',
        action='store_true',
        help='Cycle through all states: NORMAL → WARNING → CRITICAL → NORMAL'
    )
    args = parser.parse_args()

    hardware = HardwareInterface(port=args.port, baudrate=args.baudrate)

    logger.info(f"Attempting to connect to {args.port}...")
    if not hardware.connect():
        logger.error(f"Failed to connect. Check that ESP32 is on {args.port}")
        return

    logger.info("Connection successful!")

    try:
        if args.normal:
            logger.info("Sending NORMAL command...")
            logger.info("  → Green LED should turn ON")
            hardware.send_alert("NORMAL")
            time.sleep(1)

        elif args.warning:
            logger.info("Sending WARNING command...")
            logger.info("  → Yellow LED should BLINK")
            logger.info("  → Buzzer should BEEP (periodic)")
            hardware.send_alert("WARNING")
            time.sleep(1)

        elif args.critical:
            logger.info("Sending CRITICAL command...")
            logger.info("  → Red LED should turn ON")
            logger.info("  → Buzzer should be CONTINUOUS")
            hardware.send_alert("CRITICAL")
            time.sleep(1)

        elif args.test_cycle:
            logger.info("Running test cycle (press Ctrl+C to stop)...")
            cycle = 1
            while True:
                logger.info(f"\n--- Cycle {cycle} ---")
                
                logger.info("1/3 - NORMAL (5 seconds)")
                hardware.send_alert("NORMAL")
                time.sleep(5)

                logger.info("2/3 - WARNING (5 seconds)")
                hardware.send_alert("WARNING")
                time.sleep(5)

                logger.info("3/3 - CRITICAL (5 seconds)")
                hardware.send_alert("CRITICAL")
                time.sleep(5)
                
                cycle += 1

        else:
            logger.info("No command specified.")
            logger.info("Use: --normal, --warning, --critical, or --test-cycle")

    except KeyboardInterrupt:
        logger.info("\nInterrupted by user")

    finally:
        logger.info("Sending NORMAL state before disconnect...")
        hardware.send_alert("NORMAL")
        time.sleep(0.5)
        hardware.disconnect()
        logger.info("Test complete")


if __name__ == '__main__':
    main()
