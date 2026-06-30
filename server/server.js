import "dotenv/config";
import express from "express";
import cors from "cors";

// ─── Startup guard ────────────────────────────────────────────────────────────
if (!process.env.GEMINI_API_KEY) {
  console.error(
    "[Cocoon] GEMINI_API_KEY is not set. Copy .env.example → .env and add your free key from https://aistudio.google.com/apikey"
  );
  process.exit(1);
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PORT = process.env.PORT || 3001;
// Gemini 2.0 Flash is the model on Google's free tier — fast and supports JSON mode.
const MODEL = "gemini-2.0-flash";
const MAX_TOKENS = 1024;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// ─── Shared fetch helper ───────────────────────────────────────────────────────
/**
 * Calls the Gemini API and returns the model's text response as a string.
 * Mirrors the same { system, messages } shape the rest of the server uses,
 * so every endpoint below is unchanged from the Anthropic version — only this
 * function and the request/response translation differ.
 *
 * Gemini has no separate "system" field in the same way Anthropic does for
 * generateContent; it's passed via systemInstruction. Roles map "assistant" → "model".
 */
async function callGemini({ system, messages }) {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: MAX_TOKENS,
      temperature: 0.7,
    },
  };

  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errorBody}`);
  }

  const data = await res.json();

  // Check for safety blocks or empty candidates before assuming success
  const candidate = data.candidates?.[0];
  if (!candidate) {
    const blockReason = data.promptFeedback?.blockReason;
    throw new Error(
      blockReason
        ? `Gemini blocked the request: ${blockReason}`
        : "Gemini returned no candidates."
    );
  }
  if (candidate.finishReason === "SAFETY") {
    throw new Error("Gemini blocked the response for safety reasons.");
  }

  const textPart = candidate.content?.parts?.find((p) => typeof p.text === "string");
  if (!textPart) throw new Error("No text part in Gemini response");
  return textPart.text.trim();
}

/**
 * Safely parses a JSON string returned by Gemini.
 * Strips any accidental markdown fences just in case.
 */
function safeParseJSON(raw) {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

// ─── Express setup ─────────────────────────────────────────────────────────────
const app = express();

// Allowed origins: comma-separated env var, falling back to local dev defaults.
// Set ALLOWED_ORIGINS in production to your deployed frontend's Cloud Run URL.
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:5174"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow no-origin requests (curl, server-to-server, health checks)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    methods: ["GET", "POST"],
  })
);
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", model: MODEL });
});

// ─── POST /api/schedule ────────────────────────────────────────────────────────
/**
 * Body: { userProfile: User, rawInput: string }
 * Parses natural language task descriptions into an array of Task objects
 * with AI-distributed scheduled start/end times.
 */
app.post("/api/schedule", async (req, res) => {
  const { userProfile, rawInput } = req.body;

  if (!userProfile || !rawInput) {
    return res
      .status(400)
      .json({ error: "userProfile and rawInput are required." });
  }

  const system = `You are Cocoon's AI Scheduler. Given a user's profile and their natural language task description, extract all tasks and return a JSON array of Task objects. For each task: infer estimatedDurationMins, set isFlexible=true if no hard deadline is mentioned, distribute work across days logically, and set scheduledStart/scheduledEnd. Return ONLY valid JSON array, no other text.`;

  const userMessage = `
User Profile:
- Name: ${userProfile.name}
- Profession: ${userProfile.profession}
- Hobbies: ${(userProfile.hobbies || []).join(", ")}
- Sleep requirement: ${userProfile.sleepRequirementHours} hours/night
- Progressive tightening level: ${userProfile.progressiveTighteningLevel ?? 0}

Task description: "${rawInput}"

Current date/time: ${new Date().toISOString()}

Return a JSON array of Task objects matching this TypeScript interface exactly:
{
  id: string (generate a short uuid-style string),
  userId: "${userProfile.id}",
  title: string,
  description: string,
  deadline: string (ISO date) or null,
  isFlexible: boolean,
  estimatedDurationMins: number,
  actualDurationMins: null,
  status: "pending",
  extensionsCount: 0,
  scheduledStart: string (ISO date),
  scheduledEnd: string (ISO date)
}

Scheduling rules:
1. Do not schedule any task during sleep hours (derive from sleepRequirementHours, assume sleep starts at 23:00).
2. If progressiveTighteningLevel > 0, reduce free gaps between tasks by 10% per level.
3. Distribute multi-day tasks across multiple sessions of ≤ 90 mins each.
4. Tasks with hard deadlines get priority in earlier slots.
5. Return ONLY the JSON array — no markdown, no commentary.
`.trim();

  try {
    const raw = await callGemini({
      system,
      messages: [{ role: "user", content: userMessage }],
    });

    const tasks = safeParseJSON(raw);

    if (!Array.isArray(tasks)) {
      throw new Error("AI did not return an array of tasks.");
    }

    return res.json({ tasks });
  } catch (err) {
    console.error("[/api/schedule]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/emergence-slots ─────────────────────────────────────────────────
/**
 * Body: { userProfile: User, freeMinutes: number, sleepDeficitMins: number, upcomingTasks: Task[] }
 * Returns exactly 3 EmergenceActivity objects tailored to the user's context.
 */
app.post("/api/emergence-slots", async (req, res) => {
  const { userProfile, freeMinutes, sleepDeficitMins, upcomingTasks } =
    req.body;

  if (
    !userProfile ||
    freeMinutes === undefined ||
    sleepDeficitMins === undefined
  ) {
    return res.status(400).json({
      error: "userProfile, freeMinutes, and sleepDeficitMins are required.",
    });
  }

  const taskTitles = (upcomingTasks || [])
    .map((t) => t.title)
    .join(", ") || "none";

  const system = `You are Cocoon's Guardian AI. The user has ${freeMinutes} free minutes. Sleep deficit: ${sleepDeficitMins} mins. Profession: ${userProfile.profession}. Hobbies: ${(userProfile.hobbies || []).join(", ")}. Upcoming tasks: ${taskTitles}. Generate exactly 3 Emergence Slot micro-activities. Rules: (1) If sleep deficit > 60 mins, activity[0] MUST be a rest/nap option. (2) Blend profession + hobbies creatively — e.g. 'CS Student who likes music' → 'Vibe-code a mini-game to your playlist'. (3) One activity must relate to an upcoming task. Return ONLY a JSON array matching EmergenceActivity schema.`;

  const userMessage = `
Generate exactly 3 micro-activities for a ${freeMinutes}-minute free slot.

Return a JSON array matching this schema exactly:
[
  {
    "id": string (short unique id),
    "title": string (concise, action-oriented, max 8 words),
    "description": string (1-2 sentences, specific and motivating),
    "category": "rest" | "learn" | "create" | "physical",
    "durationMins": number (must be ≤ ${freeMinutes})
  }
]

Rules enforced:
- sleep deficit is ${sleepDeficitMins} mins — ${sleepDeficitMins > 60 ? "FIRST activity MUST be a rest or nap option." : "no forced rest activity needed."}
- Activity 2 or 3 must directly relate to one of: ${taskTitles}
- Make activities feel energizing and tailored, not generic
- Return ONLY the JSON array — no markdown, no commentary.
`.trim();

  try {
    const raw = await callGemini({
      system,
      messages: [{ role: "user", content: userMessage }],
    });

    const activities = safeParseJSON(raw);

    if (!Array.isArray(activities) || activities.length !== 3) {
      throw new Error("AI did not return exactly 3 activities.");
    }

    return res.json({ activities });
  } catch (err) {
    console.error("[/api/emergence-slots]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/task-chatbot ────────────────────────────────────────────────────
/**
 * Body: { taskTitle: string, taskDescription: string, deadlineISO?: string, conversationHistory: {role, content}[] }
 * Returns the assistant's next message string.
 * Maintains full conversation history for multi-turn coherence.
 */
app.post("/api/task-chatbot", async (req, res) => {
  const { taskTitle, taskDescription, deadlineISO, conversationHistory } =
    req.body;

  if (!taskTitle || !Array.isArray(conversationHistory)) {
    return res.status(400).json({
      error: "taskTitle and conversationHistory array are required.",
    });
  }

  const deadlineDisplay = deadlineISO
    ? new Date(deadlineISO).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "No hard deadline";

  const system = `You are the dedicated execution assistant for the task: '${taskTitle}'. Description: ${taskDescription || "No description provided"}. Deadline: ${deadlineDisplay}. Your prime directive: the user is staring at a blank page. Do NOT give scheduling advice. Give the single smallest possible first step they can take in the next 5 minutes. Be direct and firm, not verbose. If they ask for a template or outline, give a tight 3-part structure.`;

  // Validate and sanitize conversation history — must alternate user/assistant
  const sanitizedHistory = conversationHistory
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .map((m) => ({ role: m.role, content: m.content.trim() }));

  // Last message must be from the user
  if (
    sanitizedHistory.length === 0 ||
    sanitizedHistory[sanitizedHistory.length - 1].role !== "user"
  ) {
    return res.status(400).json({
      error:
        "conversationHistory must end with a user message.",
    });
  }

  try {
    const raw = await callGemini({
      system,
      messages: sanitizedHistory,
    });

    return res.json({ message: raw });
  } catch (err) {
    console.error("[/api/task-chatbot]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/voice-intent ────────────────────────────────────────────────────
/**
 * Body: { transcript: string, activeTasks: {id: string, title: string}[] }
 * Returns a structured intent object.
 */
app.post("/api/voice-intent", async (req, res) => {
  const { transcript, activeTasks } = req.body;

  if (!transcript) {
    return res.status(400).json({ error: "transcript is required." });
  }

  const taskList = (activeTasks || [])
    .map((t) => `{"id":"${t.id}","title":"${t.title}"}`)
    .join(", ");

  const system = `You are a voice intent parser for the Cocoon productivity app. Given a transcript and a list of active tasks, identify the user's intent. Valid intents: NAVIGATE_TASK_BOT (user wants execution advice for a specific task), OPEN_SETTINGS, CLEAR_SCHEDULE, ADD_TASK, PRODUCTIFY_SLOT (user wants to fill a free slot), UNKNOWN. If NAVIGATE_TASK_BOT, fuzzy-match the transcript to the closest task title and return its id as taskId. Return ONLY valid JSON, no other text.`;

  const userMessage = `
Transcript: "${transcript}"

Active tasks: [${taskList}]

Return a JSON object matching this shape exactly:
{
  "intent": "NAVIGATE_TASK_BOT" | "OPEN_SETTINGS" | "CLEAR_SCHEDULE" | "ADD_TASK" | "PRODUCTIFY_SLOT" | "UNKNOWN",
  "taskId": "string or null",
  "rawTask": "string or null"
}

Rules:
- If intent is NAVIGATE_TASK_BOT, set taskId to the id of the best fuzzy-matched task
- If intent is ADD_TASK, set rawTask to the task description extracted from the transcript
- All other intents: taskId and rawTask must be null
- Return ONLY the JSON object — no markdown, no commentary.
`.trim();

  try {
    const raw = await callGemini({
      system,
      messages: [{ role: "user", content: userMessage }],
    });

    const intent = safeParseJSON(raw);

    const validIntents = [
      "NAVIGATE_TASK_BOT",
      "OPEN_SETTINGS",
      "CLEAR_SCHEDULE",
      "ADD_TASK",
      "PRODUCTIFY_SLOT",
      "UNKNOWN",
    ];

    if (!validIntents.includes(intent.intent)) {
      throw new Error(`Invalid intent value: ${intent.intent}`);
    }

    return res.json(intent);
  } catch (err) {
    console.error("[/api/voice-intent]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// ─── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("[Cocoon unhandled error]", err);
  res.status(500).json({ error: "Internal server error." });
});

// ─── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Cocoon] Server running on http://localhost:${PORT}`);
  console.log(`[Cocoon] Using model: ${MODEL} (Gemini free tier)`);
  console.log(`[Cocoon] Endpoints ready:`);
  console.log(`         GET  /api/health`);
  console.log(`         POST /api/schedule`);
  console.log(`         POST /api/emergence-slots`);
  console.log(`         POST /api/task-chatbot`);
  console.log(`         POST /api/voice-intent`);
});
