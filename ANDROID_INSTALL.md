# KODO on Android (Termux)

Run KODO on Android using Termux. This guide focuses on the FastAPI backend plus Vite frontend workflow.

## Prerequisites

- Android device with ~1 GB free space
- Termux installed from F-Droid (recommended)
- Node.js 18+ and Python 3.11+ available in Termux
- At least one provider API key (OpenAI, Anthropic, Gemini, DeepSeek, Groq, or OpenRouter)

## Step 1: Install base dependencies

```bash
pkg update && pkg upgrade
pkg install git python nodejs-lts
```

## Step 2: Clone KODO and install dependencies

```bash
git clone https://github.com/your-org/kodo-agent-export.git
cd kodo-agent-export

cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

cd ../frontend
npm install
```

Edit backend/.env and set at least one provider key.

## Step 3: Start KODO backend

```bash
cd ~/kodo-agent-export/backend
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Step 4: Start KODO frontend

Open a second Termux session:

```bash
cd ~/kodo-agent-export/frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

## Step 5: Access from mobile browser

On the same phone, open:

- http://127.0.0.1:5173

From another device on the same network, open:

- http://<phone-ip>:5173

## Docker alternative (if available in your environment)

If your Android environment supports Docker-compatible tooling, you can run:

```bash
docker compose up --build
```

This starts backend on port 8000 and frontend on port 5173.

## Mobile frontend options

- Default: Vite frontend at http://127.0.0.1:5173 (mobile-friendly)
- Optional: host the frontend via Expo Web wrapper if your team already uses Expo tooling

## Troubleshooting

- Port busy: stop old uvicorn/vite processes and restart
- API auth enabled: set token in sidebar before calling secured endpoints
- Local providers unavailable:
  - Ollama is typically not available on Android directly
  - Prefer cloud providers or remote local-provider hosts
