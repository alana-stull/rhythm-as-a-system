# ─────────────────────────────────────────────
# lights.py
# Controls the NeoPixel ring.
# Falls back to mock (print) if not on Pi.
# ─────────────────────────────────────────────

import time
import threading
import math
from config import MOCK, LED_PIN, LED_COUNT, LED_BRIGHTNESS, LED_COLOR, PULSE_SPEED

if not MOCK:
    import board
    import neopixel

class LightController:
    def __init__(self):
        self._state    = "balanced"
        self._running  = False
        self._thread   = None
        self._stop_evt = threading.Event()

        if not MOCK:
            self._pixels = neopixel.NeoPixel(
                board.D18, LED_COUNT,
                brightness=LED_BRIGHTNESS,
                auto_write=False
            )

    def set_state(self, state: str):
        """Update the pulse state. Restarts the pulse loop."""
        if state not in PULSE_SPEED:
            print(f"[lights] Unknown state: {state}, defaulting to balanced")
            state = "balanced"
        self._state = state
        self._restart()

    def _restart(self):
        self._stop_evt.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1)
        self._stop_evt.clear()
        self._thread = threading.Thread(target=self._pulse_loop, daemon=True)
        self._thread.start()

    def _pulse_loop(self):
        """Sinusoidal brightness pulse. Speed = state urgency."""
        period = PULSE_SPEED[self._state]
        r, g, b = LED_COLOR
        step = 0.05

        while not self._stop_evt.is_set():
            t = time.time()
            # Sine wave: 0.2 → 1.0 brightness range (never fully off)
            brightness = 0.2 + 0.8 * (0.5 + 0.5 * math.sin(2 * math.pi * t / period))
            scaled = (int(r * brightness), int(g * brightness), int(b * brightness))

            if MOCK:
                # Show a simple bar in terminal
                bar = "█" * int(brightness * 20)
                print(f"\r[lights] {self._state:12} {bar:<20} {brightness:.2f}", end="", flush=True)
            else:
                self._pixels.fill(scaled)
                self._pixels.show()

            time.sleep(step)

    def off(self):
        self._stop_evt.set()
        if not MOCK:
            self._pixels.fill((0, 0, 0))
            self._pixels.show()
        else:
            print("\n[lights] Off")

    def start(self):
        self._restart()

    def stop(self):
        self.off()