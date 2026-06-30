import { completionRate, timeDilation } from "../lib/dates";
import { TrendingUp, Clock, Flame } from "lucide-react";

export default function StatsStrip({ tasks = [], user }) {
  const rate = completionRate(tasks);
  const dilation = timeDilation(tasks);
  const tighteningLevel = user?.progressiveTighteningLevel ?? 0;

  return (
    <>
      <style>{`
        .stats-strip {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        .stat-card {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 10px;
          padding: 0.85rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .stat-label {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 0.65rem;
          font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .stat-value {
          font-family: 'JetBrains Mono', monospace;
          font-size: 1.35rem;
          font-weight: 700;
          color: var(--text);
          line-height: 1;
        }
        .stat-sub {
          font-size: 0.62rem;
          color: var(--text-muted);
          font-family: 'Inter', sans-serif;
        }

        /* Tightening bars */
        .tightening-bars {
          display: flex;
          gap: 3px;
          align-items: flex-end;
          height: 16px;
        }
        .tightening-bar {
          width: 6px;
          border-radius: 2px;
          background: var(--surface2);
          transition: background 0.3s;
        }
        .tightening-bar.active {
          background: var(--crimson);
        }

        /* Completion arc (simple progress bar) */
        .rate-bar-track {
          height: 3px;
          background: var(--surface2);
          border-radius: 2px;
          overflow: hidden;
          margin-top: 2px;
        }
        .rate-bar-fill {
          height: 100%;
          background: var(--purple);
          border-radius: 2px;
          transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }

        @media (max-width: 480px) {
          .stats-strip { grid-template-columns: 1fr 1fr; }
          .stat-card:last-child { grid-column: 1 / -1; }
        }
      `}</style>

      <div className="stats-strip">
        {/* Completion rate */}
        <div className="stat-card">
          <div className="stat-label">
            <TrendingUp size={11} />
            Completion
          </div>
          <div className="stat-value">{rate}%</div>
          <div className="rate-bar-track">
            <div className="rate-bar-fill" style={{ width: `${rate}%` }} />
          </div>
          <div className="stat-sub">
            {tasks.filter((t) => t.status === "completed").length}/{tasks.length} tasks
          </div>
        </div>

        {/* Time dilation */}
        <div className="stat-card">
          <div className="stat-label">
            <Clock size={11} />
            Time dilation
          </div>
          <div
            className="stat-value"
            style={{
              color:
                dilation === "—"
                  ? "var(--text-muted)"
                  : parseFloat(dilation) > 1.5
                  ? "var(--crimson)"
                  : "var(--text)",
            }}
          >
            {dilation}
          </div>
          <div className="stat-sub">actual vs estimated</div>
        </div>

        {/* Tightening level */}
        <div className="stat-card">
          <div className="stat-label">
            <Flame size={11} />
            Tightening
          </div>
          <div className="tightening-bars">
            {Array.from({ length: 5 }, (_, i) => {
              const barHeights = [8, 10, 12, 14, 16];
              return (
                <div
                  key={i}
                  className={`tightening-bar ${i < tighteningLevel ? "active" : ""}`}
                  style={{ height: barHeights[i] }}
                />
              );
            })}
          </div>
          <div className="stat-sub">
            Level {tighteningLevel}/5
            {tighteningLevel >= 3 ? " — schedule compressed" : ""}
          </div>
        </div>
      </div>
    </>
  );
}
