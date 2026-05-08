import { useState, useEffect, useRef, useCallback } from "react";

const GLASS_ML = 250;

function calcDailyGoal({ weight, activity, climate, gender }) {
  let base = weight * 35;
  if (gender === "female") base = weight * 31;
  if (activity === "moderate") base += 350;
  if (activity === "high") base += 700;
  if (climate === "hot") base += 500;
  return Math.round(base / 50) * 50;
}

function formatTime(date) {
  return date.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
}

function buildSchedule(goal, wakeHour, sleepHour) {
  const glasses = Math.ceil(goal / GLASS_ML);
  const totalMinutes = (sleepHour - wakeHour) * 60;
  const interval = Math.floor(totalMinutes / glasses);
  const times = [];
  for (let i = 0; i < glasses; i++) {
    const d = new Date();
    d.setHours(wakeHour, 0, 0, 0);
    d.setMinutes(d.getMinutes() + i * interval);
    if (d.getHours() < sleepHour) times.push(d);
  }
  return times;
}

const DROPS = Array.from({ length: 6 }, (_, i) => ({
  id: i,
  x: 15 + Math.random() * 70,
  delay: i * 0.4,
  size: 3 + Math.random() * 5,
  dur: 2 + Math.random() * 3,
}));

export default function App() {
  const [step, setStep] = useState("setup");
  const [form, setForm] = useState({ weight: "", gender: "male", activity: "low", climate: "normal", wake: 7, sleep: 23 });
  const [goal, setGoal] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [drunk, setDrunk] = useState([]);
  const [nextIndex, setNextIndex] = useState(0);
  const [notifPerm, setNotifPerm] = useState("default");
  const [lastReminder, setLastReminder] = useState(null);
  const [pulse, setPulse] = useState(false);
  const timerRef = useRef(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if ("Notification" in window) setNotifPerm(Notification.permission);
  }, []);

  const requestNotif = async () => {
    if ("Notification" in window) {
      const p = await Notification.requestPermission();
      setNotifPerm(p);
    }
  };

  const handleStart = () => {
    if (!form.weight || isNaN(form.weight)) return;
    const g = calcDailyGoal(form);
    const sched = buildSchedule(g, form.wake, form.sleep);
    setGoal(g);
    setSchedule(sched);
    setDrunk([]);
    setNextIndex(0);
    setStep("tracker");
  };

  const checkReminders = useCallback(() => {
    if (!schedule.length) return;
    const nowTime = new Date();
    for (let i = nextIndex; i < schedule.length; i++) {
      const t = schedule[i];
      const diff = nowTime - t;
      if (diff >= 0 && diff < 600000 && !drunk.includes(i)) {
        if (lastReminder !== i) {
          setLastReminder(i);
          setPulse(true);
          setTimeout(() => setPulse(false), 2000);
          if (notifPerm === "granted") {
            new Notification("💧 Čas na vodu!", {
              body: `Je ${formatTime(t)} — vypij pohár vody (${GLASS_ML} ml)`,
              icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E💧%3C/text%3E%3C/svg%3E",
            });
          }
        }
        break;
      }
    }
  }, [schedule, nextIndex, drunk, notifPerm, lastReminder]);

  useEffect(() => {
    if (step !== "tracker") return;
    timerRef.current = setInterval(checkReminders, 60000);
    checkReminders();
    return () => clearInterval(timerRef.current);
  }, [step, checkReminders]);

  const drink = (i) => {
    if (drunk.includes(i)) return;
    const nd = [...drunk, i];
    setDrunk(nd);
    setNextIndex(i + 1);
    setPulse(true);
    setTimeout(() => setPulse(false), 800);
  };

  const drunkMl = drunk.length * GLASS_ML;
  const pct = goal ? Math.min(100, Math.round((drunkMl / goal) * 100)) : 0;

  const nextReminder = schedule.find((t, i) => !drunk.includes(i) && t > now);

  return (
    <div style={styles.root}>
      <style>{css}</style>

      {/* Animated background */}
      <div style={styles.bg}>
        {DROPS.map((d) => (
          <div
            key={d.id}
            className="drop"
            style={{
              left: `${d.x}%`,
              width: d.size,
              height: d.size * 1.4,
              animationDelay: `${d.delay}s`,
              animationDuration: `${d.dur}s`,
            }}
          />
        ))}
      </div>

      <div style={styles.card}>
        {step === "setup" ? (
          <Setup form={form} setForm={setForm} onStart={handleStart} notifPerm={notifPerm} onRequestNotif={requestNotif} />
        ) : (
          <Tracker
            goal={goal}
            schedule={schedule}
            drunk={drunk}
            drunkMl={drunkMl}
            pct={pct}
            nextReminder={nextReminder}
            pulse={pulse}
            now={now}
            drink={drink}
            onReset={() => setStep("setup")}
            notifPerm={notifPerm}
            onRequestNotif={requestNotif}
            lastReminder={lastReminder}
          />
        )}
      </div>
    </div>
  );
}

function Setup({ form, setForm, onStart, notifPerm, onRequestNotif }) {
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div style={styles.setup}>
      <div style={styles.logoWrap}>
        <span style={styles.logoIcon}>💧</span>
        <h1 style={styles.title}>HydroPlán</h1>
        <p style={styles.sub}>Vypočítaj si denný pitný režim</p>
      </div>

      <div style={styles.fields}>
        <label style={styles.label}>Hmotnosť (kg)</label>
        <input
          style={styles.input}
          type="number"
          min="30"
          max="200"
          placeholder="napr. 75"
          value={form.weight}
          onChange={(e) => set("weight", e.target.value)}
        />

        <label style={styles.label}>Pohlavie</label>
        <div style={styles.pills}>
          {[["male","Muž"],["female","Žena"]].map(([v, l]) => (
            <button key={v} style={{ ...styles.pill, ...(form.gender === v ? styles.pillActive : {}) }} onClick={() => set("gender", v)}>{l}</button>
          ))}
        </div>

        <label style={styles.label}>Fyzická aktivita</label>
        <div style={styles.pills}>
          {[["low","Nízka"],["moderate","Stredná"],["high","Vysoká"]].map(([v, l]) => (
            <button key={v} style={{ ...styles.pill, ...(form.activity === v ? styles.pillActive : {}) }} onClick={() => set("activity", v)}>{l}</button>
          ))}
        </div>

        <label style={styles.label}>Klíma / prostredie</label>
        <div style={styles.pills}>
          {[["normal","Bežná"],["hot","Horúca"]].map(([v, l]) => (
            <button key={v} style={{ ...styles.pill, ...(form.climate === v ? styles.pillActive : {}) }} onClick={() => set("climate", v)}>{l}</button>
          ))}
        </div>

        <div style={styles.timeRow}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Vstávam o</label>
            <div style={styles.timeWrap}>
              <input type="range" min="4" max="12" value={form.wake}
                onChange={(e) => set("wake", +e.target.value)} style={styles.range} />
              <span style={styles.timeVal}>{String(form.wake).padStart(2,"0")}:00</span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Chodím spať o</label>
            <div style={styles.timeWrap}>
              <input type="range" min="20" max="26" value={form.sleep}
                onChange={(e) => set("sleep", +e.target.value)} style={styles.range} />
              <span style={styles.timeVal}>{String(form.sleep % 24).padStart(2,"0")}:00</span>
            </div>
          </div>
        </div>

        {notifPerm !== "granted" && (
          <button style={styles.notifBtn} onClick={onRequestNotif}>
            🔔 Povoliť notifikácie
          </button>
        )}
        {notifPerm === "granted" && <p style={styles.notifOk}>✅ Notifikácie aktívne</p>}

        <button style={styles.startBtn} onClick={onStart}>
          Vypočítať môj plán →
        </button>
      </div>
    </div>
  );
}

function Tracker({ goal, schedule, drunk, drunkMl, pct, nextReminder, pulse, now, drink, onReset, notifPerm, onRequestNotif, lastReminder }) {
  const isComplete = drunkMl >= goal;

  return (
    <div style={styles.tracker}>
      <div style={styles.trackerHeader}>
        <button style={styles.backBtn} onClick={onReset}>← Späť</button>
        <h2 style={styles.trackerTitle}>💧 Denný plán</h2>
      </div>

      {/* Circle progress */}
      <div style={{ ...styles.circleWrap, animation: pulse ? "pulse 0.6s ease" : "none" }}>
        <svg width="180" height="180" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r="78" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
          <circle
            cx="90" cy="90" r="78" fill="none"
            stroke={isComplete ? "#4ade80" : "#38bdf8"}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 78}`}
            strokeDashoffset={`${2 * Math.PI * 78 * (1 - pct / 100)}`}
            transform="rotate(-90 90 90)"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div style={styles.circleCenter}>
          <div style={styles.pctText}>{pct}%</div>
          <div style={styles.mlText}>{drunkMl} / {goal} ml</div>
          <div style={styles.glassText}>{drunk.length} / {schedule.length} 🥛</div>
        </div>
      </div>

      {isComplete && (
        <div style={styles.successBanner}>🎉 Denný cieľ splnený! Výborne!</div>
      )}

      {!isComplete && nextReminder && (
        <div style={styles.nextReminder}>
          <span style={styles.reminderIcon}>⏰</span>
          Ďalší pohár o <strong>{formatTime(nextReminder)}</strong>
        </div>
      )}

      {notifPerm !== "granted" && (
        <button style={styles.notifBtnSm} onClick={onRequestNotif}>🔔 Povoliť upozornenia</button>
      )}

      {/* Schedule list */}
      <div style={styles.scheduleList}>
        {schedule.map((t, i) => {
          const isDone = drunk.includes(i);
          const isCurrent = !isDone && lastReminder === i;
          const isPast = t < now && !isDone;
          return (
            <div
              key={i}
              style={{
                ...styles.schedItem,
                ...(isDone ? styles.schedDone : {}),
                ...(isCurrent ? styles.schedCurrent : {}),
                ...(isPast && !isDone ? styles.schedMissed : {}),
              }}
              onClick={() => !isDone && drink(i)}
            >
              <span style={styles.schedTime}>{formatTime(t)}</span>
              <span style={styles.schedAmount}>{GLASS_ML} ml</span>
              <span style={styles.schedStatus}>
                {isDone ? "✅" : isPast ? "⚠️" : isCurrent ? "💧" : "○"}
              </span>
            </div>
          );
        })}
      </div>

      <p style={styles.hint}>Ťukni na riadok → označiť ako vypitý</p>
    </div>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;800&family=DM+Sans:wght@300;400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #030d1a; }

  .drop {
    position: absolute;
    background: radial-gradient(circle at 30% 30%, rgba(56,189,248,0.8), rgba(14,116,190,0.3));
    border-radius: 0 50% 50% 50%;
    transform: rotate(-45deg);
    animation: floatDrop linear infinite;
    opacity: 0;
  }
  @keyframes floatDrop {
    0% { transform: translateY(100vh) rotate(-45deg); opacity: 0; }
    10% { opacity: 0.6; }
    90% { opacity: 0.4; }
    100% { transform: translateY(-100px) rotate(-45deg); opacity: 0; }
  }
  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.04); }
    100% { transform: scale(1); }
  }
  input[type=range] {
    -webkit-appearance: none;
    width: 100%;
    height: 4px;
    background: rgba(56,189,248,0.3);
    border-radius: 2px;
    outline: none;
  }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #38bdf8;
    cursor: pointer;
  }
`;

const styles = {
  root: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #030d1a 0%, #051525 50%, #040f1e 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'DM Sans', sans-serif",
    position: "relative",
    overflow: "hidden",
    padding: "20px",
  },
  bg: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    zIndex: 0,
  },
  card: {
    position: "relative",
    zIndex: 1,
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(20px)",
    border: "1px solid rgba(56,189,248,0.15)",
    borderRadius: 24,
    width: "100%",
    maxWidth: 440,
    boxShadow: "0 8px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  setup: { padding: "36px 28px 32px" },
  logoWrap: { textAlign: "center", marginBottom: 28 },
  logoIcon: { fontSize: 44, display: "block", marginBottom: 8 },
  title: { fontFamily: "'Syne', sans-serif", fontSize: 32, fontWeight: 800, color: "#e0f2fe", letterSpacing: -1 },
  sub: { color: "#7dd3fc", fontSize: 14, marginTop: 4 },
  fields: { display: "flex", flexDirection: "column", gap: 14 },
  label: { color: "#94a3b8", fontSize: 12, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.8 },
  input: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(56,189,248,0.2)",
    borderRadius: 10,
    color: "#e0f2fe",
    fontSize: 18,
    padding: "10px 14px",
    outline: "none",
    fontFamily: "'DM Sans', sans-serif",
    width: "100%",
  },
  pills: { display: "flex", gap: 8, flexWrap: "wrap" },
  pill: {
    padding: "8px 16px",
    borderRadius: 20,
    border: "1px solid rgba(56,189,248,0.2)",
    background: "rgba(255,255,255,0.04)",
    color: "#94a3b8",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.2s",
  },
  pillActive: {
    background: "rgba(56,189,248,0.15)",
    border: "1px solid #38bdf8",
    color: "#38bdf8",
  },
  timeRow: { display: "flex", gap: 16 },
  timeWrap: { display: "flex", flexDirection: "column", gap: 6 },
  range: { width: "100%" },
  timeVal: { color: "#38bdf8", fontSize: 15, fontWeight: 600, textAlign: "center" },
  notifBtn: {
    background: "rgba(251,191,36,0.1)",
    border: "1px solid rgba(251,191,36,0.3)",
    color: "#fbbf24",
    borderRadius: 10,
    padding: "10px",
    cursor: "pointer",
    fontSize: 14,
    fontFamily: "'DM Sans', sans-serif",
  },
  notifBtnSm: {
    background: "rgba(251,191,36,0.1)",
    border: "1px solid rgba(251,191,36,0.3)",
    color: "#fbbf24",
    borderRadius: 8,
    padding: "7px 14px",
    cursor: "pointer",
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    alignSelf: "center",
  },
  notifOk: { color: "#4ade80", fontSize: 13, textAlign: "center" },
  startBtn: {
    background: "linear-gradient(135deg, #0ea5e9, #0284c7)",
    border: "none",
    borderRadius: 12,
    color: "#fff",
    fontSize: 16,
    fontWeight: 600,
    padding: "14px",
    cursor: "pointer",
    fontFamily: "'Syne', sans-serif",
    letterSpacing: 0.5,
    boxShadow: "0 4px 20px rgba(14,165,233,0.4)",
    marginTop: 4,
  },
  tracker: { padding: "28px 24px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 },
  trackerHeader: { display: "flex", alignItems: "center", width: "100%", gap: 12 },
  backBtn: { background: "none", border: "none", color: "#7dd3fc", cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif", padding: 0 },
  trackerTitle: { fontFamily: "'Syne', sans-serif", color: "#e0f2fe", fontSize: 20, fontWeight: 700 },
  circleWrap: { position: "relative", width: 180, height: 180 },
  circleCenter: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  pctText: { fontFamily: "'Syne', sans-serif", fontSize: 36, fontWeight: 800, color: "#38bdf8" },
  mlText: { color: "#7dd3fc", fontSize: 12, marginTop: 2 },
  glassText: { color: "#94a3b8", fontSize: 12 },
  successBanner: {
    background: "rgba(74,222,128,0.12)",
    border: "1px solid rgba(74,222,128,0.3)",
    color: "#4ade80",
    borderRadius: 12,
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 500,
    textAlign: "center",
    width: "100%",
  },
  nextReminder: {
    background: "rgba(56,189,248,0.08)",
    border: "1px solid rgba(56,189,248,0.2)",
    color: "#e0f2fe",
    borderRadius: 12,
    padding: "10px 16px",
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  reminderIcon: { fontSize: 18 },
  scheduleList: { width: "100%", display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" },
  schedItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 10,
    padding: "10px 14px",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  schedDone: { opacity: 0.45, background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)" },
  schedCurrent: { border: "1px solid rgba(56,189,248,0.5)", background: "rgba(56,189,248,0.1)" },
  schedMissed: { border: "1px solid rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.05)" },
  schedTime: { color: "#e0f2fe", fontSize: 15, fontWeight: 600, fontFamily: "'Syne', sans-serif" },
  schedAmount: { color: "#7dd3fc", fontSize: 13 },
  schedStatus: { fontSize: 18 },
  hint: { color: "#475569", fontSize: 12, textAlign: "center" },
};
