import { useState, useEffect, useRef } from "react";
import { loadTasks, saveTasks } from "../lib/storage";
import { fmtTime, fmtDuration, isSameDay } from "../lib/dates";
import { apiUrl } from "../lib/api";
import {
  X,
  Mic,
  MicOff,
  Sparkles,
  ChevronRight,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Loader,
  Trash2,
  RotateCcw,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDeadline(isoDate) {
  if (!isoDate) return null;
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatScheduled(start, end) {
  if (!start) return null;
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  let dayLabel;
  if (isSameDay(s, today)) dayLabel = "Today";
  else if (isSameDay(s, tomorrow)) dayLabel = "Tomorrow";
  else
    dayLabel = s.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const timeStr = s.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const endStr = e
    ? ` — ${e.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`
    : "";

  return `${dayLabel}, ${timeStr}${endStr}`;
}

// ─── TaskPreviewCard ───────────────────────────────────────────────────────────

function TaskPreviewCard({ task, onRemove, index }) {
  return (
    <div className={`tpi-preview-card tpi-card-enter`} style={{ animationDelay: `${index * 60}ms` }}>
      <div className="tpi-preview-top">
        <div className="tpi-preview-title-row">
          <span className="tpi-preview-index">{String(index + 1).padStart(2, "0")}</span>
          <span className="tpi-preview-title">{task.title}</span>
          {!task.isFlexible && task.deadline && (
            <span className="tpi-badge tpi-badge-deadline">Deadline</span>
          )}
          {task.isFlexible && (
            <span className="tpi-badge tpi-badge-flexible">Flexible</span>
          )}
        </div>
        <button
          className="tpi-remove-btn"
          onClick={() => onRemove(task.id)}
          aria-label="Remove task"
          title="Remove"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {task.description && (
        <p className="tpi-preview-desc">{task.description}</p>
      )}

      <div className="tpi-preview-meta">
        {task.scheduledStart && (
          <span className="tpi-meta-chip">
            <Clock size={11} />
            {formatScheduled(task.scheduledStart, task.scheduledEnd)}
          </span>
        )}
        {task.estimatedDurationMins && (
          <span className="tpi-meta-chip">
            <Calendar size={11} />
            {fmtDuration(task.estimatedDurationMins)}
          </span>
        )}
        {task.deadline && !task.isFlexible && (
          <span className="tpi-meta-chip tpi-chip-deadline">
            <AlertCircle size={11} />
            Due {formatDeadline(task.deadline)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main TaskInput component ──────────────────────────────────────────────────

const EXAMPLE_INPUTS = [
  "I have a Networks assignment due Friday, 3 hours to do it. Also want to practice guitar sometime this week.",
  "Paper draft due Monday — I need at least 4 hours across 2 sessions. Team meeting prep tomorrow, 45 mins.",
  "Finish the project report by Thursday, 2 hours. Gym session Monday and Wednesday morning, 1 hour each.",
];

export default function TaskInput({ user, isOpen, onClose, prefillText = "" }) {
  const [input, setInput] = useState(prefillText);
  const [phase, setPhase] = useState("idle"); // idle | loading | preview | error | saved
  const [pendingTasks, setPendingTasks] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [exampleIdx, setExampleIdx] = useState(0);

  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);

  // Check Web Speech API support
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(!!SR);
  }, []);

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 80);
      if (prefillText) setInput(prefillText);
    } else {
      // Reset when closed
      setPhase("idle");
      setPendingTasks([]);
      setErrorMsg("");
      setIsListening(false);
      recognitionRef.current?.stop();
    }
  }, [isOpen, prefillText]);

  // Rotate example placeholder
  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(
      () => setExampleIdx((i) => (i + 1) % EXAMPLE_INPUTS.length),
      4000
    );
    return () => clearInterval(id);
  }, [isOpen]);

  // Escape to close (when not in preview)
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && phase !== "loading") onClose();
    }
    if (isOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, phase, onClose]);

  // ── Voice input ──
  function toggleVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput((prev) => (prev ? prev + " " + transcript : transcript));
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  }

  // ── Call /api/schedule ──
  async function handleSchedule() {
    const trimmed = input.trim();
    if (!trimmed || phase === "loading") return;

    setPhase("loading");
    setErrorMsg("");

    try {
      const res = await fetch(apiUrl("/api/schedule"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userProfile: user, rawInput: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      if (!Array.isArray(data.tasks) || data.tasks.length === 0) {
        throw new Error("No tasks were returned. Try describing your tasks more clearly.");
      }

      setPendingTasks(data.tasks);
      setPhase("preview");
    } catch (err) {
      setErrorMsg(err.message);
      setPhase("error");
    }
  }

  // ── Remove a single pending task ──
  function removeTask(taskId) {
    const updated = pendingTasks.filter((t) => t.id !== taskId);
    setPendingTasks(updated);
    if (updated.length === 0) setPhase("idle");
  }

  // ── Confirm: merge with existing tasks, save, notify Dashboard ──
  function handleConfirm() {
    const existing = loadTasks();
    const merged = [...existing, ...pendingTasks];
    saveTasks(merged);
    window.dispatchEvent(
      new CustomEvent("cocoon:tasks-updated", { detail: { tasks: merged } })
    );
    setPhase("saved");
    setTimeout(() => onClose(), 1100);
  }

  // ── Re-prompt (go back to editing) ──
  function handleRedo() {
    setPhase("idle");
    setPendingTasks([]);
    setErrorMsg("");
    setTimeout(() => textareaRef.current?.focus(), 60);
  }

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        /* ── Overlay ── */
        .tpi-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(4px);
          z-index: 150;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          animation: tpi-overlay-in 0.2s ease;
        }
        @keyframes tpi-overlay-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* ── Sheet ── */
        .tpi-sheet {
          width: 100%;
          max-width: 680px;
          background: var(--surface);
          border: 1px solid var(--glass-border);
          border-bottom: none;
          border-radius: 20px 20px 0 0;
          padding: 0 0 env(safe-area-inset-bottom);
          max-height: 92vh;
          display: flex;
          flex-direction: column;
          animation: tpi-sheet-in 0.28s cubic-bezier(0.32, 0.72, 0, 1);
          overflow: hidden;
        }
        @keyframes tpi-sheet-in {
          from { transform: translateY(100%); opacity: 0.6; }
          to   { transform: translateY(0);    opacity: 1;   }
        }

        /* ── Handle ── */
        .tpi-handle {
          width: 36px;
          height: 4px;
          background: var(--surface2);
          border-radius: 2px;
          margin: 10px auto 0;
          flex-shrink: 0;
        }

        /* ── Header ── */
        .tpi-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.25rem 0.75rem;
          flex-shrink: 0;
          border-bottom: 1px solid var(--glass-border);
        }
        .tpi-header-left {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .tpi-header-eyebrow {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.6rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--purple);
        }
        .tpi-header-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1rem;
          font-weight: 700;
          color: var(--text);
        }
        .tpi-close-btn {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 8px;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--text-muted);
          transition: color 0.15s, background 0.15s;
          flex-shrink: 0;
        }
        .tpi-close-btn:hover { color: var(--text); background: var(--surface2); }

        /* ── Scrollable body ── */
        .tpi-body {
          flex: 1;
          overflow-y: auto;
          padding: 1.1rem 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        /* ── Textarea area ── */
        .tpi-input-wrapper {
          position: relative;
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 12px;
          transition: border-color 0.2s;
        }
        .tpi-input-wrapper:focus-within {
          border-color: rgba(124,58,237,0.4);
        }
        .tpi-textarea {
          width: 100%;
          min-height: 130px;
          max-height: 260px;
          background: transparent;
          border: none;
          outline: none;
          resize: none;
          padding: 1rem 1rem 3rem;
          font-family: 'Inter', sans-serif;
          font-size: 0.925rem;
          color: var(--text);
          line-height: 1.6;
        }
        .tpi-textarea::placeholder {
          color: var(--text-muted);
          opacity: 0.55;
          font-style: italic;
        }
        .tpi-textarea-toolbar {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          border-top: 1px solid var(--glass-border);
        }
        .tpi-char-count {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.6rem;
          color: var(--text-muted);
          letter-spacing: 0.06em;
          opacity: 0.5;
        }
        .tpi-toolbar-right {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .tpi-voice-btn {
          background: none;
          border: 1px solid var(--glass-border);
          border-radius: 7px;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--text-muted);
          transition: all 0.15s;
        }
        .tpi-voice-btn:hover { color: var(--text); border-color: rgba(255,255,255,0.15); }
        .tpi-voice-btn.recording {
          border-color: var(--crimson);
          color: var(--crimson);
          background: rgba(220,38,38,0.1);
          animation: mic-pulse 1s ease-in-out infinite;
        }
        @keyframes mic-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.3); }
          50%       { box-shadow: 0 0 0 6px rgba(220,38,38,0); }
        }

        /* ── Schedule button ── */
        .tpi-schedule-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: var(--purple);
          border: none;
          border-radius: 10px;
          padding: 0.875rem;
          color: #fff;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
          letter-spacing: 0.01em;
        }
        .tpi-schedule-btn:hover:not(:disabled) {
          background: #6d28d9;
          transform: translateY(-1px);
          box-shadow: 0 4px 24px rgba(124,58,237,0.4);
        }
        .tpi-schedule-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        /* ── Loading state ── */
        .tpi-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 2rem 0;
        }
        .tpi-loading-spinner {
          width: 28px;
          height: 28px;
          border: 2px solid var(--surface2);
          border-top-color: var(--purple);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .tpi-loading-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.72rem;
          color: var(--text-muted);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .tpi-loading-dots::after {
          content: '';
          animation: dots 1.2s steps(3, end) infinite;
        }
        @keyframes dots {
          0%   { content: ''; }
          33%  { content: '.'; }
          66%  { content: '..'; }
          100% { content: '...'; }
        }

        /* ── Error state ── */
        .tpi-error {
          background: rgba(220,38,38,0.07);
          border: 1px solid rgba(220,38,38,0.25);
          border-radius: 10px;
          padding: 0.875rem 1rem;
          display: flex;
          align-items: flex-start;
          gap: 0.625rem;
        }
        .tpi-error-text {
          font-size: 0.82rem;
          color: var(--text);
          line-height: 1.5;
          font-family: 'Inter', sans-serif;
        }
        .tpi-error-retry {
          background: none;
          border: 1px solid rgba(220,38,38,0.4);
          border-radius: 7px;
          color: var(--crimson);
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.78rem;
          font-weight: 600;
          padding: 0.4rem 0.8rem;
          cursor: pointer;
          margin-top: 0.5rem;
          display: flex;
          align-items: center;
          gap: 5px;
          transition: background 0.15s;
        }
        .tpi-error-retry:hover { background: rgba(220,38,38,0.1); }

        /* ── Preview cards ── */
        .tpi-preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .tpi-preview-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .tpi-preview-count {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.65rem;
          color: var(--purple);
        }
        .tpi-preview-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .tpi-preview-card {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 10px;
          padding: 0.875rem 1rem;
          animation: tpi-card-in 0.25s ease both;
        }
        @keyframes tpi-card-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        .tpi-preview-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 6px;
        }
        .tpi-preview-title-row {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
          flex: 1;
          min-width: 0;
        }
        .tpi-preview-index {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.6rem;
          color: var(--text-muted);
          flex-shrink: 0;
          opacity: 0.5;
        }
        .tpi-preview-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text);
          line-height: 1.3;
        }
        .tpi-badge {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.55rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 2px 7px;
          border-radius: 100px;
          flex-shrink: 0;
        }
        .tpi-badge-deadline {
          background: rgba(220,38,38,0.12);
          border: 1px solid rgba(220,38,38,0.3);
          color: var(--crimson);
        }
        .tpi-badge-flexible {
          background: rgba(124,58,237,0.1);
          border: 1px solid rgba(124,58,237,0.25);
          color: var(--purple);
        }
        .tpi-remove-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 2px;
          border-radius: 5px;
          display: flex;
          align-items: center;
          transition: color 0.15s;
          flex-shrink: 0;
        }
        .tpi-remove-btn:hover { color: var(--crimson); }
        .tpi-preview-desc {
          font-size: 0.78rem;
          color: var(--text-muted);
          line-height: 1.5;
          font-family: 'Inter', sans-serif;
          margin-bottom: 8px;
        }
        .tpi-preview-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .tpi-meta-chip {
          display: flex;
          align-items: center;
          gap: 4px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.6rem;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          background: var(--surface2);
          border-radius: 6px;
          padding: 3px 8px;
        }
        .tpi-chip-deadline {
          color: var(--crimson);
          background: rgba(220,38,38,0.08);
        }

        /* ── Confirm row ── */
        .tpi-confirm-row {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
          padding: 0.75rem 1.25rem 1rem;
          border-top: 1px solid var(--glass-border);
          background: var(--surface);
        }
        .tpi-redo-btn {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 10px;
          padding: 0.75rem 1rem;
          color: var(--text-muted);
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .tpi-redo-btn:hover { color: var(--text); border-color: rgba(255,255,255,0.15); }
        .tpi-confirm-btn {
          flex: 1;
          background: var(--purple);
          border: none;
          border-radius: 10px;
          padding: 0.75rem;
          color: #fff;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          transition: all 0.15s;
          letter-spacing: 0.01em;
        }
        .tpi-confirm-btn:hover { background: #6d28d9; }
        .tpi-confirm-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        /* ── Saved flash ── */
        .tpi-saved {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 2rem 0;
          animation: tpi-saved-in 0.3s ease;
        }
        @keyframes tpi-saved-in {
          from { opacity: 0; transform: scale(0.9); }
          to   { opacity: 1; transform: scale(1);   }
        }
        .tpi-saved-icon {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(124,58,237,0.15);
          border: 1px solid rgba(124,58,237,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .tpi-saved-label {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text);
        }
        .tpi-saved-sub {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.65rem;
          color: var(--text-muted);
          letter-spacing: 0.08em;
        }

        /* ── Hint row ── */
        .tpi-hint-row {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          font-size: 0.75rem;
          color: var(--text-muted);
          font-family: 'Inter', sans-serif;
          line-height: 1.5;
          opacity: 0.7;
        }
      `}</style>

      <div className="tpi-overlay" onClick={phase !== "loading" ? onClose : undefined}>
        <div className="tpi-sheet" onClick={(e) => e.stopPropagation()}>
          {/* Handle */}
          <div className="tpi-handle" />

          {/* Header */}
          <div className="tpi-header">
            <div className="tpi-header-left">
              <span className="tpi-header-eyebrow">AI Scheduler</span>
              <span className="tpi-header-title">
                {phase === "preview"
                  ? `${pendingTasks.length} task${pendingTasks.length !== 1 ? "s" : ""} scheduled`
                  : phase === "saved"
                  ? "Schedule saved"
                  : "What needs to get done?"}
              </span>
            </div>
            <button
              className="tpi-close-btn"
              onClick={onClose}
              disabled={phase === "loading"}
              aria-label="Close"
            >
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <div className="tpi-body">
            {/* ── Input phase ── */}
            {(phase === "idle" || phase === "error") && (
              <>
                <div className="tpi-input-wrapper">
                  <textarea
                    ref={textareaRef}
                    className="tpi-textarea"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={EXAMPLE_INPUTS[exampleIdx]}
                    maxLength={800}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleSchedule();
                      }
                    }}
                  />
                  <div className="tpi-textarea-toolbar">
                    <span className="tpi-char-count">{input.length}/800</span>
                    <div className="tpi-toolbar-right">
                      {voiceSupported && (
                        <button
                          className={`tpi-voice-btn ${isListening ? "recording" : ""}`}
                          onClick={toggleVoice}
                          title={isListening ? "Stop listening" : "Dictate tasks"}
                          aria-label={isListening ? "Stop voice input" : "Start voice input"}
                        >
                          {isListening ? <MicOff size={13} /> : <Mic size={13} />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Hint */}
                <div className="tpi-hint-row">
                  <Sparkles size={13} style={{ color: "var(--purple)", marginTop: 1, flexShrink: 0 }} />
                  Describe your tasks in plain English — deadlines, durations, flexibility. Cocoon will
                  schedule everything intelligently across your week.
                </div>

                {/* Error */}
                {phase === "error" && (
                  <div className="tpi-error">
                    <AlertCircle size={15} style={{ color: "var(--crimson)", flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div className="tpi-error-text">{errorMsg}</div>
                      <button className="tpi-error-retry" onClick={handleSchedule}>
                        <RotateCcw size={12} />
                        Try again
                      </button>
                    </div>
                  </div>
                )}

                <button
                  className="tpi-schedule-btn"
                  onClick={handleSchedule}
                  disabled={!input.trim()}
                >
                  <Sparkles size={15} />
                  Schedule with AI
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "0.65rem",
                      opacity: 0.65,
                      marginLeft: 4,
                    }}
                  >
                    ⌘↵
                  </span>
                </button>
              </>
            )}

            {/* ── Loading phase ── */}
            {phase === "loading" && (
              <div className="tpi-loading">
                <div className="tpi-loading-spinner" />
                <span className="tpi-loading-label">
                  Scheduling<span className="tpi-loading-dots" />
                </span>
              </div>
            )}

            {/* ── Preview phase ── */}
            {phase === "preview" && (
              <>
                <div className="tpi-preview-header">
                  <span className="tpi-preview-label">Review your schedule</span>
                  <span className="tpi-preview-count">
                    {pendingTasks.length} task{pendingTasks.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="tpi-preview-list">
                  {pendingTasks.map((task, i) => (
                    <TaskPreviewCard
                      key={task.id}
                      task={task}
                      index={i}
                      onRemove={removeTask}
                    />
                  ))}
                </div>
              </>
            )}

            {/* ── Saved phase ── */}
            {phase === "saved" && (
              <div className="tpi-saved">
                <div className="tpi-saved-icon">
                  <CheckCircle2 size={22} style={{ color: "var(--purple)" }} />
                </div>
                <span className="tpi-saved-label">
                  {pendingTasks.length} task{pendingTasks.length !== 1 ? "s" : ""} added to your schedule
                </span>
                <span className="tpi-saved-sub">Closing…</span>
              </div>
            )}
          </div>

          {/* Confirm row — only shown in preview */}
          {phase === "preview" && (
            <div className="tpi-confirm-row">
              <button className="tpi-redo-btn" onClick={handleRedo}>
                <RotateCcw size={13} />
                Re-prompt
              </button>
              <button
                className="tpi-confirm-btn"
                onClick={handleConfirm}
                disabled={pendingTasks.length === 0}
              >
                <CheckCircle2 size={15} />
                Add to schedule
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
