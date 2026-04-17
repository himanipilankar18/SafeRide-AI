"""
Hardware interface module for ESP32 serial communication.

Manages serial connection to ESP32 for triggering hardware alerts (LEDs + buzzer).
Sends commands only on state change to avoid serial spam.

Hardware connections:
  GPIO 4  → Green LED (NORMAL)
  GPIO 5  → Yellow LED (WARNING) with blinking
  GPIO 18 → Red LED (CRITICAL)
  GPIO 15 → Buzzer

Protocol:
  'N' -> NORMAL: Green LED ON, buzzer OFF, others OFF
  'W' -> WARNING: Yellow LED blinking, buzzer beeping
  'C' -> CRITICAL: Red LED ON, buzzer continuous
"""

import time
import logging
from typing import Optional

try:
    import serial
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False


logger = logging.getLogger(__name__)


class HardwareInterface:
    """Manages ESP32 serial communication for hardware alerts."""

    def __init__(self, port: str, baudrate: int = 115200, timeout: float = 1.0):
        """
        Initialize hardware interface.

        Args:
            port: Serial port name (e.g., "COM3", "/dev/ttyUSB0")
            baudrate: Baud rate for serial communication
            timeout: Serial read/write timeout in seconds
        """
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        self.serial_conn: Optional[serial.Serial] = None
        self._connected = False

    def connect(self) -> bool:
        """
        Establish serial connection to ESP32.

        Returns:
            True if connection successful, False otherwise.
        """
        if not SERIAL_AVAILABLE:
            logger.warning("pyserial not installed. Hardware alerts disabled.")
            return False

        if self._connected:
            return True

        try:
            self.serial_conn = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=self.timeout,
                write_timeout=self.timeout,
            )
            # Allow ESP32 bootloader to complete
            time.sleep(2)
            self._connected = True
            logger.info(f"ESP32 connected on {self.port} @ {self.baudrate} baud")
            return True
        except serial.SerialException as e:
            logger.error(f"Failed to connect to ESP32 on {self.port}: {e}")
            self._connected = False
            return False
        except Exception as e:
            logger.error(f"Unexpected error opening serial port: {e}")
            self._connected = False
            return False

    def disconnect(self) -> None:
        """Close serial connection."""
        if self.serial_conn and self.serial_conn.is_open:
            try:
                self.serial_conn.close()
                self._connected = False
                logger.info("ESP32 disconnected")
            except Exception as e:
                logger.error(f"Error closing serial connection: {e}")

    def _normalize_state(self, state: str) -> Optional[str]:
        """Map model/pipeline labels to hardware states."""
        if state is None:
            return None

        normalized = str(state).strip().upper()
        state_aliases = {
            'NORMAL': 'NORMAL',
            'ALERT': 'NORMAL',
            'AWAKE': 'NORMAL',
            'SAFE': 'NORMAL',
            'WARNING': 'WARNING',
            'DROWSY': 'WARNING',
            'FATIGUE': 'WARNING',
            'CRITICAL': 'CRITICAL',
            'MICROSLEEP': 'CRITICAL',
            'SLEEPY': 'CRITICAL',
            'ASLEEP': 'CRITICAL',
            'NO_FACE': 'WARNING',
        }
        return state_aliases.get(normalized)

    def send_alert(self, state: str) -> bool:
        """
        Send driver state command to ESP32.

        Sends single-character command matching driver state:
          'N' → NORMAL (green LED on)
          'W' → WARNING (yellow LED blinking, buzzer beeping)
          'C' → CRITICAL (red LED on, buzzer continuous)

        Args:
            state: Driver state string ("NORMAL", "WARNING", "CRITICAL")

        Returns:
            True if command sent successfully, False otherwise.
        """
        if not self._connected:
            logger.debug("ESP32 not connected, skipping alert")
            return False

        normalized_state = self._normalize_state(state)

        # Map normalized state to protocol command
        state_map = {
            "NORMAL": (b"N", "NORMAL"),
            "WARNING": (b"W", "WARNING"),
            "CRITICAL": (b"C", "CRITICAL"),
        }

        if normalized_state not in state_map:
            logger.warning(f"Unknown state: {state}")
            return False

        command, label = state_map[normalized_state]

        try:
            bytes_written = self.serial_conn.write(command)
            if bytes_written == len(command):
                logger.info(f"Sent {label}")
                return True
            else:
                logger.warning(f"Partial write: {bytes_written}/{len(command)} bytes")
                return False
        except serial.SerialException as e:
            logger.error(f"Serial write error: {e}")
            self._connected = False
            return False
        except Exception as e:
            logger.error(f"Unexpected error sending alert: {e}")
            return False

    def is_connected(self) -> bool:
        """Check if serial connection is active."""
        return self._connected
