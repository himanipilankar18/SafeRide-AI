from collections import deque
from dataclasses import dataclass
from typing import Optional


@dataclass
class DurationTimer:
    _start_time: Optional[float] = None

    @property
    def running(self) -> bool:
        return self._start_time is not None

    def start(self, timestamp: float) -> None:
        if self._start_time is None:
            self._start_time = timestamp

    def stop(self, timestamp: Optional[float] = None) -> float:
        elapsed = self.elapsed(timestamp)
        self._start_time = None
        return elapsed

    def elapsed(self, timestamp: Optional[float] = None) -> float:
        if self._start_time is None:
            return 0.0
        if timestamp is None:
            import time
            timestamp = time.time()
        return max(0.0, timestamp - self._start_time)


class RollingTimeWindow:
    def __init__(self, window_seconds: float = 60.0) -> None:
        self.window_seconds = window_seconds
        self._timestamps = deque()

    def add(self, timestamp: float) -> None:
        self._timestamps.append(timestamp)
        self._purge(timestamp)

    def _purge(self, timestamp: float) -> None:
        while self._timestamps and (timestamp - self._timestamps[0]) > self.window_seconds:
            self._timestamps.popleft()

    def count(self, timestamp: Optional[float] = None) -> int:
        if timestamp is None:
            import time
            timestamp = time.time()
        self._purge(timestamp)
        return len(self._timestamps)

    def rate_per_minute(self, timestamp: Optional[float] = None) -> float:
        return float(self.count(timestamp)) * (60.0 / self.window_seconds)