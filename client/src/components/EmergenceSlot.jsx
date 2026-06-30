import { useState, useEffect, useRef, useCallback } from "react";
import { loadTasks } from "../lib/storage";
import { apiUrl } from "../lib/api";
import {
  X,
  Sparkles,
  Moon,
  BookOpen,
  Zap,
  Dumbbell,
  Play,
  Check,
  RotateCcw,
  Timer,
  ChevronRight,
  Loader,
} from "lucide-react";

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG = {
  rest: {
    icon: Moon,
    label: "Rest",
    color: "#6366f1",         // indigo
    bg: "rgba(99,102,241,0.10)",
    border: "rgba(99,102,241,0.25)",
    glow: "rgba(99,102,241,0.15)",
  },
  learn: {
    icon: BookOpen,
    label: "Learn",
    color: "#7C3AED",
    bg: "rgba(124,58,237,0.10)",
    border: "rgba(124,58,237,0.25)",
    glow: "rgba(124,58,237,0.15)",
  },
  create: {
    icon: Zap,
    label: "Create",
    color: "#f59e0b",         // amber
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.22)",
    glow: "rgba(245,158,11,0.12)",
  },
  physical: {
    icon: Dumbbell,
    label: "Physical",
    color: "#10b981",         // emerald
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.22)",
    glow: "rgba(16,185,129,0.12)",
  },
};

// ─── Timer hook ───────────────────────────────────────────────────────────────

function useActivityTimer(durationMins, running) {
  const totalSecs = durationMins * 60;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed((e) => Math.min(e + 1, totalSecs)), 1000);
    return () => clearInterval(id);
  }, [running, totalSecs]);

  const remaining = totalSecs - elapsed;
  const percent = totalSecs > 0 ? (elapsed / totalSecs) * 100 : 0;

  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  const display = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  return { elapsed, remaining, percent, display, done: remaining <= 0 };
}

// ─── Activity card ────────────────────────────────────────────────────────────

function ActivityCard({ activity, index, selected, onSelect, disabled }) {
  const cfg = CATEGORY_CONFIG[activity.category] || CATEGORY_CONFIG.learn;
  const Icon = cfg.icon;

  return (
    <button
      className={`es-card ${selected ? "es-card-selected" : ""} ${disabled && !selected ? "es-card-disabled" : ""}`}
      style={{
        "--card-color": cfg.color,
        "--card-bg": selected ? cfg.bg : "var(--glass-bg)",
        "--card-border": selected ? cfg.color : "var(--glass-border)",
        "--card-glow": cfg.glow,
        animationDelay: `${index * 80}ms`,
      }}
      onClick={() => !disabled && onSelect(activity)}
      aria-pressed={selected}
    >
      {/* Index + category badge */}
      <div className="es-card-top">
        <div
          className="es-card-icon"
          style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
        >
          <Icon size={18} style={{ color: cfg.color }} strokeWidth={1.8} />
        </div>
        <div className="es-card-badges">
          <span className="es-category-badge" style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
            {cfg.label}
          </span>
          <span className="es-duration-badge">
            <Timer size={10} />
            {activity.durationMins}m
          </span>
        </div>
        {selected && (
          <div className="es-card-check">
            <Check size={13} strokeWidth={2.5} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="es-card-title">{activity.title}</div>
      <div className="es-card-desc">{activity.description}</div>
    </button>
  );
}

// ─── Active timer view ────────────────────────────────────────────────────────

function ActivityTimer({ activity, onComplete, onCancel }) {
  const cfg = CATEGORY_CONFIG[activity.category] || CATEGORY_CONFIG.learn;
  const Icon = cfg.icon;
  const { percent, display, done } = useActivityTimer(activity.durationMins, true);

  // Auto-complete when timer reaches 0
  useEffect(() => {
    if (done) {
      const id = setTimeout(() => onComplete(), 1200);
      return () => clearTimeout(id);
    }
  }, [done, onComplete]);

  // Arc path for SVG circular progress
  const R = 54;
  const CIRC = 2 * Math.PI * R;
  const dashOffset = CIRC * (1 - percent / 100);

  return (
    <div className="es-timer-root">
      {/* SVG arc */}
      <div className="es-arc-wrapper">
        <svg width="140" height="140" viewBox="0 0 140 140">
          {/* Track */}
          <circle
            cx="70" cy="70" r={R}
            fill="none"
            stroke="var(--surface2)"
            strokeWidth="6"
          />
          {/* Fill */}
          <circle
            cx="70" cy="70" r={R}
            fill="none"
            stroke={cfg.color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 70 70)"
            style={{ transition: "stroke-dashoffset 1s linear", filter: `drop-shadow(0 0 6px ${cfg.color}66)` }}
          />
        </svg>
        {/* Center content */}
        <div className="es-arc-center">
          <Icon size={20} style={{ color: cfg.color, marginBottom: 4 }} strokeWidth={1.8} />
          <span
            className="es-arc-time"
            style={{ color: done ? cfg.color : "var(--text)", fontFamily: "'JetBrains Mono', monospace" }}
          >
            {done ? "Done!" : display}
          </span>
        </div>
      </div>

      <div className="es-timer-title">{activity.title}</div>
      <div className="es-timer-category" style={{ color: cfg.color }}>
        {cfg.label} · {activity.durationMins}m
      </div>

      <div className="es-timer-progress-bar">
        <div
          className="es-timer-progress-fill"
          style={{ width: `${percent}%`, background: cfg.color }}
        />
      </div>

      <div className="es-timer-actions">
        <button className="es-timer-complete-btn" onClick={onComplete} style={{ background: cfg.color }}>
          <Check size={15} strokeWidth={2.5} />
          Mark Complete
        </button>
        <button className="es-timer-cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main EmergenceSlot component ─────────────────────────────────────────────

export default function EmergenceSlot({ user, isOpen, onClose }) {
  const [phase, setPhase] = useState("idle"); // idle | loading | ready | running | done | error
  const [activities, setActivities] = useState([]);
  const [selected, setSelected] = useState(null);
  const [activeActivity, setActiveActivity] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [freeMinutes, setFreeMinutes] = useState(45);

  // Detect free minutes from tasks
  useEffect(() => {
    if (!isOpen) return;
    const tasks = loadTasks();
    const now = new Date();

    // Find next scheduled task to estimate gap
    const upcoming = tasks
      .filter((t) => t.scheduledStart && new Date(t.scheduledStart) > now && t.status === "pending")
      .sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));

    if (upcoming.length > 0) {
      const mins = Math.round((new Date(upcoming[0].scheduledStart) - now) / 60000);
      setFreeMinutes(Math.max(15, Math.min(mins, 120)));
    } else {
      setFreeMinutes(60);
    }
  }, [isOpen]);

  // Reset when closed
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setPhase("idle");
        setActivities([]);
        setSelected(null);
        setActiveActivity(null);
        setErrorMsg("");
      }, 300);
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && phase !== "running" && phase !== "loading") onClose();
    }
    if (isOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, phase, onClose]);

  // Fetch activities from /api/emergence-slots
  const fetchActivities = useCallback(async () => {
    setPhase("loading");
    setErrorMsg("");
    setSelected(null);

    const tasks = loadTasks();
    const now = new Date();
    const upcomingTasks = tasks
      .filter((t) => t.status === "pending" && t.scheduledStart && new Date(t.scheduledStart) > now)
      .slice(0, 5);

    // Approximate sleep deficit: placeholder until sleep module is built
    const sleepDeficitMins = 0;

    try {
      const res = await fetch(apiUrl("/api/emergence-slots"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userProfile: user,
          freeMinutes,
          sleepDeficitMins,
          upcomingTasks,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      if (!Array.isArray(data.activities) || data.activities.length === 0) {
        throw new Error("No activities returned. Try again.");
      }

      setActivities(data.activities);
      setPhase("ready");
    } catch (err) {
      setErrorMsg(err.message);
      setPhase("error");
    }
  }, [user, freeMinutes]);

  // Auto-fetch when opened
  useEffect(() => {
    if (isOpen && phase === "idle") {
      fetchActivities();
    }
  }, [isOpen, phase, fetchActivities]);

  function handleSelect(activity) {
    setSelected(activity);
  }

  function handleStart() {
    if (!selected) return;
    setActiveActivity(selected);
    setPhase("running");
  }

  function handleComplete() {
    setPhase("done");
    setTimeout(() => onClose(), 2000);
  }

  function handleCancelTimer() {
    setActiveActivity(null);
    setPhase("ready");
  }

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        /* ── Overlay ── */
        .es-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.78);
          backdrop-filter: blur(6px);
          z-index: 160;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          animation: es-overlay-in 0.22s ease;
        }
        @keyframes es-overlay-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* ── Modal ── */
        .es-modal {
          width: 100%;
          max-width: 520px;
          max-height: 90vh;
          background: var(--surface);
          border: 1px solid var(--glass-border);
          border-radius: 20px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: es-modal-in 0.3s cubic-bezier(0.32,0.72,0,1);
        }
        @keyframes es-modal-in {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* ── Header ── */
        .es-header {
          padding: 1.25rem 1.25rem 1rem;
          border-bottom: 1px solid var(--glass-border);
          flex-shrink: 0;
          position: relative;
        }
        .es-header-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
        }
        .es-header-left {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .es-eyebrow {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.6rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--purple);
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .es-eyebrow-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--purple);
          animation: es-dot-pulse 2s ease-in-out infinite;
        }
        @keyframes es-dot-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.7); }
        }
        .es-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--text);
        }
        .es-subtitle {
          font-size: 0.78rem;
          color: var(--text-muted);
          font-family: 'Inter', sans-serif;
          margin-top: 2px;
        }
        .es-close-btn {
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
          flex-shrink: 0;
          transition: all 0.15s;
        }
        .es-close-btn:hover { color: var(--text); background: var(--surface2); }

        /* Free slot duration row */
        .es-duration-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 0.875rem;
        }
        .es-duration-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.62rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-muted);
          white-space: nowrap;
        }
        .es-duration-chips {
          display: flex;
          gap: 5px;
          flex-wrap: wrap;
        }
        .es-duration-chip {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.65rem;
          padding: 3px 10px;
          border-radius: 100px;
          border: 1px solid var(--glass-border);
          background: var(--glass-bg);
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.12s;
        }
        .es-duration-chip:hover { color: var(--text); border-color: rgba(124,58,237,0.4); }
        .es-duration-chip.active {
          background: rgba(124,58,237,0.15);
          border-color: var(--purple);
          color: var(--text);
        }

        /* ── Scrollable body ── */
        .es-body {
          flex: 1;
          overflow-y: auto;
          padding: 1.1rem 1.25rem 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.875rem;
        }

        /* ── Loading ── */
        .es-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          min-height: 220px;
        }
        .es-loading-orb {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(124,58,237,0.3), transparent);
          border: 1px solid rgba(124,58,237,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: es-orb-pulse 1.8s ease-in-out infinite;
        }
        @keyframes es-orb-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(124,58,237,0.2); }
          50%       { transform: scale(1.08); box-shadow: 0 0 0 12px rgba(124,58,237,0); }
        }
        .es-loading-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.7rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .es-loading-dots::after {
          content: '';
          animation: es-dots 1.4s steps(3, end) infinite;
        }
        @keyframes es-dots {
          0%  { content: ''; }
          33% { content: '.'; }
          66% { content: '..'; }
          100%{ content: '...'; }
        }

        /* ── Error ── */
        .es-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          padding: 2rem 0;
          text-align: center;
        }
        .es-error-text {
          font-size: 0.82rem;
          color: var(--text-muted);
          font-family: 'Inter', sans-serif;
          line-height: 1.6;
          max-width: 300px;
        }
        .es-retry-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 8px;
          padding: 0.55rem 1rem;
          color: var(--text-muted);
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .es-retry-btn:hover { color: var(--text); border-color: rgba(255,255,255,0.15); }

        /* ── Activity cards ── */
        .es-card {
          width: 100%;
          text-align: left;
          background: var(--card-bg, var(--glass-bg));
          border: 1px solid var(--card-border, var(--glass-border));
          border-radius: 14px;
          padding: 1rem 1rem 0.875rem;
          cursor: pointer;
          transition: border-color 0.18s, background 0.18s, transform 0.15s, box-shadow 0.18s;
          animation: es-card-in 0.3s ease both;
          position: relative;
          overflow: hidden;
        }
        @keyframes es-card-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .es-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--card-color, transparent), transparent);
          opacity: 0;
          transition: opacity 0.2s;
        }
        .es-card:hover:not(.es-card-disabled) {
          border-color: var(--card-color);
          transform: translateY(-2px);
          box-shadow: 0 8px 28px var(--card-glow, transparent);
        }
        .es-card:hover:not(.es-card-disabled)::before { opacity: 0.6; }
        .es-card-selected {
          border-color: var(--card-color) !important;
          box-shadow: 0 0 0 1px var(--card-color), 0 8px 28px var(--card-glow, transparent) !important;
          transform: translateY(-2px) !important;
        }
        .es-card-selected::before { opacity: 1 !important; }
        .es-card-disabled { opacity: 0.35; cursor: not-allowed; filter: grayscale(0.5); }

        .es-card-top {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 0.625rem;
        }
        .es-card-icon {
          width: 34px;
          height: 34px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .es-card-badges {
          display: flex;
          align-items: center;
          gap: 5px;
          flex: 1;
        }
        .es-category-badge {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.55rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 2px 8px;
          border-radius: 100px;
        }
        .es-duration-badge {
          display: flex;
          align-items: center;
          gap: 3px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.58rem;
          color: var(--text-muted);
          background: var(--surface2);
          border-radius: 6px;
          padding: 2px 7px;
        }
        .es-card-check {
          margin-left: auto;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--card-color);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          flex-shrink: 0;
          animation: check-pop 0.2s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes check-pop {
          from { transform: scale(0); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }

        .es-card-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 4px;
          line-height: 1.3;
        }
        .es-card-desc {
          font-size: 0.78rem;
          color: var(--text-muted);
          line-height: 1.55;
          font-family: 'Inter', sans-serif;
        }

        /* ── Start footer ── */
        .es-start-footer {
          padding: 0.875rem 1.25rem 1rem;
          border-top: 1px solid var(--glass-border);
          flex-shrink: 0;
          display: flex;
          gap: 8px;
          background: var(--surface);
        }
        .es-regen-btn {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 10px;
          padding: 0.75rem 1rem;
          color: var(--text-muted);
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .es-regen-btn:hover { color: var(--text); border-color: rgba(255,255,255,0.14); }
        .es-start-btn {
          flex: 1;
          background: var(--purple);
          border: none;
          border-radius: 10px;
          padding: 0.75rem 1rem;
          color: #fff;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.88rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          transition: all 0.15s;
          letter-spacing: 0.01em;
        }
        .es-start-btn:hover:not(:disabled) {
          background: #6d28d9;
          transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(124,58,237,0.4);
        }
        .es-start-btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }

        /* ── Timer view ── */
        .es-timer-root {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          padding: 1rem 0 0.5rem;
          min-height: 320px;
          justify-content: center;
        }
        .es-arc-wrapper {
          position: relative;
          width: 140px;
          height: 140px;
          flex-shrink: 0;
        }
        .es-arc-center {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }
        .es-arc-time {
          font-size: 1.3rem;
          font-weight: 700;
          color: var(--text);
          line-height: 1;
        }
        .es-timer-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1rem;
          font-weight: 700;
          color: var(--text);
          text-align: center;
          max-width: 320px;
          line-height: 1.3;
        }
        .es-timer-category {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .es-timer-progress-bar {
          width: 80%;
          height: 3px;
          background: var(--surface2);
          border-radius: 2px;
          overflow: hidden;
          margin-top: -4px;
        }
        .es-timer-progress-fill {
          height: 100%;
          border-radius: 2px;
          transition: width 1s linear;
        }
        .es-timer-actions {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          width: 100%;
          max-width: 300px;
          margin-top: 8px;
        }
        .es-timer-complete-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: none;
          border-radius: 10px;
          padding: 0.8rem;
          color: #fff;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.875rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
          letter-spacing: 0.01em;
        }
        .es-timer-complete-btn:hover { filter: brightness(1.15); transform: translateY(-1px); }
        .es-timer-cancel-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          font-family: 'Inter', sans-serif;
          font-size: 0.78rem;
          cursor: pointer;
          padding: 0.25rem;
          transition: color 0.15s;
        }
        .es-timer-cancel-btn:hover { color: var(--text); }

        /* ── Done view ── */
        .es-done {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.875rem;
          padding: 2.5rem 1rem;
          text-align: center;
          animation: es-done-in 0.35s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes es-done-in {
          from { opacity: 0; transform: scale(0.88); }
          to   { opacity: 1; transform: scale(1); }
        }
        .es-done-orb {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: rgba(124,58,237,0.15);
          border: 1px solid rgba(124,58,237,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .es-done-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--text);
        }
        .es-done-sub {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          color: var(--text-muted);
        }

        @media (max-width: 540px) {
          .es-modal { max-height: 95vh; border-radius: 16px 16px 0 0; }
          .es-overlay { align-items: flex-end; padding: 0; }
        }
      `}</style>

      <div className="es-overlay" onClick={phase !== "running" && phase !== "loading" ? onClose : undefined}>
        <div className="es-modal" onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          <div className="es-header">
            <div className="es-header-top">
              <div className="es-header-left">
                <span className="es-eyebrow">
                  <span className="es-eyebrow-dot" />
                  Emergence Slot
                </span>
                <span className="es-title">
                  {phase === "running"
                    ? "Activity in progress"
                    : phase === "done"
                    ? "Slot complete"
                    : "Productify your free time"}
                </span>
                {phase !== "running" && phase !== "done" && (
                  <span className="es-subtitle">
                    {freeMinutes}m available — pick an activity to make it count
                  </span>
                )}
              </div>
              <button
                className="es-close-btn"
                onClick={onClose}
                disabled={phase === "loading"}
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>

            {/* Duration selector — shown only in ready/error phase */}
            {(phase === "ready" || phase === "error" || phase === "idle") && (
              <div className="es-duration-row">
                <span className="es-duration-label">I have</span>
                <div className="es-duration-chips">
                  {[15, 30, 45, 60, 90].map((m) => (
                    <button
                      key={m}
                      className={`es-duration-chip ${freeMinutes === m ? "active" : ""}`}
                      onClick={() => setFreeMinutes(m)}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="es-body">
            {/* Loading */}
            {phase === "loading" && (
              <div className="es-loading">
                <div className="es-loading-orb">
                  <Sparkles size={20} style={{ color: "var(--purple)" }} strokeWidth={1.5} />
                </div>
                <span className="es-loading-label">
                  Generating activities<span className="es-loading-dots" />
                </span>
              </div>
            )}

            {/* Error */}
            {phase === "error" && (
              <div className="es-error">
                <span className="es-error-text">{errorMsg}</span>
                <button className="es-retry-btn" onClick={fetchActivities}>
                  <RotateCcw size={13} />
                  Try again
                </button>
              </div>
            )}

            {/* Activity cards */}
            {phase === "ready" && (
              <>
                {activities.map((activity, i) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    index={i}
                    selected={selected?.id === activity.id}
                    onSelect={handleSelect}
                    disabled={selected && selected.id !== activity.id}
                  />
                ))}
              </>
            )}

            {/* Timer */}
            {phase === "running" && activeActivity && (
              <ActivityTimer
                activity={activeActivity}
                onComplete={handleComplete}
                onCancel={handleCancelTimer}
              />
            )}

            {/* Done */}
            {phase === "done" && (
              <div className="es-done">
                <div className="es-done-orb">
                  <Check size={24} style={{ color: "var(--purple)" }} strokeWidth={2.5} />
                </div>
                <div className="es-done-title">
                  {activeActivity?.title ?? "Activity complete"}
                </div>
                <div className="es-done-sub">Closing in a moment…</div>
              </div>
            )}
          </div>

          {/* Footer — shown only in ready phase */}
          {phase === "ready" && (
            <div className="es-start-footer">
              <button className="es-regen-btn" onClick={fetchActivities}>
                <RotateCcw size={13} />
                Regenerate
              </button>
              <button
                className="es-start-btn"
                onClick={handleStart}
                disabled={!selected}
              >
                <Play size={14} strokeWidth={2.5} />
                Start activity
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
