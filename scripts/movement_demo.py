#!/usr/bin/env python3
"""
AS120 Autosampler — Movement Demo Script

Sends 15 movement commands over the 4-byte UART protocol.
Auto-detects the serial port and connects at 19200 baud.

Protocol: 4-byte commands, format varies by type:
  - Absolute move: {motor_alt}{pos_hi}{pos_lo}{CR}
  - Increment:     {motor}+{steps}{CR}
  - Decrement:     {motor}-{steps}{CR}
  - Home:          {motor}zz{CR}
  - Query pos:     {motor}??{CR}

Motor indices:
  0 = Forward/Back, 1 = Up/Down, 2 = Plunger, 3 = Right/Left
  Absolute move alt indices: 5=motor0, 6=motor1, 7=motor2, 8=motor3

Requires: pip install pyserial
"""

import struct
import sys
import time

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    print("pyserial is required. Install it with:")
    print("  pip install pyserial")
    sys.exit(1)

BAUD_RATE = 19200
TIMEOUT = 5  # seconds to wait for "ok" response

MOTOR_NAMES = {0: "Forward/Back", 1: "Up/Down", 2: "Plunger", 3: "Right/Left"}


def find_serial_port():
    """Auto-detect the AS120 serial port."""
    ports = serial.tools.list_ports.comports()
    candidates = []

    for p in ports:
        desc = (p.description or "").lower()
        hwid = (p.hwid or "").lower()
        # Prefer USB serial / CP210x / FTDI / ESP32-S3 USB-JTAG
        if any(kw in desc or kw in hwid for kw in [
            "cp210", "ftdi", "ch340", "usb", "uart", "jtag", "usbmodem",
            "usbserial", "serial",
        ]):
            candidates.append(p)

    if not candidates:
        candidates = ports  # fall back to all ports

    if not candidates:
        print("No serial ports found.")
        sys.exit(1)

    if len(candidates) == 1:
        chosen = candidates[0]
        print(f"Auto-detected port: {chosen.device}  ({chosen.description})")
        return chosen.device

    # Multiple candidates — let the user choose
    print("Multiple serial ports detected:")
    for i, p in enumerate(candidates):
        print(f"  [{i}] {p.device}  —  {p.description}")
    while True:
        try:
            idx = int(input("Select port number: "))
            if 0 <= idx < len(candidates):
                return candidates[idx].device
        except (ValueError, EOFError):
            pass
        print(f"Enter a number 0–{len(candidates) - 1}")


def read_response(ser, expect_bytes=None):
    """Read until 'ok' is seen or timeout."""
    buf = b""
    deadline = time.time() + TIMEOUT
    while time.time() < deadline:
        chunk = ser.read(ser.in_waiting or 1)
        if chunk:
            buf += chunk
            if b"ok" in buf:
                return buf
            if expect_bytes and len(buf) >= expect_bytes:
                return buf
    return buf


def query_position(ser, motor):
    """Query a motor's current position. Returns int or None."""
    cmd = f"{motor}??\r".encode("ascii")
    ser.write(cmd)
    resp = read_response(ser, expect_bytes=6)
    if len(resp) >= 2:
        pos = struct.unpack(">H", resp[:2])[0]
        return pos
    return None


def send_absolute_move(ser, motor, position):
    """Send an absolute move command (16-bit position)."""
    alt_idx = motor + 5  # alt indices: 5,6,7,8
    pos_hi = (position >> 8) & 0xFF
    pos_lo = position & 0xFF
    cmd = bytes([ord(str(alt_idx)), pos_hi, pos_lo, 0x0D])
    motor_name = MOTOR_NAMES.get(motor, f"Motor {motor}")
    print(f"  ABS  {motor_name} -> {position}  (0x{position:04X})")
    ser.write(cmd)
    resp = read_response(ser)
    if b"ok" not in resp:
        print(f"    WARNING: unexpected response: {resp!r}")


def send_increment(ser, motor, steps):
    """Send a relative forward move."""
    cmd = bytes([ord(str(motor)), ord("+"), steps & 0xFF, 0x0D])
    motor_name = MOTOR_NAMES.get(motor, f"Motor {motor}")
    print(f"  INC  {motor_name} +{steps}")
    ser.write(cmd)
    resp = read_response(ser)
    if b"ok" not in resp:
        print(f"    WARNING: unexpected response: {resp!r}")


def send_decrement(ser, motor, steps):
    """Send a relative backward move."""
    cmd = bytes([ord(str(motor)), ord("-"), steps & 0xFF, 0x0D])
    motor_name = MOTOR_NAMES.get(motor, f"Motor {motor}")
    print(f"  DEC  {motor_name} -{steps}")
    ser.write(cmd)
    resp = read_response(ser)
    if b"ok" not in resp:
        print(f"    WARNING: unexpected response: {resp!r}")


def send_home(ser, motor):
    """Home a motor (move to position 0)."""
    cmd = f"{motor}zz\r".encode("ascii")
    motor_name = MOTOR_NAMES.get(motor, f"Motor {motor}")
    print(f"  HOME {motor_name}")
    ser.write(cmd)
    resp = read_response(ser)
    if b"ok" not in resp:
        print(f"    WARNING: unexpected response: {resp!r}")


def main():
    port = find_serial_port()

    print(f"\nConnecting to {port} at {BAUD_RATE} baud...")
    ser = serial.Serial(port, BAUD_RATE, timeout=1)
    time.sleep(0.5)  # let the device settle after connection
    ser.reset_input_buffer()

    # Verify connectivity by querying motor 0 position
    print("\nVerifying connection...")
    pos = query_position(ser, 0)
    if pos is not None:
        print(f"  Motor 0 (Forward/Back) position: {pos}")
    else:
        print("  WARNING: No response from device. Continuing anyway...")

    # ── Movement sequence (15 commands) ───────────────────────────
    print("\n── Sending movement sequence ──\n")

    # 1–3: Home all three axes (skip plunger for safety)
    print("Phase 1: Home axes")
    send_home(ser, 0)   # Forward/Back
    send_home(ser, 1)   # Up/Down
    send_home(ser, 3)   # Right/Left

    # 4–6: Move each axis to a moderate position
    print("\nPhase 2: Move to starting positions")
    send_absolute_move(ser, 0, 1000)   # Forward/Back -> 1000
    send_absolute_move(ser, 1, 500)    # Up/Down -> 500
    send_absolute_move(ser, 3, 800)    # Right/Left -> 800

    # 7–9: Incremental moves
    print("\nPhase 3: Incremental moves")
    send_increment(ser, 0, 200)   # Forward/Back +200
    send_increment(ser, 3, 150)   # Right/Left +150
    send_increment(ser, 1, 100)   # Up/Down +100

    # 10–12: Move to new absolute positions (simulating vial access)
    print("\nPhase 4: Simulated vial positions")
    send_absolute_move(ser, 0, 3000)   # Forward/Back -> 3000
    send_absolute_move(ser, 3, 2000)   # Right/Left -> 2000
    send_absolute_move(ser, 1, 1500)   # Up/Down -> 1500

    # 13–15: Decrement back partially, then home
    print("\nPhase 5: Return sequence")
    send_decrement(ser, 0, 250)   # Forward/Back -250
    send_decrement(ser, 3, 200)   # Right/Left -200
    send_home(ser, 1)             # Home Up/Down

    # ── Done ──────────────────────────────────────────────────────
    print("\n── Sequence complete ──\n")

    # Query final positions
    print("Final positions:")
    for m in [0, 1, 3]:
        pos = query_position(ser, m)
        name = MOTOR_NAMES[m]
        if pos is not None:
            print(f"  {name}: {pos}")
        else:
            print(f"  {name}: (no response)")

    ser.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
