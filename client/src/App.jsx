import { useState, useEffect } from "react";
import { loadUser, saveTasks } from "./lib/storage";
import Onboarding from "./components/Onboarding";
import Dashboard from "./components/Dashboard";
import TaskInput from "./components/TaskInput";
import AlarmTakeover, { useAlarmEngine } from "./components/AlarmTakeover";
import EmergenceSlot from "./components/EmergenceSlot";
import TaskChatbot from "./components/TaskChatbot";
import VoiceCommand from "./components/VoiceCommand";
import SleepMode from "./components/SleepMode";

export default function App() {
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [taskInputOpen, setTaskInputOpen] = useState(false);
  const [taskInputPrefill, setTaskInputPrefill] = useState("");
  const [chatTask, setChatTask] = useState(null);
  const [emergenceOpen, setEmergenceOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);

  const { alarmTask, setAlarmTask } = useAlarmEngine();

  useEffect(() => {
    const saved = loadUser();
    if (saved) setUser(saved);
    setChecked(true);
  }, []);

  // Cmd+K → voice trigger
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("cocoon:voice-trigger"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Voice ADD_TASK intent → open TaskInput with prefill
  useEffect(() => {
    function onAddTask(e) {
      if (e.detail?.rawTask) setTaskInputPrefill(e.detail.rawTask);
      setTaskInputOpen(true);
    }
    window.addEventListener("cocoon:add-task", onAddTask);
    return () => window.removeEventListener("cocoon:add-task", onAddTask);
  }, []);

  // Voice PRODUCTIFY_SLOT intent → open emergence
  useEffect(() => {
    function onProductify() { setEmergenceOpen(true); }
    window.addEventListener("cocoon:productify-slot", onProductify);
    return () => window.removeEventListener("cocoon:productify-slot", onProductify);
  }, []);

  // Voice NAVIGATE_TASK_BOT intent → open chatbot for matched task
  useEffect(() => {
    function onNavigateTaskBot(e) {
      if (e.detail?.task) setChatTask(e.detail.task);
    }
    window.addEventListener("cocoon:navigate-task-bot", onNavigateTaskBot);
    return () => window.removeEventListener("cocoon:navigate-task-bot", onNavigateTaskBot);
  }, []);

  // Voice OPEN_SETTINGS intent
  useEffect(() => {
    function onOpenSettings() { setSettingsOpen(true); }
    window.addEventListener("cocoon:open-settings", onOpenSettings);
    return () => window.removeEventListener("cocoon:open-settings", onOpenSettings);
  }, []);

  // Voice CLEAR_SCHEDULE intent → wipe all tasks (confirmation already handled in VoiceCommand)
  useEffect(() => {
    function onClearSchedule() {
      saveTasks([]);
      window.dispatchEvent(new CustomEvent("cocoon:tasks-updated", { detail: { tasks: [] } }));
    }
    window.addEventListener("cocoon:clear-schedule", onClearSchedule);
    return () => window.removeEventListener("cocoon:clear-schedule", onClearSchedule);
  }, []);

  // Dev helper
  useEffect(() => {
    window.__testAlarm = (overrides = {}) => {
      const now = new Date();
      setAlarmTask({
        id: "test-alarm",
        title: "Test Task",
        description: "This is a test alarm trigger from the dev console.",
        deadline: new Date(now.getTime() + 2 * 3600000).toISOString(),
        estimatedDurationMins: 90,
        scheduledStart: now.toISOString(),
        scheduledEnd: new Date(now.getTime() + 90 * 60000).toISOString(),
        extensionsCount: 0,
        status: "pending",
        isFlexible: false,
        ...overrides,
      });
    };
    return () => { delete window.__testAlarm; };
  }, [setAlarmTask]);

  if (!checked) return null;
  if (!user) return <Onboarding onComplete={(u) => setUser(u)} />;

  return (
    <>
      <Dashboard
        user={user}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenTaskInput={() => { setTaskInputPrefill(""); setTaskInputOpen(true); }}
        onOpenChat={(task) => setChatTask(task)}
        onOpenEmergence={() => setEmergenceOpen(true)}
        onOpenSleep={() => setSleepOpen(true)}
      />

      <TaskInput
        user={user}
        isOpen={taskInputOpen}
        onClose={() => { setTaskInputOpen(false); setTaskInputPrefill(""); }}
        prefillText={taskInputPrefill}
      />

      {alarmTask && (
        <AlarmTakeover
          task={alarmTask}
          onDismiss={(reason) => {
            console.log("[Cocoon] Alarm dismissed:", reason);
            setAlarmTask(null);
          }}
        />
      )}

      {/* ── Emergence Slot (real) ── */}
      <EmergenceSlot
        user={user}
        isOpen={emergenceOpen}
        onClose={() => setEmergenceOpen(false)}
      />

      {/* ── Remaining stubs ── */}
      {settingsOpen && (
        <div style={overlayStyle} onClick={() => setSettingsOpen(false)}>
          <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <p style={stubText}>Settings panel — coming soon</p>
            <button style={stubBtn} onClick={() => setSettingsOpen(false)}>Close</button>
            <button
              style={{ ...stubBtn, marginTop: 8, color: "var(--crimson)" }}
              onClick={() => { localStorage.clear(); window.location.reload(); }}
            >
              Reset all data
            </button>
          </div>
        </div>
      )}

      {/* ── Task Chatbot (real) ── */}
      <TaskChatbot
        task={chatTask}
        isOpen={!!chatTask}
        onClose={() => setChatTask(null)}
      />

      {/* ── Voice Command (real) ── */}
      <VoiceCommand />

      {/* ── Sleep Mode (real) ── */}
      <SleepMode
        isOpen={sleepOpen}
        onClose={() => setSleepOpen(false)}
      />
    </>
  );
}

const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
};
const panelStyle = {
  background: "var(--surface)", border: "1px solid var(--glass-border)",
  borderRadius: 14, padding: "2rem", minWidth: 280, display: "flex",
  flexDirection: "column", gap: 8,
};
const stubText = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem",
  color: "var(--text-muted)", marginBottom: 8,
};
const stubBtn = {
  background: "var(--glass-bg)", border: "1px solid var(--glass-border)",
  borderRadius: 8, padding: "0.5rem 1rem", cursor: "pointer",
  color: "var(--text-muted)", fontFamily: "'Inter', sans-serif", fontSize: "0.8rem",
};
