# Rhythm

A wellness-centered, context-aware system that reads recovery, exposure, and friction signals and generates calm, actionable daily guidance. One FastAPI backend. Three front-ends: web dashboard, menu bar widget, mobile (planned).

---

## Setup

### Prerequisites
- Python 3.10+
- Node 18+

### 1. Backend

```bash
cd rhythm-as-a-system
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# Create your .env file
cp backend/.env.example backend/.env
# Add your OpenAI key: OPENAI_API_KEY=sk-...

# Start the API
cd backend  # optional — or run from root with PYTHONPATH=.
uvicorn backend.main:app --reload
# API runs at http://localhost:8000
# Docs at http://localhost:8000/docs
```

### 2. Dashboard

```bash
cd dashboard
npm install
npm run dev
# Opens at http://localhost:5173
```

### 3. Menu Bar Widget

```bash
cd menubar
npm install
npm run start
# Icon appears in your Mac menu bar
# Requires backend to be running
```

---

## Usage

1. **Upload wearable data** — go to the Upload tab in the dashboard and drop your Oura or Apple Health CSV
2. **Check in** — use the slider on the Today tab to log how hard the day feels (1-10)
3. **Generate a suggestion** — hit "Generate" on the suggestion card to get a GPT-4o-mini reflection
4. **Menu bar** — click the Rhythm icon any time to see your condition and latest suggestion

---

## API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Status check |
| POST | `/upload/oura` | Upload Oura CSV |
| POST | `/upload/apple-health` | Upload Apple Health CSV |
| POST | `/checkin` | Submit friction check-in |
| GET | `/scores/latest` | Latest recovery/exposure/friction scores |
| GET | `/scores/history?days=14` | Historical score timeline |
| POST | `/suggestions/generate` | Generate AI suggestion |
| GET | `/suggestions/latest` | Latest suggestion |

---

# Project Overview:
Rhythm is a wellness-centered, context-aware system that helps users align their workload, energy, and daily responsibilities. Instead of trying to classify people or infer mental states, Rhythm focuses on recovery, exposure, and friction signals to identify recurring work conditions. By integrating behavioral, physiological, and calendar data, it provides gentle, actionable guidance so users can make realistic decisions that support both productivity and well-being.

# System Functionality:
Rhythm is designed for users who already rely on multiple tools to manage their day. Rather than replacing these tools, it integrates their signals to translate effort and capacity into actionable guidance through three core functions:
1. Data Collection
-   Recovery signals → measure how prepared the body is for effort:
-     Wearable data: sleep, HRV, recovery, activity levels
-     Optional check-ins: perceived energy or restfulness
-   Exposure signals → measure task and environmental load:
-     Calendar: meetings, deadlines, scheduled tasks, buffer times
-     Behavioral: session length, tab switching, task switching frequency
-   Friction signals → measure effort or difficulty experienced during tasks:
-     Behavioral: task fragmentation, interruptions
-     Optional check-ins: perceived effort, task difficulty
2. Context Interpretation
-   Clusters work conditions, not people, based on recurring patterns
-   Calculates recovery, exposure, and friction scores
-   Detects misalignment between current capacity and task demands
-   Continuously adapts to improve future guidance
3. Personalized Guidance
- Provides capacity-respecting suggestions (focus sessions, work prioritization, or recovery activities)
- Offers subtle workload adjustments if demands exceed current capacity
- Generates reflective summaries through the menu bar or dashboard
- Preserves user agency by inviting confirmation rather than imposing labels
