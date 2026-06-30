import { useState, useEffect } from "react";
import { loadTasks, saveTasks, saveUser } from "../lib/storage";
import { isSameDay, shortDate } from "../lib/dates";
import WeekStrip from "./WeekStrip";
import TaskTimeline from "./TaskTimeline";
import StatsStrip from "./StatsStrip";
import ActiveTaskCard from "./ActiveTaskCard";
import { Settings, Plus, Mic, Sparkles, ChevronLeft, ChevronRight, Moon } from "lucide-react";

export default function Dashboard({ user, onOpenSettings, onOpenTaskInput, onOpenChat, onOpenEmergence, onOpenSleep }) {
  const [tasks, setTasks] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0); // which week to show

  // Load tasks from localStorage on mount
  useEffect(() => {
    setTasks(loadTasks());
  }, []);

  // Keep localStorage in sync whenever tasks change
  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  // Expose a way for other modules to refresh tasks
  useEffect(() => {
    function onTasksUpdated(e) {
      if (e.detail?.tasks) setTasks(e.detail.tasks);
    }
    window.addEventListener("cocoon:tasks-updated", onTasksUpdated);
    return () => window.removeEventListener("cocoon:tasks-updated", onTasksUpdated);
  }, []);

  const today = new Date();
  const selectedLabel = isSameDay(selectedDate, today)
    ? "Today"
    : shortDate(selectedDate);

  // Detect free slots: gap >= 45 min between tasks today with no task in_progress
  const todayTasks = tasks.filter(
    (t) => t.scheduledStart && isSameDay(new Date(t.scheduledStart), today)
  );
  const hasInProgress = todayTasks.some((t) => t.status === "in_progress");
  const hasFreeSlot =
    !hasInProgress &&
    (todayTasks.length === 0 ||
      todayTasks.every((t) => t.status === "completed" || t.status === "pushed"));

  // Week navigation: shift selected date by 7 days
  function shiftWeek(dir) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + dir * 7);
    setSelectedDate(d);
    setWeekOffset((o) => o + dir);
  }

  function handleTaskClick(task) {
    onOpenChat?.(task);
  }

  return (
    <>
      <style>{`
        .dash-root {
          min-height: 100vh;
          background: var(--bg);
          display: flex;
          flex-direction: column;
        }

        /* ── Top bar ── */
        .dash-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.5rem 0.75rem;
          border-bottom: 1px solid var(--glass-border);
          position: sticky;
          top: 0;
          background: rgba(10,10,10,0.92);
          backdrop-filter: blur(12px);
          z-index: 50;
        }
        .dash-wordmark {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .dash-wordmark-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--purple);
          display: inline-block;
          box-shadow: 0 0 8px var(--purple);
        }
        .dash-topbar-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .dash-icon-btn {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 8px;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--text-muted);
          transition: color 0.15s, border-color 0.15s, background 0.15s;
        }
        .dash-icon-btn:hover {
          color: var(--text);
          border-color: rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.06);
        }
        .dash-add-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--purple);
          border: none;
          border-radius: 8px;
          height: 36px;
          padding: 0 1rem;
          color: #fff;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s, transform 0.15s;
          letter-spacing: 0.01em;
        }
        .dash-add-btn:hover {
          background: #6d28d9;
          transform: translateY(-1px);
        }

        /* ── Body ── */
        .dash-body {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr;
          max-width: 800px;
          width: 100%;
          margin: 0 auto;
          padding: 1.25rem 1.5rem 6rem; /* bottom pad for FAB */
          gap: 1.25rem;
        }

        /* ── Section headers ── */
        .dash-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.6rem;
        }
        .dash-section-title {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.65rem;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        /* ── Week nav row ── */
        .week-nav-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }
        .week-nav-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 6px;
          transition: color 0.15s, background 0.15s;
          display: flex;
          align-items: center;
        }
        .week-nav-btn:hover {
          color: var(--text);
          background: var(--glass-bg);
        }
        .week-nav-label {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text);
        }

        /* ── Timeline section ── */
        .timeline-section {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 14px;
          padding: 1rem 1.25rem 1.25rem;
        }
        .timeline-day-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .timeline-day-label {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1rem;
          font-weight: 700;
          color: var(--text);
        }
        .timeline-task-count {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.65rem;
          color: var(--text-muted);
          letter-spacing: 0.06em;
        }

        /* ── Emergence CTA ── */
        .emergence-cta {
          background: rgba(124,58,237,0.07);
          border: 1px dashed rgba(124,58,237,0.3);
          border-radius: 12px;
          padding: 1rem 1.25rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .emergence-cta:hover {
          background: rgba(124,58,237,0.12);
          border-color: rgba(124,58,237,0.5);
        }
        .emergence-cta-left {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .emergence-cta-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text);
        }
        .emergence-cta-sub {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-family: 'Inter', sans-serif;
        }
        .emergence-cta-btn {
          background: rgba(124,58,237,0.2);
          border: 1px solid rgba(124,58,237,0.35);
          border-radius: 8px;
          padding: 0.45rem 0.9rem;
          color: var(--text);
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
          transition: background 0.15s;
        }
        .emergence-cta-btn:hover {
          background: rgba(124,58,237,0.35);
        }

        /* ── Floating mic button ── */
        .fab-mic {
          position: fixed;
          bottom: 1.75rem;
          right: 1.75rem;
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: var(--surface2);
          border: 1px solid var(--glass-border);
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 100;
          transition: all 0.15s;
          box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        }
        .fab-mic:hover {
          background: var(--surface);
          color: var(--text);
          border-color: rgba(255,255,255,0.15);
          transform: scale(1.05);
        }
        .fab-mic.recording {
          background: rgba(220,38,38,0.15);
          border-color: var(--crimson);
          color: var(--crimson);
          animation: mic-pulse 1s ease-in-out infinite;
        }
        @keyframes mic-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.3); }
          50% { box-shadow: 0 0 0 10px rgba(220,38,38,0); }
        }

        @media (max-width: 600px) {
          .dash-body { padding: 1rem 1rem 5rem; gap: 1rem; }
          .dash-topbar { padding: 0.875rem 1rem 0.625rem; }
          .dash-add-btn span { display: none; }
        }
      `}</style>

      <div className="dash-root">
        {/* Top bar */}
        <header className="dash-topbar">
          <div className="dash-wordmark">
            <span className="dash-wordmark-dot" />
            Cocoon
          </div>
          <div className="dash-topbar-right">
            <button
              className="dash-add-btn"
              onClick={onOpenTaskInput}
              title="Add tasks"
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>Add tasks</span>
            </button>
            <button
              className="dash-icon-btn"
              onClick={onOpenSleep}
              title="Sleep mode"
              aria-label="Enter sleep mode"
            >
              <Moon size={16} />
            </button>
            <button
              className="dash-icon-btn"
              onClick={onOpenSettings}
              title="Settings"
              aria-label="Open settings"
            >
              <Settings size={16} />
            </button>
          </div>
        </header>

        {/* Main body */}
        <main className="dash-body">
          {/* Active task */}
          <section>
            <div className="dash-section-header">
              <span className="dash-section-title">Up next</span>
            </div>
            <ActiveTaskCard tasks={tasks} onOpenChat={onOpenChat} />
          </section>

          {/* Week strip */}
          <section>
            <div className="week-nav-row">
              <button className="week-nav-btn" onClick={() => shiftWeek(-1)} aria-label="Previous week">
                <ChevronLeft size={16} />
              </button>
              <span className="week-nav-label">
                {weekOffset === 0 ? "This week" : weekOffset === 1 ? "Next week" : weekOffset === -1 ? "Last week" : shortDate(selectedDate)}
              </span>
              <button className="week-nav-btn" onClick={() => shiftWeek(1)} aria-label="Next week">
                <ChevronRight size={16} />
              </button>
            </div>
            <WeekStrip
              tasks={tasks}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          </section>

          {/* Daily timeline */}
          <section className="timeline-section">
            <div className="timeline-day-header">
              <span className="timeline-day-label">{selectedLabel}</span>
              <span className="timeline-task-count">
                {tasks.filter(
                  (t) => t.scheduledStart && isSameDay(new Date(t.scheduledStart), selectedDate)
                ).length} tasks
              </span>
            </div>
            <TaskTimeline
              tasks={tasks}
              selectedDate={selectedDate}
              onTaskClick={handleTaskClick}
            />
          </section>

          {/* Productify free slot CTA — shown when no in-progress tasks today */}
          {hasFreeSlot && (
            <div className="emergence-cta" onClick={onOpenEmergence} role="button" tabIndex={0}>
              <div className="emergence-cta-left">
                <span className="emergence-cta-title">You have a free slot</span>
                <span className="emergence-cta-sub">
                  Let Cocoon suggest something worth doing right now
                </span>
              </div>
              <button className="emergence-cta-btn">
                <Sparkles size={13} style={{ display: "inline", marginRight: 5 }} />
                Productify
              </button>
            </div>
          )}

          {/* Stats strip */}
          <section>
            <div className="dash-section-header">
              <span className="dash-section-title">Your stats</span>
            </div>
            <StatsStrip tasks={tasks} user={user} />
          </section>
        </main>

        {/* Floating mic button */}
        <button
          className="fab-mic"
          title="Voice command (Cmd+K)"
          aria-label="Voice command"
          onClick={() => {
            // Voice module will hook into this — dispatch event for now
            window.dispatchEvent(new CustomEvent("cocoon:voice-trigger"));
          }}
        >
          <Mic size={20} />
        </button>
      </div>
    </>
  );
}
