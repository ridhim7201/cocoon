import { useState, useEffect, useRef, useCallback } from "react";
import { loadTasks } from "../lib/storage";
import { apiUrl } from "../lib/api";
import { Mic, X, AlertCircle, Loader, CheckCircle2, HelpCircle } from "lucide-react";

// ─── Intent → routing config ──────────────────────────────────────────────────
// Maps each backend intent to a human-readable label + icon + event to dispatch.

const INTENT_CONFIG = {
  NAVIGATE_TASK_BOT: { label: "Opening task assistant", color: "var(--purple)" },
  OPEN_SETTINGS:     { label: "Opening settings",        color: "var(--purple)" },
  CLEAR_SCHEDULE:    { label: "Clear schedule?",          color: "var(--crimson)" },
  ADD_TASK:          { label: "Adding task",              color: "var(--purple)" },
  PRODUCTIFY_SLOT:   { label: "Finding something for you", color: "var(--purple)" },
  UNKNOWN:           { label: "Command not recognized",   color: "var(--text-muted)" },
};

// ─── Toast (for UNKNOWN intent / errors) ──────────────────────────────────────

function Toast({ message, tone = "neutral", onDone }) {
  useEffect(() => {
    const id = setTimeout(onDone, 2400);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div className={`vc-toast vc-toast-${tone}`}>
      {tone === "error" ? <AlertCircle size={14} /> : <HelpCircle size={14} />}
      {message}
    </div>
  );
}

// ─── Main VoiceCommand component ──────────────────────────────────────────────
// Mounted once at the App root. Listens for "cocoon:voice-trigger" and Cmd+K,
// manages its own full lifecycle: idle → listening → processing → routing → idle.

export default function VoiceCommand() {
  const [phase, setPhase] = useState("idle"); // idle | listening | processing | routed | error
  const [transcript, setTranscript] = useState("");
  const [routedLabel, setRoutedLabel] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [toast, setToast] = useState(null);
  const [voiceSupported, setVoiceSupported] = useState(true);

  const recognitionRef = useRef(null);
  const timeoutRef = useRef(null);

  // Check support once
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(!!SR);
  }, []);

  // ── Trigger handler — opens the overlay and starts listening ──
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setToast({ message: "Voice input isn't supported in this browser", tone: "error" });
      return;
    }

    setTranscript("");
    setConfirmClear(false);
    setPhase("listening");

    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      setTranscript((prev) => final ? (prev + final) : (prev + interim).trimStart());
      if (final) {
        // Stop and process once we have a final result
        recognition.stop();
      }
    };

    recognition.onerror = (e) => {
      if (e.error === "no-speech") {
        setToast({ message: "Didn't catch that — try again", tone: "error" });
      } else if (e.error === "not-allowed" || e.error === "permission-denied") {
        setToast({ message: "Microphone permission denied", tone: "error" });
      } else {
        setToast({ message: "Voice recognition error", tone: "error" });
      }
      setPhase("idle");
    };

    recognition.onend = () => {
      // If we ended without ever getting a final result, fall back to whatever we have
      setPhase((p) => {
        if (p === "listening") {
          // Use whatever transcript was captured, if any
          return "listening-ended";
        }
        return p;
      });
    };

    recognition.start();

    // Safety timeout: stop listening after 8s regardless
    timeoutRef.current = setTimeout(() => {
      recognition.stop();
    }, 8000);
  }, []);

  // When listening ends, process whatever transcript we got
  useEffect(() => {
    if (phase !== "listening-ended") return;
    clearTimeout(timeoutRef.current);

    const finalTranscript = transcript.trim();
    if (!finalTranscript) {
      setPhase("idle");
      return;
    }
    processTranscript(finalTranscript);
  }, [phase, transcript]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Process transcript via /api/voice-intent ──
  async function processTranscript(text) {
    setPhase("processing");

    const tasks = loadTasks();
    const activeTasks = tasks
      .filter((t) => t.status === "pending" || t.status === "in_progress")
      .map((t) => ({ id: t.id, title: t.title }));

    try {
      const res = await fetch(apiUrl("/api/voice-intent"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, activeTasks }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }

      const intent = await res.json();
      routeIntent(intent, tasks);
    } catch (err) {
      setToast({ message: err.message || "Couldn't process that command", tone: "error" });
      setPhase("idle");
    }
  }

  // ── Route the parsed intent to the right module ──
  function routeIntent(intent, tasks) {
    const cfg = INTENT_CONFIG[intent.intent] || INTENT_CONFIG.UNKNOWN;

    switch (intent.intent) {
      case "NAVIGATE_TASK_BOT": {
        const task = tasks.find((t) => t.id === intent.taskId);
        if (!task) {
          setToast({ message: "Couldn't find that task", tone: "error" });
          setPhase("idle");
          return;
        }
        setRoutedLabel(cfg.label);
        setPhase("routed");
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("cocoon:navigate-task-bot", { detail: { task } }));
          closeOverlay();
        }, 500);
        break;
      }

      case "OPEN_SETTINGS": {
        setRoutedLabel(cfg.label);
        setPhase("routed");
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("cocoon:open-settings"));
          closeOverlay();
        }, 500);
        break;
      }

      case "PRODUCTIFY_SLOT": {
        setRoutedLabel(cfg.label);
        setPhase("routed");
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("cocoon:productify-slot"));
          closeOverlay();
        }, 500);
        break;
      }

      case "ADD_TASK": {
        setRoutedLabel(cfg.label);
        setPhase("routed");
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("cocoon:add-task", { detail: { rawTask: intent.rawTask || transcript } })
          );
          closeOverlay();
        }, 500);
        break;
      }

      case "CLEAR_SCHEDULE": {
        // Requires confirmation — don't auto-route
        setPhase("idle");
        setConfirmClear(true);
        break;
      }

      case "UNKNOWN":
      default: {
        setToast({ message: "Command not recognized — try again", tone: "neutral" });
        setPhase("idle");
        break;
      }
    }
  }

  // ── Confirm clear schedule ──
  function handleConfirmClear() {
    window.dispatchEvent(new CustomEvent("cocoon:clear-schedule"));
    setConfirmClear(false);
    setToast({ message: "Schedule cleared", tone: "neutral" });
  }

  function handleCancelClear() {
    setConfirmClear(false);
  }

  // ── Close overlay / cancel listening ──
  function closeOverlay() {
    recognitionRef.current?.stop();
    clearTimeout(timeoutRef.current);
    setPhase("idle");
    setTranscript("");
    setRoutedLabel("");
  }

  // ── External triggers: FAB click + Cmd+K ──
  useEffect(() => {
    function onTrigger() {
      if (phase === "idle") startListening();
    }
    window.addEventListener("cocoon:voice-trigger", onTrigger);
    return () => window.removeEventListener("cocoon:voice-trigger", onTrigger);
  }, [phase, startListening]);

  // Escape closes overlay
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && phase !== "idle") closeOverlay();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  const isOverlayOpen = phase !== "idle" || confirmClear;

  return (
    <>
      <style>{`
        /* ── Overlay ── */
        .vc-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.72);
          backdrop-filter: blur(8px);
          z-index: 300;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: vc-overlay-in 0.18s ease;
        }
        @keyframes vc-overlay-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* ── Card ── */
        .vc-card {
          width: 100%;
          max-width: 380px;
          margin: 0 1.25rem;
          background: var(--surface);
          border: 1px solid var(--glass-border);
          border-radius: 20px;
          padding: 2rem 1.75rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.25rem;
          animation: vc-card-in 0.26s cubic-bezier(0.32,0.72,0,1);
          position: relative;
        }
        @keyframes vc-card-in {
          from { opacity: 0; transform: scale(0.92) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }

        .vc-close {
          position: absolute;
          top: 14px; right: 14px;
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 7px;
          width: 28px; height: 28px;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.14s;
        }
        .vc-close:hover { color: var(--text); background: var(--surface2); }

        /* ── Mic orb ── */
        .vc-orb-wrapper {
          position: relative;
          width: 88px;
          height: 88px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .vc-orb {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: rgba(124,58,237,0.15);
          border: 1px solid rgba(124,58,237,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2;
          transition: background 0.2s, border-color 0.2s;
        }
        .vc-orb.listening {
          background: rgba(220,38,38,0.15);
          border-color: rgba(220,38,38,0.35);
        }
        .vc-orb.processing {
          background: rgba(124,58,237,0.15);
          border-color: rgba(124,58,237,0.35);
        }
        .vc-orb.routed {
          background: rgba(16,185,129,0.15);
          border-color: rgba(16,185,129,0.35);
        }

        /* Pulse rings — only while listening */
        .vc-ring {
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(220,38,38,0.25);
          animation: vc-ring-pulse 1.8s ease-out infinite;
        }
        .vc-ring:nth-child(1) { width: 88px;  height: 88px;  animation-delay: 0s; }
        .vc-ring:nth-child(2) { width: 110px; height: 110px; animation-delay: 0.5s; }
        @keyframes vc-ring-pulse {
          0%   { opacity: 0.7; transform: scale(0.8); }
          100% { opacity: 0;   transform: scale(1.25); }
        }

        /* Spinner for processing */
        .vc-spinner {
          width: 20px; height: 20px;
          border: 2px solid rgba(124,58,237,0.25);
          border-top-color: var(--purple);
          border-radius: 50%;
          animation: vc-spin 0.7s linear infinite;
        }
        @keyframes vc-spin { to { transform: rotate(360deg); } }

        /* ── Status text ── */
        .vc-status-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.68rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-muted);
          text-align: center;
        }
        .vc-status-label.listening { color: var(--crimson); }
        .vc-status-label.routed    { color: #10b981; }

        /* ── Transcript display ── */
        .vc-transcript {
          min-height: 28px;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1.05rem;
          font-weight: 600;
          color: var(--text);
          text-align: center;
          line-height: 1.4;
          max-width: 320px;
        }
        .vc-transcript-placeholder {
          color: var(--text-muted);
          font-weight: 400;
          opacity: 0.5;
          font-family: 'Inter', sans-serif;
          font-size: 0.875rem;
        }
        .vc-transcript-cursor {
          display: inline-block;
          width: 2px;
          height: 18px;
          background: var(--crimson);
          margin-left: 3px;
          vertical-align: middle;
          animation: vc-cursor-blink 0.8s step-end infinite;
        }
        @keyframes vc-cursor-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }

        /* ── Examples hint ── */
        .vc-examples {
          display: flex;
          flex-direction: column;
          gap: 4px;
          align-items: center;
          opacity: 0.55;
        }
        .vc-example-line {
          font-size: 0.72rem;
          color: var(--text-muted);
          font-family: 'Inter', sans-serif;
          font-style: italic;
        }

        /* ── Confirm clear schedule ── */
        .vc-confirm-icon {
          width: 52px; height: 52px;
          border-radius: 50%;
          background: rgba(220,38,38,0.12);
          border: 1px solid rgba(220,38,38,0.3);
          display: flex; align-items: center; justify-content: center;
        }
        .vc-confirm-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--text);
          text-align: center;
        }
        .vc-confirm-body {
          font-size: 0.82rem;
          color: var(--text-muted);
          text-align: center;
          line-height: 1.55;
          font-family: 'Inter', sans-serif;
          max-width: 280px;
        }
        .vc-confirm-actions {
          display: flex;
          gap: 8px;
          width: 100%;
        }
        .vc-confirm-cancel {
          flex: 1;
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 10px;
          padding: 0.7rem;
          color: var(--text-muted);
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.14s;
        }
        .vc-confirm-cancel:hover { color: var(--text); border-color: rgba(255,255,255,0.15); }
        .vc-confirm-danger {
          flex: 1;
          background: var(--crimson);
          border: none;
          border-radius: 10px;
          padding: 0.7rem;
          color: #fff;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.14s;
        }
        .vc-confirm-danger:hover { background: #b91c1c; transform: translateY(-1px); }

        /* ── Toast (for command not recognized / errors) ── */
        .vc-toast {
          position: fixed;
          bottom: 6.5rem;
          left: 50%;
          transform: translateX(-50%);
          z-index: 301;
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 0.65rem 1.1rem;
          border-radius: 100px;
          font-family: 'Inter', sans-serif;
          font-size: 0.8rem;
          font-weight: 500;
          white-space: nowrap;
          animation: vc-toast-in 0.25s cubic-bezier(0.32,0.72,0,1), vc-toast-out 0.25s ease 2.15s forwards;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }
        @keyframes vc-toast-in {
          from { opacity: 0; transform: translateX(-50%) translateY(10px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes vc-toast-out {
          to { opacity: 0; transform: translateX(-50%) translateY(8px); }
        }
        .vc-toast-error {
          background: rgba(220,38,38,0.15);
          border: 1px solid rgba(220,38,38,0.35);
          color: #fca5a5;
        }
        .vc-toast-neutral {
          background: var(--surface2);
          border: 1px solid var(--glass-border);
          color: var(--text-muted);
        }

        @media (max-width: 420px) {
          .vc-card { padding: 1.75rem 1.25rem; }
        }
      `}</style>

      {/* Main overlay — listening / processing / routed */}
      {isOverlayOpen && !confirmClear && (
        <div className="vc-overlay" onClick={phase !== "processing" ? closeOverlay : undefined}>
          <div className="vc-card" onClick={(e) => e.stopPropagation()}>
            <button className="vc-close" onClick={closeOverlay} aria-label="Close voice command">
              <X size={14} />
            </button>

            {/* Orb */}
            <div className="vc-orb-wrapper">
              {phase === "listening" && (
                <>
                  <div className="vc-ring" />
                  <div className="vc-ring" />
                </>
              )}
              <div className={`vc-orb ${phase}`}>
                {phase === "listening" && <Mic size={24} style={{ color: "var(--crimson)" }} />}
                {phase === "processing" && <div className="vc-spinner" />}
                {phase === "routed" && <CheckCircle2 size={24} style={{ color: "#10b981" }} />}
              </div>
            </div>

            {/* Status label */}
            <span className={`vc-status-label ${phase}`}>
              {phase === "listening" && "Listening…"}
              {phase === "processing" && "Processing…"}
              {phase === "routed" && routedLabel}
            </span>

            {/* Transcript */}
            <div className="vc-transcript">
              {transcript ? (
                <>
                  {transcript}
                  {phase === "listening" && <span className="vc-transcript-cursor" />}
                </>
              ) : (
                phase === "listening" && (
                  <span className="vc-transcript-placeholder">Say a command…</span>
                )
              )}
            </div>

            {/* Examples — only while idle-listening with no transcript yet */}
            {phase === "listening" && !transcript && (
              <div className="vc-examples">
                <span className="vc-example-line">"Help me with the report task"</span>
                <span className="vc-example-line">"Add a task: gym at 6pm"</span>
                <span className="vc-example-line">"I have a free slot"</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm clear schedule overlay */}
      {confirmClear && (
        <div className="vc-overlay" onClick={handleCancelClear}>
          <div className="vc-card" onClick={(e) => e.stopPropagation()}>
            <div className="vc-confirm-icon">
              <AlertCircle size={22} style={{ color: "var(--crimson)" }} />
            </div>
            <span className="vc-confirm-title">Clear your entire schedule?</span>
            <span className="vc-confirm-body">
              This removes all tasks from your timeline. This can't be undone.
            </span>
            <div className="vc-confirm-actions">
              <button className="vc-confirm-cancel" onClick={handleCancelClear}>
                Cancel
              </button>
              <button className="vc-confirm-danger" onClick={handleConfirmClear}>
                Clear it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          tone={toast.tone}
          onDone={() => setToast(null)}
        />
      )}
    </>
  );
}
