import requests
from config import BACKEND_URL

def get_current_state() -> dict:
    try:
        resp = requests.get(f"{BACKEND_URL}/lamp", timeout=5)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        print(f"[states] Backend unreachable: {e}")
        return {
            "state": "balanced",
            "recommendation": "Could not reach Rhythm backend.",
            "recovery": 0,
            "exposure": 0
        }