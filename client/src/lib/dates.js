/**
 * Returns an array of 7 Date objects starting from the Monday
 * of the week that contains `anchorDate`.
 */
export function getWeekDays(anchorDate = new Date()) {
  const d = new Date(anchorDate);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const diffToMon = (day + 6) % 7;  // days since last Monday
  d.setDate(d.getDate() - diffToMon);
  d.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(d);
    dd.setDate(d.getDate() + i);
    return dd;
  });
}

/** "Mon", "Tue" … */
export function shortDay(date) {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

/** "Jun 30" */
export function shortDate(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "9:00 AM" */
export function fmtTime(date) {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** isSameDay */
export function isSameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/** "2h 15m" from minutes */
export function fmtDuration(mins) {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Returns a live countdown string "Xd Yh Zm" to a deadline.
 * Returns "Overdue" if past.
 */
export function countdown(deadline) {
  const now = Date.now();
  const target = new Date(deadline).getTime();
  const diff = target - now;
  if (diff <= 0) return "Overdue";
  const totalMins = Math.floor(diff / 60000);
  const d = Math.floor(totalMins / 1440);
  const h = Math.floor((totalMins % 1440) / 60);
  const m = totalMins % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Given a list of tasks, return a simple completion rate 0–100.
 */
export function completionRate(tasks) {
  if (!tasks.length) return 0;
  const done = tasks.filter((t) => t.status === "completed").length;
  return Math.round((done / tasks.length) * 100);
}

/**
 * Time-dilation ratio: avg(actual/estimated). Returns string like "1.3×"
 */
export function timeDilation(tasks) {
  const measured = tasks.filter(
    (t) => t.actualDurationMins && t.estimatedDurationMins
  );
  if (!measured.length) return "—";
  const ratio =
    measured.reduce((sum, t) => sum + t.actualDurationMins / t.estimatedDurationMins, 0) /
    measured.length;
  return `${ratio.toFixed(1)}×`;
}
