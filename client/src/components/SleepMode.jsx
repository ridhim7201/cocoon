import { useState, useEffect, useRef } from "react";
import {
  loadUser,
  addSleepLog,
  getActiveSleepLog,
  updateSleepLog,
  setDndUntil,
  getDndUntil,
} from "../lib/storage";
import { Moon, Sunrise, X, Sparkles } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Computes the user's intended wake time: sleepOnset + sleepRequirementHours.
 */
function computeWakeTime(sleepOnset, sleepRequirementHours) {
  const onset = new Date(sleepOnset);
  return new Date(onset.getTime() + sleepRequirementHours * 3600000);
}

function fmtClock(date) {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtElapsed(ms) {
  const totalMins = Math.floor(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// ─── Starfield — lightweight CSS-only ambient particles ───────────────────────

function Starfield() {
  // Deterministic pseudo-random positions so they don't reshuffle on re-render
  const stars = useRef(
    Array.from({ length: 40 }, (_, i) => ({
      left: (i * 37) % 100,
      top: (i * 53) % 100,
      size: 1 + (i % 3),
      delay: (i % 10) * 0.4,
      duration: 3 + (i % 4),
    }))
  ).current;

  return (
    <div className="sm-starfield">
      {stars.map((s, i) => (
        <div
          key={i}
          className="sm-star"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Main SleepMode component ─────────────────────────────────────────────────

export default function SleepMode({ isOpen, onClose }) {
  const [activeLog, setActiveLog] = useState(null); // SleepLog currently in progress, or null
  const [now, setNow] = useState(new Date());
  const [justWoke, setJustWoke] = useState(false);

  const user = loadUser();
  const sleepRequirementHours = user?.sleepRequirementHours ?? 8;

  // Restore in-progress sleep session on open (survives refresh)
  useEffect(() => {
    if (!isOpen) return;
    const existing = getActiveSleepLog();
    if (existing) setActiveLog(existing);
  }, [isOpen]);

  // Tick clock every minute while asleep (for elapsed display)
  useEffect(() => {
    if (!activeLog) return;
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, [activeLog]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setJustWoke(false);
    }
  }, [isOpen]);

  // Escape closes — but only if not actively asleep (avoid accidental dismissal mid-sleep)
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && !activeLog) onClose();
    }
    if (isOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, activeLog, onClose]);

  // ── Log Sleep Onset ──
  function handleLogOnset() {
    const onsetTime = new Date();
    const wakeTime = computeWakeTime(onsetTime, sleepRequirementHours);

    const log = {
      id: crypto.randomUUID(),
      userId: user?.id ?? "unknown",
      sleepOnset: onsetTime.toISOString(),
      wakeTime: undefined,
      deficitMins: undefined,
    };

    addSleepLog(log);
    setDndUntil(wakeTime.toISOString());
    setActiveLog(log);
  }

  // ── Wake up — close out the sleep log ──
  function handleWakeUp() {
    if (!activeLog) return;
    const wakeTime = new Date();
    const onset = new Date(activeLog.sleepOnset);
    const actualMins = Math.round((wakeTime - onset) / 60000);
    const requiredMins = sleepRequirementHours * 60;
    const deficitMins = Math.max(0, requiredMins - actualMins);

    updateSleepLog(activeLog.id, {
      wakeTime: wakeTime.toISOString(),
      deficitMins,
    });

    setDndUntil(null); // clear DND immediately
    setJustWoke(true);
    setActiveLog(null);

    // Brief confirmation flash, then close
    setTimeout(() => onClose(), 1800);
  }

  if (!isOpen) return null;

  const onsetTime = activeLog ? new Date(activeLog.sleepOnset) : null;
  const wakeTime = activeLog ? computeWakeTime(activeLog.sleepOnset, sleepRequirementHours) : null;
  const elapsedMs = onsetTime ? now - onsetTime : 0;
  const dndUntil = getDndUntil();

  return (
    <>
      <style>{`
        /* ── Root ── */
        .sm-root {
          position: fixed;
          inset: 0;
          z-index: 500;
          background: radial-gradient(ellipse at 50% 30%, #0d0d14 0%, #060608 70%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          animation: sm-fade-in 0.6s ease;
        }
        @keyframes sm-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* ── Starfield ── */
        .sm-starfield {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .sm-star {
          position: absolute;
          background: #c7d2fe;
          border-radius: 50%;
          animation: sm-twinkle ease-in-out infinite;
          opacity: 0.4;
        }
        @keyframes sm-twinkle {
          0%, 100% { opacity: 0.15; }
          50%       { opacity: 0.7; }
        }

        /* ── Ambient glow ── */
        .sm-glow {
          position: absolute;
          width: 480px;
          height: 480px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%);
          animation: sm-glow-breathe 6s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes sm-glow-breathe {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.08); }
        }

        /* ── Close (only visible before sleep starts) ── */
        .sm-close {
          position: absolute;
          top: 1.5rem;
          right: 1.5rem;
          z-index: 2;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255,255,255,0.4);
          cursor: pointer;
          transition: all 0.15s;
        }
        .sm-close:hover {
          color: rgba(255,255,255,0.8);
          background: rgba(255,255,255,0.08);
        }

        /* ── Content ── */
        .sm-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.75rem;
          text-align: center;
          padding: 2rem;
          max-width: 420px;
        }

        /* ── Moon icon ── */
        .sm-moon-wrapper {
          position: relative;
          width: 96px;
          height: 96px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .sm-moon-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1px solid rgba(99,102,241,0.15);
          animation: sm-ring-breathe 4s ease-in-out infinite;
        }
        @keyframes sm-ring-breathe {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50%       { transform: scale(1.12); opacity: 1; }
        }
        .sm-moon-icon {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: rgba(99,102,241,0.1);
          border: 1px solid rgba(99,102,241,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* ── Eyebrow ── */
        .sm-eyebrow {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.65rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #818cf8;
          opacity: 0.85;
        }

        /* ── Heading ── */
        .sm-heading {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1.5rem;
          font-weight: 700;
          color: #f0f0f5;
          line-height: 1.3;
        }

        /* ── Body text ── */
        .sm-body {
          font-size: 0.85rem;
          color: rgba(240,240,245,0.5);
          line-height: 1.65;
          font-family: 'Inter', sans-serif;
        }

        /* ── In-sleep stats ── */
        .sm-sleep-stats {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }
        .sm-stat {
          display: flex;
          flex-direction: column;
          gap: 4px;
          align-items: center;
        }
        .sm-stat-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.58rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(240,240,245,0.35);
        }
        .sm-stat-value {
          font-family: 'JetBrains Mono', monospace;
          font-size: 1.1rem;
          font-weight: 700;
          color: #c7d2fe;
        }
        .sm-stat-divider {
          width: 1px;
          height: 24px;
          background: rgba(255,255,255,0.08);
        }

        /* ── Elapsed display (large) ── */
        .sm-elapsed-block {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .sm-elapsed-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.62rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(240,240,245,0.4);
        }
        .sm-elapsed-value {
          font-family: 'JetBrains Mono', monospace;
          font-size: 2.2rem;
          font-weight: 700;
          color: #c7d2fe;
          letter-spacing: -0.02em;
        }

        /* ── DND badge ── */
        .sm-dnd-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(99,102,241,0.08);
          border: 1px solid rgba(99,102,241,0.2);
          border-radius: 100px;
          padding: 5px 12px;
        }
        .sm-dnd-text {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.62rem;
          letter-spacing: 0.06em;
          color: #a5b4fc;
        }

        /* ── Single action button ── */
        .sm-action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          border: none;
          border-radius: 14px;
          padding: 1rem 2.25rem;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.18s;
          letter-spacing: 0.01em;
          width: 100%;
          max-width: 280px;
        }
        .sm-action-btn-sleep {
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          color: #fff;
        }
        .sm-action-btn-sleep:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 32px rgba(99,102,241,0.4);
        }
        .sm-action-btn-wake {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: #fff;
        }
        .sm-action-btn-wake:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 32px rgba(245,158,11,0.4);
        }
        .sm-action-btn:active { transform: translateY(0); }

        /* ── Wake confirmation flash ── */
        .sm-wake-flash {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          animation: sm-wake-in 0.4s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes sm-wake-in {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
        .sm-wake-icon {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: rgba(245,158,11,0.12);
          border: 1px solid rgba(245,158,11,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        @media (max-width: 420px) {
          .sm-content { padding: 1.5rem; gap: 1.5rem; }
          .sm-heading { font-size: 1.25rem; }
          .sm-elapsed-value { font-size: 1.8rem; }
        }
      `}</style>

      <div className="sm-root">
        <Starfield />
        <div className="sm-glow" />

        {/* Close button — only when not actively sleeping */}
        {!activeLog && !justWoke && (
          <button className="sm-close" onClick={onClose} aria-label="Close sleep mode">
            <X size={15} />
          </button>
        )}

        <div className="sm-content">
          {/* ── Wake confirmation ── */}
          {justWoke ? (
            <div className="sm-wake-flash">
              <div className="sm-wake-icon">
                <Sunrise size={26} style={{ color: "#f59e0b" }} strokeWidth={1.8} />
              </div>
              <span className="sm-heading">Good morning</span>
              <span className="sm-body">Sleep logged. Alarms are back on.</span>
            </div>
          ) : activeLog ? (
            /* ── Currently asleep ── */
            <>
              <div className="sm-moon-wrapper">
                <div className="sm-moon-ring" />
                <div className="sm-moon-icon">
                  <Moon size={28} style={{ color: "#818cf8" }} strokeWidth={1.6} />
                </div>
              </div>

              <span className="sm-eyebrow">Sleeping</span>

              <div className="sm-elapsed-block">
                <span className="sm-elapsed-label">Time asleep</span>
                <span className="sm-elapsed-value">{fmtElapsed(elapsedMs)}</span>
              </div>

              <div className="sm-sleep-stats">
                <div className="sm-stat">
                  <span className="sm-stat-label">Onset</span>
                  <span className="sm-stat-value">{fmtClock(onsetTime)}</span>
                </div>
                <div className="sm-stat-divider" />
                <div className="sm-stat">
                  <span className="sm-stat-label">Target wake</span>
                  <span className="sm-stat-value">{fmtClock(wakeTime)}</span>
                </div>
              </div>

              <div className="sm-dnd-badge">
                <Moon size={11} style={{ color: "#a5b4fc" }} />
                <span className="sm-dnd-text">
                  Alarms silenced until {fmtClock(wakeTime)}
                </span>
              </div>

              <button className="sm-action-btn sm-action-btn-wake" onClick={handleWakeUp}>
                <Sunrise size={17} strokeWidth={2.2} />
                I'm Awake
              </button>
            </>
          ) : (
            /* ── Pre-sleep state ── */
            <>
              <div className="sm-moon-wrapper">
                <div className="sm-moon-ring" />
                <div className="sm-moon-icon">
                  <Moon size={28} style={{ color: "#818cf8" }} strokeWidth={1.6} />
                </div>
              </div>

              <span className="sm-eyebrow">Wind down</span>
              <span className="sm-heading">Ready for sleep?</span>
              <span className="sm-body">
                Logging your sleep onset silences all alarms until your{" "}
                {sleepRequirementHours}-hour target wake time. Cocoon will track
                any deficit automatically.
              </span>

              <button className="sm-action-btn sm-action-btn-sleep" onClick={handleLogOnset}>
                <Moon size={17} strokeWidth={2.2} />
                Log Sleep Onset
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
