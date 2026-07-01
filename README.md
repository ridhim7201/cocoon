# Cocoon — "Protect your time. Force your growth."

A dark, AI-powered productivity app with task scheduling, alarm takeovers, emergence slots,
voice commands, and sleep tracking. Powered by Google's **free** Gemini API.

## What's in this folder

```
cocoon/
├── server/     ← Express backend (Gemini API calls live here)
│   ├── server.js
│   ├── Dockerfile        ← for Cloud Run
│   └── .env.example
└── client/     ← Vite + React frontend
    ├── src/
    ├── Dockerfile         ← for Cloud Run
    ├── nginx.conf
    └── .env.example
```

---

## Architecture

Two independently deployable services. The frontend never talks to Gemini directly —
every AI call is brokered through the Express backend, so the API key never reaches
the browser.

```
┌─────────────┐      /api/*       ┌─────────────┐      Gemini API      ┌─────────┐
│   client     │ ───────────────► │   server     │ ───────────────────► │ Gemini  │
│ (React/Vite) │ ◄─────────────── │  (Express)   │ ◄─────────────────── │  2.0    │
└─────────────┘                   └─────────────┘                       │ Flash   │
                                                                          └─────────┘
        │
        ▼
  localStorage
  (user profile, tasks, sleep logs — no database)
```

### Backend — API reference

All endpoints are prefixed `/api`, accept/return JSON, and call `gemini-2.0-flash`
under the hood via the shared `callGemini()` helper in `server.js`.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Liveness check — returns `{status, model}` |
| `/api/schedule` | POST | Parses natural language into an array of scheduled `Task` objects |
| `/api/emergence-slots` | POST | Generates exactly 3 `EmergenceActivity` suggestions for a free time slot |
| `/api/task-chatbot` | POST | Multi-turn execution assistant for a single task |
| `/api/voice-intent` | POST | Parses a speech transcript into a structured app intent |

### Frontend — module reference

Each major feature is an isolated component, composed together in `App.jsx` and
communicating via custom `window` events (e.g. `cocoon:tasks-updated`,
`cocoon:voice-trigger`) rather than prop-drilling through the whole tree.

| Component | Responsibility |
|---|---|
| `Onboarding.jsx` | 4-step profile setup (name, profession, hobbies, sleep requirement) |
| `Dashboard.jsx` | Root shell — topbar, week navigation, assembles all dashboard sections |
| `WeekStrip.jsx` | 7-day clickable strip with deadline/task indicators |
| `TaskTimeline.jsx` | Vertical, duration-proportional daily schedule view |
| `ActiveTaskCard.jsx` | Live countdown card for the most urgent pending task |
| `StatsStrip.jsx` | Completion rate, time dilation, and tightening level at a glance |
| `TaskInput.jsx` | Natural-language task entry → calls `/api/schedule`, shows a review step before committing |
| `AlarmTakeover.jsx` | Full-screen task alarm; owns the Progressive Tightening logic |
| `EmergenceSlot.jsx` | Free-slot activity modal → calls `/api/emergence-slots`, includes a live timer |
| `TaskChatbot.jsx` | Per-task AI execution assistant → calls `/api/task-chatbot` |
| `VoiceCommand.jsx` | Voice capture + intent routing → calls `/api/voice-intent` |
| `SleepMode.jsx` | Sleep onset/wake logging, sets Do-Not-Disturb until target wake time |

### Data model

All state lives in `localStorage` under a handful of namespaced keys
(`cocoon_user`, `cocoon_tasks`, `cocoon_sleep_logs`, `cocoon_dnd_until`), managed
through a single `lib/storage.js` module so every component reads/writes through
the same interface.

### Progressive Tightening — how it actually works

This is the project's signature mechanic, implemented in `AlarmTakeover.jsx`:

1. Every "Need More Time" press increments that task's `extensionsCount`.
2. Every 3rd extension *across all tasks* increments the user's global
   `progressiveTighteningLevel` (capped at 5).
3. Whenever the level increases, `applyTightening()` recompresses every future
   pending task's duration by `10% × level`, shortening free gaps in the schedule.
4. On the 2nd+ extension for a single task, the alarm shows an explicit in-app
   warning before letting the user continue — the consequence is never silent.



1. **Node.js 18+** installed (`node -v` to check)
2. **A free Gemini API key** — get one at https://aistudio.google.com/apikey
   (sign in with any Google account, click "Create API key" — no credit card required)
3. **For deployment only:** a Google Cloud project with billing enabled and the
   `gcloud` CLI installed (https://cloud.google.com/sdk/docs/install). Cloud Run itself
   has a generous free tier — for a small personal app like this you're unlikely to be
   charged, but Google does require billing to be enabled on the project.

### About the free Gemini tier

This app uses `gemini-2.0-flash`. As of writing, Google's free tier allows:
- 15 requests per minute
- 1,500 requests per day
- 1 million tokens per minute

These limits can change — check https://ai.google.dev/gemini-api/docs/rate-limits for
current numbers. For personal use this is more than enough; you won't hit these limits
unless you're hammering the scheduler in a loop.

---

## Part 1 — Run it locally first

Always get it working locally before deploying. Two terminals, both stay open.

### Setup

```bash
cd server
npm install
copy .env.example .env        # Windows
# cp .env.example .env        # Mac/Linux
```

Open `server/.env` and paste your real key:
```
GEMINI_API_KEY=AIzaSy...your-real-key-here
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
```

```bash
cd ../client
npm install
```

### Run

**Terminal 1:**
```bash
cd server
npm run dev
```
Look for: `[Cocoon] Server running on http://localhost:3001`

**Terminal 2:**
```bash
cd client
npm run dev
```
Open the printed URL (usually `http://localhost:5173`).

### Smoke test

```bash
curl http://localhost:3001/api/health
```
Should return `{"status":"ok","model":"gemini-2.0-flash"}`.

---

## Part 2 — Deploy to Google Cloud Run

Cloud Run runs containers, so each half of the app (server, client) deploys as its own
service. The backend goes first since the frontend needs its URL.

### 0. One-time gcloud setup

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com
```

### 1. Deploy the backend

From the `server/` folder:

```bash
cd server

gcloud run deploy cocoon-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=YOUR_REAL_GEMINI_KEY
```

`--source .` tells Cloud Run to build the Dockerfile in this folder automatically — no
manual `docker build` needed. When it finishes, it prints a URL like:

```
Service URL: https://cocoon-backend-abc123-uc.a.run.app
```

**Copy that URL** — you need it for the next two steps.

### 2. Update the backend's allowed origins

You'll deploy the frontend in the next step and get *its* URL, but Cloud Run service
URLs are predictable before first deploy if you want to pre-set this, or you can simply
redeploy the backend once after step 3 with the real frontend URL:

```bash
gcloud run services update cocoon-backend \
  --region us-central1 \
  --set-env-vars GEMINI_API_KEY=YOUR_REAL_GEMINI_KEY,ALLOWED_ORIGINS=https://YOUR-FRONTEND-URL.run.app
```

(You'll run this again after step 3 once you know the real frontend URL.)

### 3. Deploy the frontend

From the `client/` folder, pointing it at the backend URL from step 1:

```bash
cd ../client

gcloud run deploy cocoon-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --build-env-vars VITE_API_URL=https://cocoon-backend-abc123-uc.a.run.app
```

This prints the frontend's live URL, e.g. `https://cocoon-frontend-xyz789-uc.a.run.app`.

### 4. Close the loop — update backend CORS with the real frontend URL

```bash
cd ../server

gcloud run services update cocoon-backend \
  --region us-central1 \
  --set-env-vars GEMINI_API_KEY=YOUR_REAL_GEMINI_KEY,ALLOWED_ORIGINS=https://cocoon-frontend-xyz789-uc.a.run.app
```

### 5. Open the app

Visit the frontend URL from step 3 in your browser. That's the live, deployed app.

### Redeploying after code changes

Whenever you edit `server.js` or anything in `client/src`, redeploy that service with
the same `gcloud run deploy` command from steps 1 or 3 — Cloud Run rebuilds the
container and rolls out the new version with zero downtime.

---

## Full walkthrough — testing every feature

1. **Onboarding** — fill in your name, profession, pick hobbies, choose sleep hours.
2. **Add tasks** — click "Add tasks", type something like:
   > "I have a Networks assignment due Friday, 3 hours to do it. Also want to practice guitar sometime this week."

   "Schedule with AI" → review the generated cards → "Add to schedule".
3. **Timeline** — tasks appear on the vertical timeline; click the week strip to jump between days.
4. **Task chatbot** — click any task to open the AI execution assistant.
5. **Emergence slot** — click "Productify" (appears when no task is in progress) for 3 AI-suggested activities.
6. **Voice commands** — click the floating mic or press `Cmd+K` / `Ctrl+K`:
   - "Add a task: gym at 6pm tomorrow"
   - "I have a free slot, help me use it"
   - "Clear my schedule"
7. **Alarm takeover** — fires automatically at a task's scheduled time. To test instantly, open the browser console:
   ```js
   window.__testAlarm()
   ```
8. **Sleep mode** — moon icon in the topbar, log sleep onset, confirm `window.__testAlarm()` does nothing while "asleep," then "I'm Awake" to see the deficit logged.

---

## Troubleshooting

**"GEMINI_API_KEY is not set" and the server won't start**
`server/.env` is missing or still has the placeholder text. Re-check step 1 of local setup.

**Gemini API error 429**
You've hit the free tier's rate limit (15 req/min or 1500/day). Wait a minute and retry, or check your usage at https://aistudio.google.com.

**Gemini API error 400 with a safety-related message**
Gemini's safety filters occasionally flag normal scheduling text as a false positive. Rephrase the task description and try again.

**CORS error in the browser console after deploying**
The backend's `ALLOWED_ORIGINS` doesn't include your frontend's actual URL. Re-run the step 4 update command with the exact URL Cloud Run gave you (including `https://`, no trailing slash).

**Frontend builds but API calls go to the wrong place**
`VITE_API_URL` is baked in at *build* time, not runtime — if you redeploy the backend and its URL changes, you must rebuild the frontend with the new `--build-env-vars VITE_API_URL=...` value, not just restart it.

**Voice commands don't work**
The Web Speech API requires Chrome, Edge, or Safari — Firefox doesn't support it. Also requires microphone permission, and on a deployed (non-localhost) site, requires HTTPS — Cloud Run gives you HTTPS automatically, so this should work once deployed.
