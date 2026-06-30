const USER_KEY = "cocoon_user";
const TASKS_KEY = "cocoon_tasks";
const SLEEP_LOGS_KEY = "cocoon_sleep_logs";
const DND_KEY = "cocoon_dnd_until"; // ISO string or null

export function saveUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function loadUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearUser() {
  localStorage.removeItem(USER_KEY);
}

export function saveTasks(tasks) {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

export function loadTasks() {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ─── Sleep logs ───────────────────────────────────────────────────────────────

export function saveSleepLogs(logs) {
  localStorage.setItem(SLEEP_LOGS_KEY, JSON.stringify(logs));
}

export function loadSleepLogs() {
  try {
    const raw = localStorage.getItem(SLEEP_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addSleepLog(log) {
  const logs = loadSleepLogs();
  const updated = [...logs, log];
  saveSleepLogs(updated);
  return updated;
}

/** Returns the most recent sleep log with no wakeTime yet (i.e. currently asleep), or null. */
export function getActiveSleepLog() {
  const logs = loadSleepLogs();
  const open = logs.filter((l) => !l.wakeTime);
  if (open.length === 0) return null;
  return open.sort((a, b) => new Date(b.sleepOnset) - new Date(a.sleepOnset))[0];
}

export function updateSleepLog(id, patch) {
  const logs = loadSleepLogs();
  const updated = logs.map((l) => (l.id === id ? { ...l, ...patch } : l));
  saveSleepLogs(updated);
  return updated;
}

// ─── Do Not Disturb (alarm suppression until wake) ─────────────────────────────

export function setDndUntil(isoString) {
  if (isoString) {
    localStorage.setItem(DND_KEY, isoString);
  } else {
    localStorage.removeItem(DND_KEY);
  }
}

export function getDndUntil() {
  return localStorage.getItem(DND_KEY); // ISO string or null
}

export function isDndActive() {
  const until = getDndUntil();
  if (!until) return false;
  return new Date(until) > new Date();
}
