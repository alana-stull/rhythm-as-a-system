import time
import signal
import sys
import math
from config import MOCK, POLL_INTERVAL, LED_COLOR, PULSE_SPEED
from audio import AudioController
from states import get_current_state

if not MOCK:
    from adafruit_crickit import crickit
    crickit.init_neopixel(24)

def pulse_fill(state, duration=30):
    """Pulse the light for `duration` seconds."""
    print("entering pulse_fill")
    period = PULSE_SPEED.get(state, 2.0)
    r, g, b = LED_COLOR
    end = time.time() + duration
    print(f"[lights] Starting pulse — state={state} period={period}")  # add this
    while time.time() < end:
        t = time.time()
        brightness = 0.1 + 0.9 * (0.5 + 0.5 * math.sin(2 * math.pi * t / period))
        scaled = (int(r * brightness), int(g * brightness), int(b * brightness))
        if not MOCK:
            crickit.neopixel.fill(scaled)
        time.sleep(0.05)

def main():
    print(f"[rhythm] Starting — mock={MOCK}")
    audio = AudioController()
    last_state = None

    def shutdown(sig, frame):
        print("\n[rhythm] Shutting down...")
        if not MOCK:
            crickit.neopixel.fill((0, 0, 0))
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    while True:
        print("1 - getting state")
        data = get_current_state()
        print("2 - got state")
        state = data.get("state", "balanced")
        print(f"3 - state is {state}")
        rec = data.get("recovery", 0)
        exp = data.get("exposure", 0)
        rec_str = rec if rec else "None"
        exp_str = exp if exp else "None"

        print(f"\n[rhythm] State: {state}")
        print(f"[rhythm] Recovery: {rec_str}  Exposure: {exp_str}")
        print(f"[rhythm] Recommendation: {data.get('recommendation', '')}")

        print("4 - about to pulse")
        pulse_fill(state, duration=POLL_INTERVAL)
        print("5 - after pulse")

if __name__ == "__main__":
    main()