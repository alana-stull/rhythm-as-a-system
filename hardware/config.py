# ─────────────────────────────────────────────
# config.py
# Swap MOCK = False when running on the Pi
# ─────────────────────────────────────────────

import os

# Set to False on the Pi, True for local dev
MOCK = os.getenv("RHYTHM_MOCK", "true").lower() == "true"

# ── Backend ──────────────────────────────────
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

# ── NeoPixel ─────────────────────────────────
LED_PIN        = 18       # GPIO pin (Pi only)
LED_COUNT      = 24       # number of LEDs on ring
LED_BRIGHTNESS = 0.4      # 0.0 – 1.0

# Warm amber color — matches website palette
LED_COLOR = (255, 178, 80)  # RGB warm amber

# ── DFPlayer ─────────────────────────────────
DFPLAYER_PORT  = "/dev/serial0"   # Pi UART
DFPLAYER_BAUD  = 9600

# ── Audio files on SD card ───────────────────
# Pre-generate these with ElevenLabs and load onto SD card
# DFPlayer plays files by number (001.mp3, 002.mp3, etc.)
AUDIO_TRACKS = {
    "aligned":    1,
    "balanced":   2,
    "strained":   3,
    "overloaded": 4,
}

# ── Pulse timing (seconds) ───────────────────
PULSE_SPEED = {
    "aligned":    3.0,   # slow, gentle breathing
    "balanced":   2.0,   # medium steady
    "strained":   4.5,   # very slow, dim
    "overloaded": 6.0,   # barely breathing
}

# Poll backend every N seconds for new state
POLL_INTERVAL = 30