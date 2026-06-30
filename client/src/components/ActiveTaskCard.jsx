import { useState, useEffect } from "react";
import { countdown, fmtTime, fmtDuration } from "../lib/dates";
import { Zap, Clock } from "lucide-react";

export default function ActiveTaskCard({ tasks = [], onOpenChat }) {
  const [tick, setTick] = useState(0);

  // Refresh countdown every 30s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Find the most urgent non-completed task with a deadline
  const active = tasks
    .filter((t) => t.status !== "completed" && t.status !== "pushed")
    .sort((a, b) => {
      // deadline first, then scheduledStart
      const aTime = a.deadline
        ? new Date(a.deadline)
        : a.scheduledStart
        ? new Date(a.scheduledStart)
        : Infinity;
      const bTime = b.deadline
        ? new Date(b.deadline)
        : b.scheduledStart
        ? new Date(b.scheduledStart)
        : Infinity;
      return aTime - bTime;
    })[0];

  if (!active) {
    return (
      <>
        <style>{`
          .active-card-empty {
            background: var(--glass-bg);
            border: 1px solid var(--glass-border);
            border-radius: 12px;
            padding: 1.25rem 1.5rem;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            color: var(--text-muted);
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.72rem;
            letter-spacing: 0.06em;
          }
        `}</style>
        <div className="active-card-empty">
          <Zap size={14} />
          No active tasks — add some to get started
        </div>
      </>
    );
  }

  const hasDeadline = !!active.deadline;
  const cd = hasDeadline ? countdown(active.deadline) : null;
  const isOverdue = cd === "Overdue";
  const isUrgent = hasDeadline && !isOverdue && cd && !cd.startsWith("Inf");

  return (
    <>
      <style>{`
        .active-card {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 12px;
          padding: 1.1rem 1.25rem;
          position: relative;
          overflow: hidden;
          transition: border-color 0.2s;
        }
        .active-card.is-urgent {
          border-color: rgba(220,38,38,0.3);
          background: rgba(220,38,38,0.04);
        }
        .active-card.is-urgent::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, var(--crimson), transparent);
        }
        .active-card-eyebrow {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.6rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 0.4rem;
        }
        .active-card-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1.15rem;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 0.6rem;
          line-height: 1.3;
        }
        .active-card-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .active-card-countdown {
          font-family: 'JetBrains Mono', monospace;
          font-size: 1.4rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--crimson);
          line-height: 1;
        }
        .active-card-countdown.overdue {
          animation: pulse-red 1.5s ease-in-out infinite;
        }
        @keyframes pulse-red {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .active-card-schedule {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.65rem;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .active-card-btn {
          background: rgba(124,58,237,0.15);
          border: 1px solid rgba(124,58,237,0.3);
          color: var(--text);
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.4rem 0.9rem;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.15s;
          letter-spacing: 0.01em;
        }
        .active-card-btn:hover {
          background: rgba(124,58,237,0.28);
        }
      `}</style>

      <div className={`active-card ${isUrgent || isOverdue ? "is-urgent" : ""}`}>
        <div className="active-card-eyebrow">Active task</div>
        <div className="active-card-title">{active.title}</div>
        <div className="active-card-meta">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {hasDeadline && (
              <div className={`active-card-countdown ${isOverdue ? "overdue" : ""}`}>
                {cd}
              </div>
            )}
            {active.scheduledStart && (
              <div className="active-card-schedule">
                <Clock size={10} />
                {fmtTime(active.scheduledStart)}
                {active.scheduledEnd ? ` — ${fmtTime(active.scheduledEnd)}` : ""}
                {active.estimatedDurationMins
                  ? ` · ${fmtDuration(active.estimatedDurationMins)}`
                  : ""}
              </div>
            )}
          </div>
          <button className="active-card-btn" onClick={() => onOpenChat?.(active)}>
            Get started
          </button>
        </div>
      </div>
    </>
  );
}
