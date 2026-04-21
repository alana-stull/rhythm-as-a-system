import os
import requests

# ─────────────────────────────────────────────
# generate_audio.py
# Run once to generate all 4 state audio files
# using ElevenLabs TTS.
#
# Usage:
#   ELEVENLABS_API_KEY=your_key python generate_audio.py
#
# Output: hardware/audio/aligned.mp3, balanced.mp3, etc.
# ─────────────────────────────────────────────

API_KEY = "sk_41255000442848352ed00736b6517390b91447cfde26850a"
print(f"API_KEY loaded: {API_KEY}")
VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # "Rachel" — free default voice
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "audio")

SCRIPTS = {
    "aligned": "You're well-recovered with a light load today. This is a good window for the things that actually matter to you — use it.",
    "balanced": "Today is a balanced day. Steady recovery, moderate load. Pick one thing that isn't on a deadline and make space for it.",
    "strained": "Your body is asking for less today. Protect your energy where you can — what's on your calendar can wait more than you think.",
    "overloaded": "High demand, low capacity. You don't have to push through everything today. Rest where you can. Tomorrow will be different.",
}

os.makedirs(OUTPUT_DIR, exist_ok=True)

for state, text in SCRIPTS.items():
    print(f"Generating {state}...")
    resp = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}",
        headers={
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
        json={
            "text": text,
            "model_id": "eleven_turbo_v2",
            "voice_settings": {
                "stability": 0.6,
                "similarity_boost": 0.8,
            },
        },
    )
    resp.raise_for_status()
    path = os.path.join(OUTPUT_DIR, f"{state}.mp3")
    with open(path, "wb") as f:
        f.write(resp.content)
    print(f"  ✓ Saved → {path}")

print("\nDone. Copy the audio/ folder to your Pi.")