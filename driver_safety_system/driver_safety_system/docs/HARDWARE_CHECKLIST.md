# ESP32 Integration - Deployment & Debugging Checklist

## Pre-Deployment Checklist

### Hardware Setup
- [ ] ESP32 connected to computer via USB
- [ ] No USB power conflicts (check Device Manager/system info)
- [ ] ESP32 running MicroPython with listener code
- [ ] Buzzer connected to GPIO5
- [ ] LED connected to GPIO4 (or configured GPIO in MicroPython)

### Software Setup
- [ ] `pip install pyserial` completed
- [ ] `config.py` has correct serial port set
- [ ] `config.py` has `enable_hardware = True`
- [ ] `requirements.txt` includes `pyserial`

### Testing
- [ ] `python test_serial.py --port COM3 --critical` works
- [ ] `python test_serial.py --port COM3 --normal` works
- [ ] `python test_serial.py --port COM3 --warning` works
- [ ] Buzzer responds to test commands
- [ ] LED responds to test commands

### Integration
- [ ] `python main.py` starts without errors
- [ ] Video feed displays correctly
- [ ] Console shows "ESP32 connected on COMX"
- [ ] State changes trigger serial commands

## Quick Diagnostic Commands

```bash
# 1. List available serial ports
python -m serial.tools.list_ports

# 2. Test connection without full pipeline
python test_serial.py --port COM3 --test-cycle

# 3. Monitor ESP32 serial output (Linux/Mac)
picocom /dev/ttyUSB0 -b 115200

# 4. Monitor ESP32 serial output (Windows PowerShell)
mode COM3 BAUD=115200
# Then run test_serial.py

# 5. Check if pyserial is installed
python -c "import serial; print(serial.__version__)"
```

## Testing Scenarios

### Scenario 1: Hardware Not Responding

**Symptoms**: Console shows state commands (CRITICAL/WARNING/NORMAL) but buzzer/LED don't respond

**Debug Steps**:
```bash
1. python test_serial.py --port COM3 --critical
   → Does buzzer/LED turn on?
   
2. If NO:
   - Check ESP32 USB is powered (LED on ESP32 lit?)
   - Check MicroPython code is running
   - Verify GPIO pin numbers match
   - Try different baud rate: --baudrate 9600

3. If YES, then:
   - main.py issue (check logs)
   - config.py port mismatch
```

### Scenario 2: "Failed to Connect" Error

**Symptoms**: `Failed to connect to ESP32 on COMX`

**Debug Steps**:
```bash
1. Check port exists:
   python -m serial.tools.list_ports
   
2. Verify port in config.py matches output
   
3. Try different port in test_serial.py:
   python test_serial.py --port COM4 --critical
   
4. Restart ESP32:
   - Unplug USB
   - Wait 2 seconds
   - Plug back in
   - Try again
```

### Scenario 3: Serial Write Timeout

**Symptoms**: Logs show "Serial write error" repeatedly

**Debug Steps**:
```bash
1. Slow down baud rate in config.py:
   serial_baudrate: int = 9600  # instead of 115200
   
2. Check for USB cable issues:
   - Try different USB port
   - Try different USB cable
   
3. Check ESP32 firmware:
   - Reflash MicroPython
   - Verify bootloader is working
```

### Scenario 4: State Changes Not Triggering Alerts

**Symptoms**: Console shows state changes but no "Sent <STATE>" messages

**Debug Steps**:
```bash
1. Check enable_hardware in config.py:
   enable_hardware: bool = True  # must be True
   
2. Check connection status:
   - "ESP32 connected on COMX" should appear at startup
   
3. Verify state is actually changing:
   - Watch for "[STATE]" in console
   - Check that state differs from previous
   
4. Enable debug logging:
   - In hardware_interface.py, change:
   - logger.debug() → logger.info()
```

## Performance Verification

### Latency Check
```bash
# Manual check:
# Run main.py
# Look at timestamps in console
# From state change to "Sent CRITICAL" should be < 100ms
```

### CPU/Memory Usage
```bash
# While main.py running:

# Windows:
tasklist | findstr python

# Linux/Mac:
ps aux | grep main.py
```

Should use < 30% CPU, < 100MB RAM

## Log Analysis Examples

### Good Logs (Expected)
```
2026-04-16 10:30:45 - __main__ - INFO - ESP32 connected on COM3 @ 115200 baud
2026-04-16 10:30:50 - __main__ - INFO - Sent CRITICAL
2026-04-16 10:31:00 - __main__ - INFO - Sent NORMAL
2026-04-16 10:31:30 - __main__ - INFO - ESP32 disconnected
```

### Bad Logs (Troubleshoot)
```
# Error 1: Connection failed
Failed to connect to ESP32 on COM3: [Errno 2]
→ Check port number, USB cable

# Error 2: Port already in use
PermissionError [Errno 13]
→ Close other serial terminals/tools

# Error 3: Partial write
WARNING - Partial write: 0/1 bytes
→ USB issue, try slower baud rate
```

## Fallback Testing

If ESP32 is unavailable:

```python
# In config.py:
enable_hardware: bool = False

# Then run full pipeline:
python main.py

# Should work normally, no serial errors
```

## Production Readiness Checklist

- [ ] `config.py` has correct port and baud rate
- [ ] `enable_hardware` is `True` (or `False` if hardware unavailable)
- [ ] `pyserial` is installed
- [ ] `test_serial.py` confirms hardware responds
- [ ] `main.py` shows successful connection on startup
- [ ] State changes trigger alerts
- [ ] System handles ESP32 disconnect gracefully
- [ ] No crashes on repeated state changes
- [ ] Clean exit on ESC/Q key
- [ ] Logs are clear and helpful

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgot `pip install pyserial` | Run that command first |
| Wrong COM port in config | Check Device Manager/lsusb |
| ESP32 code not loaded | Flash MicroPython + listener code |
| `enable_hardware = False` | Change to `True` in config.py |
| Running without USB cable | Connect ESP32 before starting |
| Serial monitor already open | Close other terminals to that port |
| GPIO pins wrong in ESP32 code | Adjust GPIO numbers in MicroPython |

## Emergency Recovery

If system is stuck:

```bash
# Kill all Python processes:
# Windows:
taskkill /IM python.exe /F

# Linux/Mac:
pkill -9 python3

# Unplug ESP32 USB, wait 5 seconds, plug back in
# Then restart main.py
```

## Getting Help

See docstrings in:
- `modules/hardware_interface.py` - Class/method documentation
- `HARDWARE_INTEGRATION.md` - Full reference guide
- `test_serial.py` - Example usage patterns

Run with verbose logging:
```python
# In main.py at top:
import logging
logging.basicConfig(level=logging.DEBUG)  # Shows everything
```
