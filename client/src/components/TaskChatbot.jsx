import { useState, useEffect, useRef, useCallback } from "react";
import { countdown, fmtTime, fmtDuration } from "../lib/dates";
import { apiUrl } from "../lib/api";
import {
  X,
  Send,
  Mic,
  MicOff,
  Clock,
  AlertCircle,
  ChevronRight,
  RotateCcw,
  Zap,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

// Starter prompts shown when chat is empty — one is picked at random per task
const STARTER_PROMPTS = [
  "I don't know where to start",
  "Give me a tight 3-part outline",
  "What's the single first step?",
  "I keep getting distracted — help",
  "Pretend I have 20 minutes right now",
];

// ─── Typewriter hook — streams characters into display string ─────────────────

function useTypewriter(target, speed = 18) {
  const [displayed, setDisplayed] = useState("");
  const prevTarget = useRef("");

  useEffect(() => {
    // Only typewrite new content appended at the end
    if (!target.startsWith(prevTarget.current)) {
      // Full reset (e.g. error replacement)
      setDisplayed(target);
      prevTarget.current = target;
      return;
    }
    const newChars = target.slice(prevTarget.current.length);
    if (!newChars) return;

    let i = 0;
    const id = setInterval(() => {
      setDisplayed((d) => d + newChars[i]);
      i++;
      if (i >= newChars.length) {
        clearInterval(id);
        prevTarget.current = target;
      }
    }, speed);
    return () => clearInterval(id);
  }, [target, speed]);

  return displayed;
}

// ─── Single message bubble ────────────────────────────────────────────────────

function MessageBubble({ message, isLatestAssistant }) {
  const isUser = message.role === "user";
  const displayed = useTypewriter(
    isLatestAssistant ? message.content : message.content,
    isLatestAssistant ? 16 : 0   // only typewrite the latest assistant msg
  );

  return (
    <div className={`tcb-bubble-row ${isUser ? "tcb-bubble-row-user" : "tcb-bubble-row-ai"}`}>
      {!isUser && (
        <div className="tcb-ai-avatar">
          <Zap size={11} strokeWidth={2.5} style={{ color: "var(--purple)" }} />
        </div>
      )}
      <div className={`tcb-bubble ${isUser ? "tcb-bubble-user" : "tcb-bubble-ai"}`}>
        <span className="tcb-bubble-text">
          {isLatestAssistant ? displayed : message.content}
        </span>
        {isLatestAssistant && displayed.length < message.content.length && (
          <span className="tcb-cursor">▋</span>
        )}
      </div>
    </div>
  );
}

// ─── Task context header strip ────────────────────────────────────────────────

function TaskContextHeader({ task }) {
  const [cd, setCd] = useState(task?.deadline ? countdown(task.deadline) : null);

  useEffect(() => {
    if (!task?.deadline) return;
    const id = setInterval(() => setCd(countdown(task.deadline)), 10000);
    return () => clearInterval(id);
  }, [task]);

  if (!task) return null;
  const isOverdue = cd === "Overdue";

  return (
    <div className="tcb-context-header">
      <div className="tcb-context-main">
        <span className="tcb-context-label">Executing</span>
        <span className="tcb-context-title">{task.title}</span>
      </div>
      <div className="tcb-context-meta">
        {task.estimatedDurationMins && (
          <span className="tcb-meta-chip">
            <Clock size={10} />
            {fmtDuration(task.estimatedDurationMins)}
          </span>
        )}
        {cd && (
          <span className={`tcb-meta-chip ${isOverdue ? "tcb-chip-overdue" : ""}`}>
            <AlertCircle size={10} />
            {isOverdue ? "Overdue" : `${cd} left`}
          </span>
        )}
        {task.scheduledStart && (
          <span className="tcb-meta-chip">
            {fmtTime(task.scheduledStart)}
            {task.scheduledEnd ? ` — ${fmtTime(task.scheduledEnd)}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main TaskChatbot component ───────────────────────────────────────────────

export default function TaskChatbot({ task, isOpen, onClose }) {
  const [messages, setMessages] = useState([]);   // {role, content}[]
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const prevTaskId = useRef(null);

  // Check voice support
  useEffect(() => {
    setVoiceSupported(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  // Reset conversation when task changes
  useEffect(() => {
    if (task?.id && task.id !== prevTaskId.current) {
      setMessages([]);
      setInput("");
      setError("");
      prevTaskId.current = task.id;
    }
  }, [task?.id]);

  // Focus input and send opening prompt when opened
  useEffect(() => {
    if (isOpen && task) {
      setTimeout(() => inputRef.current?.focus(), 120);
      // Auto-send an opener if chat is empty
      if (messages.length === 0) {
        sendMessage("I need to work on this. Where do I start?", true);
      }
    }
  }, [isOpen, task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop voice on close
  useEffect(() => {
    if (!isOpen) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }
  }, [isOpen]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Escape to close
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && !loading) onClose();
    }
    if (isOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, loading, onClose]);

  // ── Send message ──
  const sendMessage = useCallback(async (overrideText, isAuto = false) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading || !task) return;

    const userMsg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];

    setMessages(newMessages);
    if (!isAuto) setInput("");
    setLoading(true);
    setError("");

    try {
      const res = await fetch(apiUrl("/api/task-chatbot"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskTitle: task.title,
          taskDescription: task.description ?? "",
          deadlineISO: task.deadline ?? null,
          conversationHistory: newMessages,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      if (!data.message) throw new Error("Empty response from server.");

      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [input, messages, loading, task]);

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
      const t = e.results[0][0].transcript;
      setInput((prev) => prev ? `${prev} ${t}` : t);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  }

  // ── Clear chat ──
  function handleClear() {
    setMessages([]);
    setError("");
    setInput("");
    setTimeout(() => sendMessage("I need to work on this. Where do I start?", true), 100);
  }

  if (!isOpen || !task) return null;

  const lastAssistantIdx = [...messages].map((m, i) => m.role === "assistant" ? i : -1).filter(i => i >= 0).at(-1) ?? -1;

  return (
    <>
      <style>{`
        /* ── Backdrop ── */
        .tcb-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          z-index: 170;
          animation: tcb-backdrop-in 0.22s ease;
        }
        @keyframes tcb-backdrop-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* ── Slide-in panel ── */
        .tcb-panel {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: min(480px, 100vw);
          background: var(--surface);
          border-left: 1px solid var(--glass-border);
          z-index: 171;
          display: flex;
          flex-direction: column;
          animation: tcb-slide-in 0.3s cubic-bezier(0.32, 0.72, 0, 1);
          overflow: hidden;
        }
        @keyframes tcb-slide-in {
          from { transform: translateX(100%); opacity: 0.7; }
          to   { transform: translateX(0);    opacity: 1;   }
        }

        /* ── Top bar ── */
        .tcb-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.875rem 1rem;
          border-bottom: 1px solid var(--glass-border);
          flex-shrink: 0;
          gap: 0.75rem;
        }
        .tcb-topbar-left {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .tcb-topbar-eyebrow {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.6rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--purple);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .tcb-topbar-divider {
          width: 1px;
          height: 14px;
          background: var(--glass-border);
          flex-shrink: 0;
        }
        .tcb-topbar-task-name {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .tcb-topbar-right {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .tcb-icon-btn {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 7px;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--text-muted);
          transition: all 0.14s;
        }
        .tcb-icon-btn:hover { color: var(--text); background: var(--surface2); border-color: rgba(255,255,255,0.12); }
        .tcb-close-btn { /* inherits tcb-icon-btn */ }

        /* ── Context header ── */
        .tcb-context-header {
          padding: 0.75rem 1rem;
          background: rgba(124,58,237,0.05);
          border-bottom: 1px solid rgba(124,58,237,0.12);
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .tcb-context-main {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .tcb-context-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.55rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--purple);
          opacity: 0.8;
        }
        .tcb-context-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--text);
          line-height: 1.25;
        }
        .tcb-context-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }
        .tcb-meta-chip {
          display: flex;
          align-items: center;
          gap: 4px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.58rem;
          letter-spacing: 0.04em;
          color: var(--text-muted);
          background: var(--surface2);
          border-radius: 5px;
          padding: 3px 7px;
        }
        .tcb-chip-overdue {
          color: var(--crimson);
          background: rgba(220,38,38,0.1);
        }

        /* ── Messages scroll area ── */
        .tcb-messages {
          flex: 1;
          overflow-y: auto;
          padding: 1rem 1rem 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.875rem;
        }

        /* ── Bubble rows ── */
        .tcb-bubble-row {
          display: flex;
          align-items: flex-end;
          gap: 7px;
        }
        .tcb-bubble-row-user { justify-content: flex-end; }
        .tcb-bubble-row-ai  { justify-content: flex-start; }

        .tcb-ai-avatar {
          width: 24px;
          height: 24px;
          border-radius: 7px;
          background: rgba(124,58,237,0.12);
          border: 1px solid rgba(124,58,237,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-bottom: 2px;
        }

        .tcb-bubble {
          max-width: 85%;
          border-radius: 14px;
          padding: 0.65rem 0.875rem;
          line-height: 1.6;
          font-size: 0.855rem;
          font-family: 'Inter', sans-serif;
          animation: tcb-bubble-in 0.2s ease;
          position: relative;
        }
        @keyframes tcb-bubble-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .tcb-bubble-user {
          background: var(--purple);
          color: #fff;
          border-bottom-right-radius: 4px;
        }
        .tcb-bubble-ai {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          color: var(--text);
          border-bottom-left-radius: 4px;
          white-space: pre-wrap;
        }
        .tcb-bubble-text { display: inline; }
        .tcb-cursor {
          display: inline-block;
          animation: tcb-blink 0.7s step-end infinite;
          color: var(--purple);
          font-size: 0.9em;
          margin-left: 1px;
        }
        @keyframes tcb-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }

        /* ── Loading indicator ── */
        .tcb-loading-row {
          display: flex;
          align-items: flex-end;
          gap: 7px;
        }
        .tcb-loading-bubble {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 14px;
          border-bottom-left-radius: 4px;
          padding: 0.65rem 0.875rem;
          display: flex;
          gap: 4px;
          align-items: center;
        }
        .tcb-loading-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--purple);
          opacity: 0.4;
          animation: tcb-dot-bounce 1.2s ease-in-out infinite;
        }
        .tcb-loading-dot:nth-child(1) { animation-delay: 0s; }
        .tcb-loading-dot:nth-child(2) { animation-delay: 0.18s; }
        .tcb-loading-dot:nth-child(3) { animation-delay: 0.36s; }
        @keyframes tcb-dot-bounce {
          0%, 100% { opacity: 0.3; transform: translateY(0); }
          50%       { opacity: 1;   transform: translateY(-4px); }
        }

        /* ── Error banner ── */
        .tcb-error-banner {
          margin: 0 1rem;
          padding: 0.6rem 0.875rem;
          background: rgba(220,38,38,0.07);
          border: 1px solid rgba(220,38,38,0.2);
          border-radius: 8px;
          font-family: 'Inter', sans-serif;
          font-size: 0.78rem;
          color: var(--crimson);
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        /* ── Starter prompts ── */
        .tcb-starters {
          padding: 0 1rem 0.5rem;
          flex-shrink: 0;
        }
        .tcb-starters-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.58rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 6px;
          opacity: 0.6;
          display: block;
        }
        .tcb-starters-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }
        .tcb-starter-chip {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 100px;
          padding: 4px 11px;
          font-size: 0.75rem;
          color: var(--text-muted);
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          transition: all 0.14s;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .tcb-starter-chip:hover {
          color: var(--text);
          border-color: rgba(124,58,237,0.35);
          background: rgba(124,58,237,0.07);
        }

        /* ── Input bar ── */
        .tcb-input-bar {
          display: flex;
          align-items: flex-end;
          gap: 6px;
          padding: 0.75rem 1rem 1rem;
          border-top: 1px solid var(--glass-border);
          flex-shrink: 0;
          background: var(--surface);
        }
        .tcb-input-wrapper {
          flex: 1;
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 12px;
          display: flex;
          align-items: flex-end;
          padding: 0.5rem 0.625rem;
          gap: 6px;
          transition: border-color 0.2s;
          min-height: 42px;
        }
        .tcb-input-wrapper:focus-within {
          border-color: rgba(124,58,237,0.4);
        }
        .tcb-textarea {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          resize: none;
          font-family: 'Inter', sans-serif;
          font-size: 0.875rem;
          color: var(--text);
          line-height: 1.5;
          min-height: 24px;
          max-height: 120px;
          overflow-y: auto;
          padding: 0;
        }
        .tcb-textarea::placeholder { color: var(--text-muted); opacity: 0.5; }
        .tcb-voice-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 2px;
          border-radius: 5px;
          display: flex;
          align-items: center;
          transition: color 0.14s;
          flex-shrink: 0;
          margin-bottom: 1px;
        }
        .tcb-voice-btn:hover { color: var(--text); }
        .tcb-voice-btn.recording {
          color: var(--crimson);
          animation: tcb-mic-pulse 1s ease-in-out infinite;
        }
        @keyframes tcb-mic-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
        .tcb-send-btn {
          background: var(--purple);
          border: none;
          border-radius: 10px;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #fff;
          flex-shrink: 0;
          transition: all 0.14s;
        }
        .tcb-send-btn:hover:not(:disabled) {
          background: #6d28d9;
          transform: scale(1.05);
        }
        .tcb-send-btn:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }

        /* ── Empty state (shown briefly before auto-opener) ── */
        .tcb-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          opacity: 0.5;
          padding-bottom: 2rem;
        }
        .tcb-empty-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(124,58,237,0.08);
          border: 1px solid rgba(124,58,237,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .tcb-empty-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          color: var(--text-muted);
          text-transform: uppercase;
        }

        @media (max-width: 480px) {
          .tcb-panel { width: 100vw; border-left: none; border-top: 1px solid var(--glass-border); border-radius: 16px 16px 0 0; }
          .tcb-backdrop { background: rgba(0,0,0,0.65); }
        }
      `}</style>

      {/* Backdrop */}
      <div className="tcb-backdrop" onClick={!loading ? onClose : undefined} />

      {/* Panel */}
      <div className="tcb-panel" role="dialog" aria-label={`Task assistant: ${task.title}`}>

        {/* Top bar */}
        <div className="tcb-topbar">
          <div className="tcb-topbar-left">
            <span className="tcb-topbar-eyebrow">Assistant</span>
            <div className="tcb-topbar-divider" />
            <span className="tcb-topbar-task-name">{task.title}</span>
          </div>
          <div className="tcb-topbar-right">
            <button
              className="tcb-icon-btn"
              onClick={handleClear}
              title="Reset chat"
              aria-label="Reset conversation"
            >
              <RotateCcw size={13} />
            </button>
            <button
              className="tcb-icon-btn tcb-close-btn"
              onClick={onClose}
              title="Close (Esc)"
              aria-label="Close panel"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Context header */}
        <TaskContextHeader task={task} />

        {/* Messages */}
        <div className="tcb-messages">
          {messages.length === 0 && !loading && (
            <div className="tcb-empty">
              <div className="tcb-empty-icon">
                <Zap size={16} style={{ color: "var(--purple)" }} strokeWidth={1.8} />
              </div>
              <span className="tcb-empty-label">Starting up…</span>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble
              key={i}
              message={msg}
              isLatestAssistant={msg.role === "assistant" && i === lastAssistantIdx && !loading}
            />
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="tcb-loading-row">
              <div className="tcb-ai-avatar">
                <Zap size={11} strokeWidth={2.5} style={{ color: "var(--purple)" }} />
              </div>
              <div className="tcb-loading-bubble">
                <div className="tcb-loading-dot" />
                <div className="tcb-loading-dot" />
                <div className="tcb-loading-dot" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error banner */}
        {error && (
          <div className="tcb-error-banner">
            <AlertCircle size={13} />
            {error}
          </div>
        )}

        {/* Starter prompts — shown only when ≤1 AI message and not loading */}
        {messages.filter((m) => m.role === "assistant").length <= 1 && !loading && (
          <div className="tcb-starters">
            <span className="tcb-starters-label">Quick prompts</span>
            <div className="tcb-starters-grid">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  className="tcb-starter-chip"
                  onClick={() => sendMessage(p)}
                  disabled={loading}
                >
                  <ChevronRight size={11} />
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input bar */}
        <div className="tcb-input-bar">
          <div className="tcb-input-wrapper">
            <textarea
              ref={inputRef}
              className="tcb-textarea"
              placeholder="Ask for help, a step, an outline…"
              value={input}
              rows={1}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-grow textarea
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={loading}
            />
            {voiceSupported && (
              <button
                className={`tcb-voice-btn ${isListening ? "recording" : ""}`}
                onClick={toggleVoice}
                title={isListening ? "Stop" : "Dictate"}
                aria-label={isListening ? "Stop voice" : "Start voice"}
                disabled={loading}
              >
                {isListening ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
            )}
          </div>
          <button
            className="tcb-send-btn"
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            aria-label="Send"
          >
            <Send size={15} strokeWidth={2} />
          </button>
        </div>
      </div>
    </>
  );
}
