import { useState, useEffect, useRef, useCallback } from "react";
import { countdown, fmtTime, fmtDuration } from "../lib/dates";
import { loadTasks, saveTasks, loadUser, saveUser, isDndActive } from "../lib/storage";
import {
  CheckCircle2,
  Clock,
  ArrowRight,
  Flame,
  AlertTriangle,
  ChevronRight,
  Timer,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

// How many minutes before scheduledStart to fire the alarm
const ALARM_LEAD_MINS = 1;
// Poll interval for checking if an alarm should fire
const POLL_MS = 15000;
// How far ahead (mins) to push a task when user hits "Push to Later"
const PUSH_MINS = 30;

// ─── Progressive tightening helpers ──────────────────────────────────────────

/**
 * Apply tightening: when scheduling future tasks after extensions,
 * free gaps are reduced 10% per tighteningLevel. This is called
 * when user confirms "Need More Time" enough times to bump the level.
 *
 * Returns updated tasks array with compressed free gaps.
 */
function applyTightening(tasks, tighteningLevel) {
  if (tighteningLevel === 0) return tasks;
  const compressionFactor = 1 - tighteningLevel * 0.1; // e.g. level 2 → 0.8
  const now = new Date();

  // Only future pending tasks get re-compressed
  return tasks.map((t) => {
    if (
      t.status !== "pending" ||
      !t.scheduledStart ||
      new Date(t.scheduledStart) <= now
    ) {
      return t;
    }
    // Compress estimatedDurationMins by compressionFactor (minimum 15 mins)
    const compressed = Math.max(
      15,
      Math.round((t.estimatedDurationMins || 60) * compressionFactor)
    );
    // Recalculate scheduledEnd based on compressed duration
    const start = new Date(t.scheduledStart);
    const end = new Date(start.getTime() + compressed * 60000);
    return {
      ...t,
      estimatedDurationMins: compressed,
      scheduledEnd: end.toISOString(),
    };
  });
}

// ─── Countdown hook — ticks every second ──────────────────────────────────────

function useLiveCountdown(deadline) {
  const [value, setValue] = useState(() =>
    deadline ? countdown(deadline) : null
  );
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setValue(countdown(deadline)), 1000);
    return () => clearInterval(id);
  }, [deadline]);
  return value;
}

// ─── Alarm engine hook ────────────────────────────────────────────────────────
// Polls tasks every POLL_MS ms. Returns the task that should be alarming,
// or null. Exported so App can use it without knowing internals.

export function useAlarmEngine() {
  const [alarmTask, setAlarmTask] = useState(null);
  const firedRef = useRef(new Set()); // task ids already fired this session

  const check = useCallback(() => {
    // Suppress all alarms while sleep DND is active
    if (isDndActive()) return;

    const tasks = loadTasks();
    const now = new Date();

    const candidate = tasks.find((t) => {
      if (t.status !== "pending") return false;
      if (!t.scheduledStart) return false;
      if (firedRef.current.has(t.id)) return false;

      const start = new Date(t.scheduledStart);
      const diffMins = (start - now) / 60000;
      // Fire alarm if within ALARM_LEAD_MINS before start, or already past start
      return diffMins <= ALARM_LEAD_MINS && diffMins > -120; // don't fire if >2h overdue
    });

    if (candidate) {
      firedRef.current.add(candidate.id);
      setAlarmTask(candidate);
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, POLL_MS);
    return () => clearInterval(id);
  }, [check]);

  return { alarmTask, setAlarmTask };
}

// ─── Main AlarmTakeover component ─────────────────────────────────────────────

export default function AlarmTakeover({ task, onDismiss }) {
  const [phase, setPhase] = useState("alarm"); // alarm | confirm-complete | confirm-push | dismissed
  const [pushMins, setPushMins] = useState(PUSH_MINS);
  const [tighteningWarning, setTighteningWarning] = useState(false);

  const cd = useLiveCountdown(task?.deadline);
  const isOverdue = cd === "Overdue";

  // ── Work Completed ──
  function handleComplete() {
    const tasks = loadTasks();
    const now = new Date();
    const updated = tasks.map((t) => {
      if (t.id !== task.id) return t;
      return {
        ...t,
        status: "completed",
        actualDurationMins: t.scheduledStart
          ? Math.round((now - new Date(t.scheduledStart)) / 60000)
          : t.estimatedDurationMins,
      };
    });
    saveTasks(updated);
    window.dispatchEvent(
      new CustomEvent("cocoon:tasks-updated", { detail: { tasks: updated } })
    );
    setPhase("dismissed");
    setTimeout(() => onDismiss?.("completed"), 600);
  }

  // ── Need More Time ──
  function handleMoreTime() {
    const tasks = loadTasks();
    const taskIdx = tasks.findIndex((t) => t.id === task.id);
    if (taskIdx === -1) return;

    const t = tasks[taskIdx];
    const newExtCount = (t.extensionsCount || 0) + 1;

    // Tightening level bump: every 3rd extension across ANY task
    const user = loadUser();
    let newTighteningLevel = user?.progressiveTighteningLevel ?? 0;
    const allExtensions = tasks.reduce(
      (sum, tk) => sum + (tk.extensionsCount || 0),
      0
    );
    if ((allExtensions + 1) % 3 === 0) {
      newTighteningLevel = Math.min(5, newTighteningLevel + 1);
      saveUser({ ...user, progressiveTighteningLevel: newTighteningLevel });
    }

    // Extend scheduledEnd by pushMins
    const oldEnd = t.scheduledEnd ? new Date(t.scheduledEnd) : new Date();
    const newEnd = new Date(oldEnd.getTime() + pushMins * 60000);

    let updated = tasks.map((tk, i) =>
      i === taskIdx
        ? {
            ...tk,
            extensionsCount: newExtCount,
            status: "in_progress",
            scheduledEnd: newEnd.toISOString(),
          }
        : tk
    );

    // Apply tightening to future tasks
    updated = applyTightening(updated, newTighteningLevel);

    saveTasks(updated);
    window.dispatchEvent(
      new CustomEvent("cocoon:tasks-updated", { detail: { tasks: updated } })
    );

    if (newExtCount >= 2) {
      setTighteningWarning(true);
    } else {
      setPhase("dismissed");
      onDismiss?.("extended");
    }
  }

  function handleTighteningAck() {
    setPhase("dismissed");
    onDismiss?.("extended");
  }

  // ── Push to Later ──
  function handlePush() {
    const tasks = loadTasks();
    const now = new Date();
    const newStart = new Date(now.getTime() + pushMins * 60000);
    const dur =
      tasks.find((t) => t.id === task.id)?.estimatedDurationMins || 60;
    const newEnd = new Date(newStart.getTime() + dur * 60000);

    const updated = tasks.map((t) =>
      t.id !== task.id
        ? t
        : {
            ...t,
            status: "pushed",
            scheduledStart: newStart.toISOString(),
            scheduledEnd: newEnd.toISOString(),
            extensionsCount: (t.extensionsCount || 0) + 1,
          }
    );
    saveTasks(updated);
    window.dispatchEvent(
      new CustomEvent("cocoon:tasks-updated", { detail: { tasks: updated } })
    );
    setPhase("dismissed");
    setTimeout(() => onDismiss?.("pushed"), 500);
  }

  if (!task || phase === "dismissed") return null;

  const extensionsCount = task.extensionsCount || 0;
  const showTighteningBadge = extensionsCount >= 1;
  const user = loadUser();
  const tighteningLevel = user?.progressiveTighteningLevel ?? 0;

  return (
    <>
      <style>{`
        /* ─── Root overlay ─── */
        .alarm-root {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: #0a0a0a;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem 1.5rem;
          overflow: hidden;
          animation: alarm-in 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes alarm-in {
          from { opacity: 0; transform: scale(1.04); }
          to   { opacity: 1; transform: scale(1); }
        }

        /* ─── Ambient pulse rings ─── */
        .alarm-ring {
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(220, 38, 38, 0.12);
          animation: ring-expand 3s ease-out infinite;
          pointer-events: none;
        }
        .alarm-ring:nth-child(1) { width: 300px; height: 300px; animation-delay: 0s; }
        .alarm-ring:nth-child(2) { width: 500px; height: 500px; animation-delay: 0.8s; }
        .alarm-ring:nth-child(3) { width: 700px; height: 700px; animation-delay: 1.6s; }
        @keyframes ring-expand {
          0%   { opacity: 0.6; transform: scale(0.85); }
          100% { opacity: 0;   transform: scale(1.15); }
        }

        /* Crimson radial glow behind content */
        .alarm-glow {
          position: absolute;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(220,38,38,0.1) 0%, transparent 70%);
          pointer-events: none;
          animation: glow-breathe 4s ease-in-out infinite;
        }
        @keyframes glow-breathe {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.1); }
        }

        /* ─── Content card ─── */
        .alarm-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 480px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          text-align: center;
        }

        /* ─── Eyebrow ─── */
        .alarm-eyebrow {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.65rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--crimson);
          margin-bottom: 1.25rem;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .alarm-eyebrow-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--crimson);
          animation: dot-blink 1s ease-in-out infinite;
        }
        @keyframes dot-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.2; }
        }

        /* ─── Task name ─── */
        .alarm-task-name {
          font-family: 'Space Grotesk', sans-serif;
          font-size: clamp(1.6rem, 5vw, 2.4rem);
          font-weight: 700;
          color: var(--text);
          line-height: 1.2;
          margin-bottom: 0.5rem;
          letter-spacing: -0.02em;
        }

        /* ─── Description ─── */
        .alarm-task-desc {
          font-size: 0.875rem;
          color: var(--text-muted);
          line-height: 1.6;
          margin-bottom: 1.75rem;
          max-width: 360px;
          font-family: 'Inter', sans-serif;
        }

        /* ─── Countdown block ─── */
        .alarm-countdown-block {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          margin-bottom: 2rem;
        }
        .alarm-countdown-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.6rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--text-muted);
          opacity: 0.6;
        }
        .alarm-countdown-value {
          font-family: 'JetBrains Mono', monospace;
          font-size: clamp(2.4rem, 8vw, 3.5rem);
          font-weight: 700;
          color: var(--crimson);
          letter-spacing: -0.03em;
          line-height: 1;
        }
        .alarm-countdown-value.overdue {
          animation: overdue-pulse 1.2s ease-in-out infinite;
        }
        @keyframes overdue-pulse {
          0%, 100% { opacity: 1;   text-shadow: 0 0 0px rgba(220,38,38,0); }
          50%       { opacity: 0.7; text-shadow: 0 0 30px rgba(220,38,38,0.6); }
        }
        .alarm-scheduled-time {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.68rem;
          color: var(--text-muted);
          letter-spacing: 0.08em;
          display: flex;
          align-items: center;
          gap: 5px;
          margin-top: 4px;
        }

        /* ─── Tightening warning badge ─── */
        .alarm-tightening-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(220,38,38,0.1);
          border: 1px solid rgba(220,38,38,0.25);
          border-radius: 100px;
          padding: 5px 12px;
          margin-bottom: 1.5rem;
          animation: badge-in 0.3s ease;
        }
        @keyframes badge-in {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .alarm-tightening-text {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.62rem;
          letter-spacing: 0.08em;
          color: var(--crimson);
        }

        /* ─── Actions ─── */
        .alarm-actions {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        /* Primary: Work Completed */
        .alarm-btn-complete {
          width: 100%;
          background: var(--crimson);
          border: none;
          border-radius: 14px;
          padding: 1.1rem 1.5rem;
          color: #fff;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          letter-spacing: 0.01em;
          transition: all 0.15s;
          position: relative;
          overflow: hidden;
        }
        .alarm-btn-complete::after {
          content: '';
          position: absolute;
          inset: 0;
          background: rgba(255,255,255,0);
          transition: background 0.15s;
        }
        .alarm-btn-complete:hover::after { background: rgba(255,255,255,0.06); }
        .alarm-btn-complete:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(220,38,38,0.45);
        }
        .alarm-btn-complete:active { transform: translateY(0); }

        /* Secondary row */
        .alarm-secondary-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        /* Need More Time */
        .alarm-btn-more-time {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 12px;
          padding: 0.875rem 1rem;
          color: var(--text);
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          transition: all 0.15s;
        }
        .alarm-btn-more-time:hover {
          border-color: rgba(124,58,237,0.4);
          background: rgba(124,58,237,0.07);
          transform: translateY(-1px);
        }
        .alarm-btn-more-time-sub {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.58rem;
          color: var(--text-muted);
          letter-spacing: 0.06em;
        }

        /* Push to Later */
        .alarm-btn-push {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 12px;
          padding: 0.875rem 1rem;
          color: var(--text-muted);
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          transition: all 0.15s;
        }
        .alarm-btn-push:hover {
          border-color: rgba(255,255,255,0.12);
          color: var(--text);
          transform: translateY(-1px);
        }
        .alarm-btn-push-sub {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.58rem;
          color: var(--text-muted);
          letter-spacing: 0.06em;
        }

        /* Push time selector */
        .alarm-push-selector {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: -2px;
        }
        .alarm-push-select {
          background: var(--surface2);
          border: 1px solid var(--glass-border);
          border-radius: 7px;
          color: var(--text-muted);
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.68rem;
          padding: 4px 8px;
          cursor: pointer;
          outline: none;
          appearance: none;
          -webkit-appearance: none;
        }
        .alarm-push-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.6rem;
          color: var(--text-muted);
          letter-spacing: 0.06em;
        }

        /* ─── Tightening warning overlay ─── */
        .alarm-tightening-overlay {
          position: absolute;
          inset: 0;
          z-index: 2;
          background: rgba(10,10,10,0.96);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1.25rem;
          padding: 2rem;
          text-align: center;
          animation: alarm-in 0.3s ease;
        }
        .alarm-tightening-icon {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: rgba(220,38,38,0.12);
          border: 1px solid rgba(220,38,38,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: icon-pulse 1.5s ease-in-out infinite;
        }
        @keyframes icon-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.2); }
          50%       { box-shadow: 0 0 0 12px rgba(220,38,38,0); }
        }
        .alarm-tightening-heading {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1.4rem;
          font-weight: 700;
          color: var(--text);
          line-height: 1.3;
        }
        .alarm-tightening-body {
          font-size: 0.875rem;
          color: var(--text-muted);
          line-height: 1.65;
          max-width: 340px;
          font-family: 'Inter', sans-serif;
        }
        .alarm-tightening-level-display {
          display: flex;
          gap: 6px;
          align-items: flex-end;
        }
        .alarm-tightening-bar {
          width: 8px;
          border-radius: 3px;
          background: var(--surface2);
          transition: background 0.3s;
        }
        .alarm-tightening-bar.active { background: var(--crimson); }
        .alarm-tightening-ack-btn {
          background: var(--crimson);
          border: none;
          border-radius: 12px;
          padding: 0.9rem 2rem;
          color: #fff;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.15s;
          letter-spacing: 0.01em;
        }
        .alarm-tightening-ack-btn:hover {
          background: #b91c1c;
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(220,38,38,0.4);
        }

        /* ─── Dismiss flash ─── */
        .alarm-dismiss-flash {
          position: fixed;
          inset: 0;
          background: var(--purple);
          opacity: 0;
          z-index: 10000;
          pointer-events: none;
          animation: dismiss-flash 0.5s ease forwards;
        }
        @keyframes dismiss-flash {
          0%   { opacity: 0.4; }
          100% { opacity: 0; }
        }
      `}</style>

      <div className="alarm-root">
        {/* Ambient rings */}
        <div className="alarm-ring" />
        <div className="alarm-ring" />
        <div className="alarm-ring" />
        <div className="alarm-glow" />

        {/* Tightening warning overlay */}
        {tighteningWarning && (
          <div className="alarm-tightening-overlay">
            <div className="alarm-tightening-icon">
              <Flame size={24} style={{ color: "var(--crimson)" }} />
            </div>
            <div className="alarm-tightening-heading">
              Schedule tightening
            </div>
            <div className="alarm-tightening-body">
              You've requested extra time {extensionsCount + 1} times.
              Cocoon is compressing future free slots to compensate.
              {tighteningLevel >= 3
                ? " At this rate, your schedule will have minimal breathing room."
                : " This keeps your deadlines safe but reduces flexibility."}
            </div>

            {/* Tightening level bars */}
            <div className="alarm-tightening-level-display">
              {Array.from({ length: 5 }, (_, i) => {
                const heights = [10, 14, 18, 22, 26];
                return (
                  <div
                    key={i}
                    className={`alarm-tightening-bar ${i < tighteningLevel ? "active" : ""}`}
                    style={{ height: heights[i] }}
                  />
                );
              })}
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.65rem",
                  color: "var(--crimson)",
                  marginLeft: 8,
                }}
              >
                Level {tighteningLevel}/5
              </span>
            </div>

            <button className="alarm-tightening-ack-btn" onClick={handleTighteningAck}>
              Understood — keep going
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Main card */}
        <div className="alarm-card">
          {/* Eyebrow */}
          <div className="alarm-eyebrow">
            <span className="alarm-eyebrow-dot" />
            Time to start
          </div>

          {/* Task name */}
          <h1 className="alarm-task-name">{task.title}</h1>

          {/* Description */}
          {task.description && (
            <p className="alarm-task-desc">{task.description}</p>
          )}

          {/* Countdown */}
          <div className="alarm-countdown-block">
            {task.deadline ? (
              <>
                <span className="alarm-countdown-label">Deadline in</span>
                <span className={`alarm-countdown-value ${isOverdue ? "overdue" : ""}`}>
                  {cd}
                </span>
              </>
            ) : (
              <>
                <span className="alarm-countdown-label">Estimated duration</span>
                <span className="alarm-countdown-value" style={{ fontSize: "2rem", color: "var(--text)" }}>
                  {fmtDuration(task.estimatedDurationMins)}
                </span>
              </>
            )}
            {task.scheduledStart && (
              <span className="alarm-scheduled-time">
                <Clock size={11} />
                {fmtTime(task.scheduledStart)}
                {task.scheduledEnd ? ` — ${fmtTime(task.scheduledEnd)}` : ""}
              </span>
            )}
          </div>

          {/* Tightening badge */}
          {showTighteningBadge && (
            <div className="alarm-tightening-badge">
              <Flame size={12} style={{ color: "var(--crimson)" }} />
              <span className="alarm-tightening-text">
                {extensionsCount} extension{extensionsCount !== 1 ? "s" : ""} — tightening active
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="alarm-actions">
            {/* Primary */}
            <button className="alarm-btn-complete" onClick={handleComplete}>
              <CheckCircle2 size={18} strokeWidth={2.5} />
              Work Completed
            </button>

            {/* Secondary row */}
            <div className="alarm-secondary-row">
              <button className="alarm-btn-more-time" onClick={handleMoreTime}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Timer size={15} />
                  Need More Time
                </span>
                <span className="alarm-btn-more-time-sub">+{pushMins}m added</span>
              </button>

              <button className="alarm-btn-push" onClick={handlePush}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ArrowRight size={15} />
                  Push to Later
                </span>
                <span className="alarm-btn-push-sub">in {pushMins}m</span>
              </button>
            </div>

            {/* Push time selector */}
            <div className="alarm-push-selector">
              <span className="alarm-push-label">Push by</span>
              <select
                className="alarm-push-select"
                value={pushMins}
                onChange={(e) => setPushMins(Number(e.target.value))}
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>1 hour</option>
                <option value={120}>2 hours</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
