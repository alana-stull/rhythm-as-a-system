# ─────────────────────────────────────────────
# main.py
# Entry point for the Rhythm hardware system.
# Run locally:  python main.py
# Run on Pi:    RHYTHM_MOCK=false python main.py
# ─────────────────────────────────────────────

import time
import signal
import sys
from config import MOCK, POLL_INTERVAL
from lights import LightController
from audio  import AudioController
from states import get_current_state

def main():
    print(f"[rhythm] Starting — mock={MOCK}")

    lights = LightController()
    audio  = AudioController()

    lights.start()

    last_state = None

    def shutdown(sig, frame):
        print("\n[rhythm] Shutting down...")
        lights.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT,  shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    while True:
        data  = get_current_state()
        state = data.get("state", "balanced")
        rec   = data.get("recommendation", "")

        print(f"\n[rhythm] State: {state}")
        print(f"[rhythm] Recovery: {data.get('recovery')}  Exposure: {data.get('exposure')}")
        print(f"[rhythm] Recommendation: {rec}")

        # Only update light + play audio when state changes
        if state != last_state:
            lights.set_state(state)
            audio.play_state(state)
            last_state = state

        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()