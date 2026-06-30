import { isSameDay, fmtTime, fmtDuration } from "../lib/dates";
import { Clock, CheckCircle2, Circle, Timer, ArrowRight } from "lucide-react";

const HOUR_PX = 64; // pixels per hour
const DAY_START = 6; // 6 AM
const DAY_END = 24;  // midnight
const TOTAL_HOURS = DAY_END - DAY_START;

function statusIcon(status) {
  if (status === "completed") return <CheckCircle2 size={13} style={{ color: "var(--purple)" }} />;
  if (status === "in_progress") return <Timer size={13} style={{ color: "var(--crimson)" }} />;
  if (status === "pushed") return <ArrowRight size={13} style={{ color: "var(--text-muted)" }} />;
  return <Circle size={13} style={{ color: "var(--text-muted)" }} />;
}

function taskTopPercent(scheduledStart) {
  const d = new Date(scheduledStart);
  const hours = d.getHours() + d.getMinutes() / 60;
  return Math.max(0, hours - DAY_START);
}

function taskHeightHours(scheduledStart, scheduledEnd) {
  const start = new Date(scheduledStart);
  const end = new Date(scheduledEnd);
  const diff = (end - start) / 3600000;
  return Math.max(0.25, diff); // minimum 15-min visual height
}

export default function TaskTimeline({ tasks = [], selectedDate, onTaskClick }) {
  const now = new Date();
  const isToday = isSameDay(selectedDate, now);
  const nowHours = now.getHours() + now.getMinutes() / 60;
  const nowOffset = nowHours - DAY_START;

  // Tasks scheduled on this day
  const dayTasks = tasks
    .filter((t) => t.scheduledStart && isSameDay(new Date(t.scheduledStart), selectedDate))
    .sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => DAY_START + i);

  return (
    <>
      <style>{`
        .timeline-root {
          position: relative;
          width: 100%;
        }
        .timeline-grid {
          position: relative;
          /* total height: TOTAL_HOURS * HOUR_PX */
          height: ${TOTAL_HOURS * HOUR_PX}px;
        }
        /* Hour rows */
        .timeline-hour-row {
          position: absolute;
          left: 0;
          right: 0;
          display: flex;
          align-items: flex-start;
          pointer-events: none;
        }
        .timeline-hour-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.62rem;
          color: var(--text-muted);
          width: 44px;
          flex-shrink: 0;
          padding-top: 1px;
          letter-spacing: 0.04em;
          text-align: right;
          padding-right: 10px;
          opacity: 0.5;
          user-select: none;
        }
        .timeline-hour-line {
          flex: 1;
          height: 1px;
          background: var(--glass-border);
          margin-top: 8px;
        }

        /* Now indicator */
        .timeline-now {
          position: absolute;
          left: 44px;
          right: 0;
          height: 1px;
          background: var(--crimson);
          z-index: 10;
          pointer-events: none;
        }
        .timeline-now::before {
          content: '';
          position: absolute;
          left: -4px;
          top: -3px;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--crimson);
        }

        /* Task blocks */
        .task-block {
          position: absolute;
          left: 54px;
          right: 0;
          border-radius: 8px;
          padding: 7px 10px;
          cursor: pointer;
          transition: filter 0.15s, transform 0.15s;
          overflow: hidden;
          border: 1px solid transparent;
        }
        .task-block:hover {
          transform: translateX(2px);
          filter: brightness(1.15);
        }
        .task-block-pending {
          background: rgba(124,58,237,0.12);
          border-color: rgba(124,58,237,0.25);
        }
        .task-block-in-progress {
          background: rgba(220,38,38,0.13);
          border-color: rgba(220,38,38,0.3);
          box-shadow: 0 0 12px rgba(220,38,38,0.15);
        }
        .task-block-completed {
          background: rgba(255,255,255,0.03);
          border-color: var(--glass-border);
          opacity: 0.55;
        }
        .task-block-pushed {
          background: rgba(255,255,255,0.02);
          border-color: var(--glass-border);
          opacity: 0.4;
        }

        .task-block-header {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-bottom: 2px;
        }
        .task-block-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .task-block-time {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.6rem;
          color: var(--text-muted);
          letter-spacing: 0.05em;
        }
        .task-block-dur {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.58rem;
          color: var(--text-muted);
          margin-left: auto;
          flex-shrink: 0;
        }

        /* Empty state */
        .timeline-empty {
          position: absolute;
          top: 50%;
          left: 54px;
          right: 0;
          transform: translateY(-50%);
          text-align: center;
          pointer-events: none;
        }
        .timeline-empty-text {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.72rem;
          color: var(--text-muted);
          letter-spacing: 0.08em;
          opacity: 0.5;
        }
        .timeline-empty-hint {
          font-size: 0.68rem;
          color: var(--text-muted);
          font-family: 'Inter', sans-serif;
          margin-top: 0.4rem;
          opacity: 0.4;
        }

        /* Scroll wrapper */
        .timeline-scroll {
          max-height: 420px;
          overflow-y: auto;
          padding-right: 2px;
        }
      `}</style>

      <div className="timeline-root">
        <div className="timeline-scroll">
          <div className="timeline-grid">
            {/* Hour grid lines */}
            {hours.map((h) => {
              const top = (h - DAY_START) * HOUR_PX;
              const label =
                h === 0 ? "12 AM"
                : h < 12 ? `${h} AM`
                : h === 12 ? "12 PM"
                : `${h - 12} PM`;
              return (
                <div
                  key={h}
                  className="timeline-hour-row"
                  style={{ top }}
                >
                  <span className="timeline-hour-label">{label}</span>
                  <div className="timeline-hour-line" />
                </div>
              );
            })}

            {/* Now indicator */}
            {isToday && nowOffset >= 0 && nowOffset <= TOTAL_HOURS && (
              <div
                className="timeline-now"
                style={{ top: nowOffset * HOUR_PX }}
              />
            )}

            {/* Task blocks */}
            {dayTasks.map((task) => {
              const topHours = taskTopPercent(task.scheduledStart);
              const heightHours = taskHeightHours(task.scheduledStart, task.scheduledEnd);
              const top = topHours * HOUR_PX;
              const height = Math.max(heightHours * HOUR_PX, 36); // 36px min
              const colorClass = {
                pending: "task-block-pending",
                in_progress: "task-block-in-progress",
                completed: "task-block-completed",
                pushed: "task-block-pushed",
              }[task.status] || "task-block-pending";

              return (
                <div
                  key={task.id}
                  className={`task-block ${colorClass}`}
                  style={{ top, height }}
                  onClick={() => onTaskClick?.(task)}
                  title={task.title}
                >
                  <div className="task-block-header">
                    {statusIcon(task.status)}
                    <span className="task-block-title">{task.title}</span>
                    {height > 44 && (
                      <span className="task-block-dur">
                        {fmtDuration(task.estimatedDurationMins)}
                      </span>
                    )}
                  </div>
                  {height > 44 && (
                    <div className="task-block-time">
                      {fmtTime(task.scheduledStart)} — {fmtTime(task.scheduledEnd)}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Empty state */}
            {dayTasks.length === 0 && (
              <div className="timeline-empty">
                <p className="timeline-empty-text">No tasks scheduled</p>
                <p className="timeline-empty-hint">
                  Use the task input below to plan your day
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
