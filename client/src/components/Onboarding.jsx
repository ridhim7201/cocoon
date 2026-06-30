import { useState, useEffect } from "react";
import { ChevronRight, Check, Moon, Zap } from "lucide-react";
import { saveUser } from "../lib/storage";

// ─── Data ──────────────────────────────────────────────────────────────────────

const HOBBY_OPTIONS = [
  "Music",
  "Gaming",
  "Reading",
  "Fitness",
  "Cooking",
  "Drawing",
  "Writing",
  "Photography",
  "Travel",
  "Coding side-projects",
  "Film",
  "Meditation",
  "Sports",
  "Podcasts",
  "Dancing",
  "Gardening",
];

const PROFESSION_PRESETS = [
  "CS Student",
  "Engineering Student",
  "Medical Student",
  "Law Student",
  "Designer",
  "Software Engineer",
  "Researcher",
  "Writer",
  "Teacher",
  "Entrepreneur",
];

const SLEEP_OPTIONS = [
  { hours: 5, label: "5 hrs", note: "Night owl" },
  { hours: 6, label: "6 hrs", note: "Lean" },
  { hours: 7, label: "7 hrs", note: "Balanced" },
  { hours: 8, label: "8 hrs", note: "Recommended" },
  { hours: 9, label: "9 hrs", note: "Deep rest" },
];

// ─── Step sub-components ───────────────────────────────────────────────────────

function StepName({ value, onChange }) {
  return (
    <div className="step-content">
      <p className="step-eyebrow">Step 1 of 4</p>
      <h2 className="step-heading">What should Cocoon call you?</h2>
      <p className="step-sub">This is how we address you in alarms and focus sessions.</p>
      <input
        autoFocus
        type="text"
        className="text-input"
        placeholder="Your name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={40}
      />
    </div>
  );
}

function StepProfession({ value, onChange }) {
  const [custom, setCustom] = useState(
    PROFESSION_PRESETS.includes(value) ? "" : value
  );
  const [useCustom, setUseCustom] = useState(
    value && !PROFESSION_PRESETS.includes(value)
  );

  function selectPreset(p) {
    setUseCustom(false);
    setCustom("");
    onChange(p);
  }

  function handleCustomChange(v) {
    setCustom(v);
    onChange(v);
  }

  return (
    <div className="step-content">
      <p className="step-eyebrow">Step 2 of 4</p>
      <h2 className="step-heading">What's your main role?</h2>
      <p className="step-sub">
        Cocoon uses this to tailor emergence slots and task pacing to your context.
      </p>
      <div className="chip-grid">
        {PROFESSION_PRESETS.map((p) => (
          <button
            key={p}
            className={`chip ${!useCustom && value === p ? "chip-active" : ""}`}
            onClick={() => selectPreset(p)}
          >
            {p}
          </button>
        ))}
        <button
          className={`chip ${useCustom ? "chip-active" : ""}`}
          onClick={() => {
            setUseCustom(true);
            onChange(custom);
          }}
        >
          Other…
        </button>
      </div>
      {useCustom && (
        <input
          autoFocus
          type="text"
          className="text-input mt-4"
          placeholder="Describe your role"
          value={custom}
          onChange={(e) => handleCustomChange(e.target.value)}
          maxLength={60}
        />
      )}
    </div>
  );
}

function StepHobbies({ value, onChange }) {
  function toggle(hobby) {
    if (value.includes(hobby)) {
      onChange(value.filter((h) => h !== hobby));
    } else if (value.length < 6) {
      onChange([...value, hobby]);
    }
  }

  return (
    <div className="step-content">
      <p className="step-eyebrow">Step 3 of 4</p>
      <h2 className="step-heading">What do you actually enjoy?</h2>
      <p className="step-sub">
        Pick up to 6. Cocoon weaves these into your free-slot suggestions so downtime
        doesn't feel wasted.
      </p>
      <div className="chip-grid">
        {HOBBY_OPTIONS.map((h) => (
          <button
            key={h}
            className={`chip ${value.includes(h) ? "chip-active" : ""} ${
              !value.includes(h) && value.length >= 6 ? "chip-disabled" : ""
            }`}
            onClick={() => toggle(h)}
            disabled={!value.includes(h) && value.length >= 6}
          >
            {value.includes(h) && (
              <Check size={12} strokeWidth={2.5} className="inline mr-1 -mt-0.5" />
            )}
            {h}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
        {value.length}/6 selected
      </p>
    </div>
  );
}

function StepSleep({ value, onChange }) {
  return (
    <div className="step-content">
      <p className="step-eyebrow">Step 4 of 4</p>
      <h2 className="step-heading">How much sleep do you need?</h2>
      <p className="step-sub">
        Cocoon blocks this time every night and tracks your sleep deficit — the number
        that quietly explains your worst focus days.
      </p>
      <div className="sleep-grid">
        {SLEEP_OPTIONS.map((opt) => (
          <button
            key={opt.hours}
            className={`sleep-card ${value === opt.hours ? "sleep-card-active" : ""}`}
            onClick={() => onChange(opt.hours)}
          >
            <Moon
              size={16}
              className="mb-2"
              style={{
                color: value === opt.hours ? "var(--purple)" : "var(--text-muted)",
              }}
            />
            <span className="sleep-hours">{opt.label}</span>
            <span className="sleep-note">{opt.note}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Onboarding component ─────────────────────────────────────────────────

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0); // 0–3
  const [animDir, setAnimDir] = useState("forward"); // forward | back
  const [visible, setVisible] = useState(true);

  const [name, setName] = useState("");
  const [profession, setProfession] = useState("");
  const [hobbies, setHobbies] = useState([]);
  const [sleepHours, setSleepHours] = useState(7);

  // Can we proceed from the current step?
  const canContinue = [
    name.trim().length >= 1,
    profession.trim().length >= 1,
    hobbies.length >= 1,
    true, // sleep always has a default
  ][step];

  function transition(nextStep, direction) {
    setAnimDir(direction);
    setVisible(false);
    setTimeout(() => {
      setStep(nextStep);
      setVisible(true);
    }, 200);
  }

  function handleNext() {
    if (step < 3) {
      transition(step + 1, "forward");
    } else {
      handleFinish();
    }
  }

  function handleBack() {
    if (step > 0) transition(step - 1, "back");
  }

  function handleFinish() {
    const user = {
      id: crypto.randomUUID(),
      name: name.trim(),
      profession: profession.trim(),
      hobbies,
      sleepRequirementHours: sleepHours,
      progressiveTighteningLevel: 0,
    };
    saveUser(user);
    onComplete(user);
  }

  // Keyboard shortcut: Enter to advance
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Enter" && canContinue) handleNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, canContinue, name, profession, hobbies, sleepHours]);

  const steps = [
    <StepName value={name} onChange={setName} />,
    <StepProfession value={profession} onChange={setProfession} />,
    <StepHobbies value={hobbies} onChange={setHobbies} />,
    <StepSleep value={sleepHours} onChange={setSleepHours} />,
  ];

  return (
    <>
      <style>{`
        /* ── Layout ── */
        .onboarding-root {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: var(--bg);
          padding: 2rem 1rem;
          position: relative;
          overflow: hidden;
        }

        /* Ambient glow behind card */
        .onboarding-root::before {
          content: '';
          position: absolute;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }

        /* ── Wordmark ── */
        .wordmark {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1.1rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 3rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .wordmark-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--purple);
          display: inline-block;
        }

        /* ── Card ── */
        .onboarding-card {
          width: 100%;
          max-width: 540px;
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 16px;
          padding: 2.5rem 2.5rem 2rem;
          backdrop-filter: blur(12px);
          position: relative;
        }

        /* ── Progress bar ── */
        .progress-track {
          height: 2px;
          background: var(--surface2);
          border-radius: 2px;
          margin-bottom: 2.5rem;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--purple), #a855f7);
          border-radius: 2px;
          transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* ── Step content ── */
        .step-content {
          transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .step-entering-forward  { opacity: 0; transform: translateX(20px); }
        .step-entering-back     { opacity: 0; transform: translateX(-20px); }
        .step-visible           { opacity: 1; transform: translateX(0); }

        .step-eyebrow {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.7rem;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--purple);
          margin-bottom: 0.6rem;
        }
        .step-heading {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1.6rem;
          font-weight: 700;
          color: var(--text);
          line-height: 1.25;
          margin-bottom: 0.5rem;
        }
        .step-sub {
          font-size: 0.875rem;
          color: var(--text-muted);
          line-height: 1.6;
          margin-bottom: 1.75rem;
          max-width: 420px;
        }

        /* ── Text input ── */
        .text-input {
          width: 100%;
          background: var(--surface);
          border: 1px solid var(--glass-border);
          border-radius: 10px;
          padding: 0.85rem 1.1rem;
          font-family: 'Inter', sans-serif;
          font-size: 1rem;
          color: var(--text);
          outline: none;
          transition: border-color 0.2s;
        }
        .text-input::placeholder { color: var(--text-muted); }
        .text-input:focus { border-color: var(--purple); }

        /* ── Chips ── */
        .chip-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .chip {
          padding: 0.45rem 1rem;
          border-radius: 100px;
          border: 1px solid var(--glass-border);
          background: var(--surface);
          color: var(--text-muted);
          font-size: 0.825rem;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .chip:hover:not(.chip-disabled) {
          border-color: var(--purple);
          color: var(--text);
          background: rgba(124,58,237,0.08);
        }
        .chip-active {
          background: rgba(124,58,237,0.15) !important;
          border-color: var(--purple) !important;
          color: var(--text) !important;
        }
        .chip-disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        /* ── Sleep grid ── */
        .sleep-grid {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .sleep-card {
          flex: 1;
          min-width: 72px;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1.1rem 0.75rem;
          border-radius: 12px;
          border: 1px solid var(--glass-border);
          background: var(--surface);
          cursor: pointer;
          transition: all 0.15s;
        }
        .sleep-card:hover {
          border-color: var(--purple);
          background: rgba(124,58,237,0.07);
        }
        .sleep-card-active {
          background: rgba(124,58,237,0.15) !important;
          border-color: var(--purple) !important;
        }
        .sleep-hours {
          font-family: 'JetBrains Mono', monospace;
          font-size: 1rem;
          font-weight: 700;
          color: var(--text);
          display: block;
        }
        .sleep-note {
          font-size: 0.7rem;
          color: var(--text-muted);
          display: block;
          margin-top: 0.2rem;
        }

        /* ── Nav row ── */
        .nav-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 2.25rem;
        }
        .btn-back {
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 0.85rem;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          padding: 0.5rem 0;
          transition: color 0.15s;
        }
        .btn-back:hover { color: var(--text); }
        .btn-next {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: var(--purple);
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 0.75rem 1.4rem;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          letter-spacing: 0.01em;
        }
        .btn-next:hover:not(:disabled) {
          background: #6d28d9;
          transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(124,58,237,0.4);
        }
        .btn-next:disabled {
          opacity: 0.35;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        .btn-next-finish {
          background: var(--crimson) !important;
        }
        .btn-next-finish:hover:not(:disabled) {
          background: #b91c1c !important;
          box-shadow: 0 4px 20px rgba(220,38,38,0.4) !important;
        }

        /* ── Hint ── */
        .enter-hint {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.65rem;
          color: var(--text-muted);
          margin-top: 1rem;
          text-align: right;
          opacity: ${canContinue ? 0.6 : 0};
          transition: opacity 0.3s;
        }

        @media (max-width: 540px) {
          .onboarding-card { padding: 2rem 1.25rem 1.5rem; }
          .step-heading { font-size: 1.3rem; }
          .sleep-grid { gap: 0.5rem; }
          .sleep-card { min-width: 60px; padding: 0.9rem 0.5rem; }
        }
      `}</style>

      <div className="onboarding-root">
        {/* Wordmark */}
        <div className="wordmark">
          <span className="wordmark-dot" />
          Cocoon
        </div>

        {/* Card */}
        <div className="onboarding-card">
          {/* Progress */}
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${((step + 1) / 4) * 100}%` }}
            />
          </div>

          {/* Step content with slide animation */}
          <div
            className={`step-content ${
              visible
                ? "step-visible"
                : animDir === "forward"
                ? "step-entering-forward"
                : "step-entering-back"
            }`}
          >
            {steps[step]}
          </div>

          {/* Nav */}
          <div className="nav-row">
            <button
              className="btn-back"
              onClick={handleBack}
              style={{ visibility: step > 0 ? "visible" : "hidden" }}
            >
              Back
            </button>

            <button
              className={`btn-next ${step === 3 ? "btn-next-finish" : ""}`}
              onClick={handleNext}
              disabled={!canContinue}
            >
              {step === 3 ? (
                <>
                  <Zap size={15} strokeWidth={2.5} />
                  Start Cocoon
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight size={15} strokeWidth={2.5} />
                </>
              )}
            </button>
          </div>

          {/* Enter hint */}
          <p className="enter-hint">Press Enter to continue</p>
        </div>
      </div>
    </>
  );
}
