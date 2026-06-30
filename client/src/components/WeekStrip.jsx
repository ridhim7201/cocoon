import { getWeekDays, shortDay, isSameDay } from "../lib/dates";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function WeekStrip({ tasks = [], selectedDate, onSelectDate }) {
  const today = new Date();
  const days = getWeekDays(selectedDate || today);

  // Which days have a task with a hard deadline?
  const deadlineDays = new Set(
    tasks
      .filter((t) => t.deadline && !t.isFlexible)
      .map((t) => {
        const d = new Date(t.deadline);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })
  );

  function hasDeadline(date) {
    return deadlineDays.has(
      `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    );
  }

  // Tasks scheduled on each day
  function taskCount(date) {
    return tasks.filter(
      (t) => t.scheduledStart && isSameDay(new Date(t.scheduledStart), date)
    ).length;
  }

  return (
    <>
      <style>{`
        .week-strip {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
          padding: 0 0 1rem;
        }
        .week-day-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 10px 4px;
          border-radius: 10px;
          border: 1px solid transparent;
          background: none;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
          position: relative;
        }
        .week-day-btn:hover {
          background: var(--glass-bg);
          border-color: var(--glass-border);
        }
        .week-day-btn.is-today {
          background: rgba(124,58,237,0.08);
          border-color: rgba(124,58,237,0.25);
        }
        .week-day-btn.is-selected {
          background: rgba(124,58,237,0.15);
          border-color: var(--purple);
        }
        .week-day-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.6rem;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .week-day-btn.is-today .week-day-label,
        .week-day-btn.is-selected .week-day-label {
          color: var(--purple);
        }
        .week-day-num {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1rem;
          font-weight: 600;
          color: var(--text);
          line-height: 1;
        }
        .week-day-btn.is-today .week-day-num {
          color: var(--text);
        }
        .week-indicator-row {
          display: flex;
          gap: 3px;
          align-items: center;
          min-height: 6px;
        }
        .deadline-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--crimson);
          flex-shrink: 0;
        }
        .task-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--purple);
          opacity: 0.6;
          flex-shrink: 0;
        }
      `}</style>
      <div className="week-strip">
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const deadline = hasDeadline(day);
          const count = taskCount(day);
          return (
            <button
              key={i}
              className={`week-day-btn ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`}
              onClick={() => onSelectDate(day)}
              aria-label={`${DAY_LABELS[i]} ${day.getDate()}${deadline ? ", has deadline" : ""}`}
            >
              <span className="week-day-label">{DAY_LABELS[i]}</span>
              <span className="week-day-num">{day.getDate()}</span>
              <div className="week-indicator-row">
                {deadline && <span className="deadline-dot" title="Deadline" />}
                {Array.from({ length: Math.min(count, 3) }, (_, k) => (
                  <span key={k} className="task-dot" />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
