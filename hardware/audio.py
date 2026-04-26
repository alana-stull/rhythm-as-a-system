import subprocess
from config import MOCK, AUDIO_TRACKS

class AudioController:
    def play_state(self, state: str):
        track = AUDIO_TRACKS.get(state)
        if not track:
            print(f"[audio] No track for state: {state}")
            return
        if MOCK:
            print(f"[audio] Playing track {track} → {state}")
        else:
            # Play MP3 directly on Pi
            subprocess.Popen(
                ["mpg123", "-a", "plughw:2,0", f"audio/{state}.mp3"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
