import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "dewpoint_v2";
const HISTORY_KEY = "dewpoint_history";

function calcDailyGoal({ weight, activity, climate, gender, age }) {
  let base = weight * 35;
  if (gender === "female") base = weight * 31;
  if (activity === "moderate") base += 350;
  if (activity === "high") base += 700;
  if (climate === "hot") base += 500;
  const a = parseInt(age);
  if (a >= 70) base += 400;
  else if (a >= 55) base += 200;
  return Math.round(base / 50) * 50;
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
}

function buildSchedule(goal, wakeHour, sleepHour, glassSize) {
  const gs = parseInt(glassSize) || 250;
  const glasses = Math.ceil(goal / gs);
  const totalMinutes = (sleepHour - wakeHour) * 60;
  const interval = Math.floor(totalMinutes / glasses);
  const times = [];
  const today = new Date();
  for (let i = 0; i < glasses; i++) {
    const d = new Date(today);
    d.setHours(wakeHour, 0, 0, 0);
    d.setMinutes(d.getMinutes() + i * interval);
    if (d.getHours() < sleepHour) times.push(d.toISOString());
  }
  return times;
}

function isToday(isoString) {
  const d = new Date(isoString), now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function calcDynamicAmounts(schedule, drunk, skipped, goal, glassSize) {
  const gs = parseInt(glassSize) || 250;
  const drunkMl = drunk.length * gs;
  const remainingMl = goal - drunkMl;
  const remaining = schedule.map((_, i) => i).filter(i => !drunk.includes(i) && !skipped.includes(i));
  const amounts = {};
  schedule.forEach((_, i) => {
    if (drunk.includes(i)) { amounts[i] = gs; return; }
    if (skipped.includes(i)) { amounts[i] = 0; return; }
    amounts[i] = remaining.length > 0 ? Math.round(remainingMl / remaining.length / 10) * 10 : gs;
  });
  return amounts;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s.schedule?.length > 0 && !isToday(s.schedule[0]))
      return { ...s, schedule: [], drunk: [], skipped: [], step: "setup" };
    return s;
  } catch { return null; }
}

function saveState(s) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} }
function loadHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}"); } catch { return {}; } }
function saveHistory(h) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch {} }

function calcStreak(history) {
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    if (i > 0) d.setDate(d.getDate() - 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    if (history[key]?.completed) streak++;
    else if (i > 0) break;
  }
  return streak;
}

function getLast7Days(history) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    days.push({ key, label: d.toLocaleDateString("sk-SK", { weekday: "short" }), pct: history[key]?.pct || 0, completed: history[key]?.completed || false });
  }
  return days;
}

const C = {
  black: "#0a0f02", dark: "#1a2505", mid: "#2a3a06",
  muted: "rgba(10,15,2,0.55)", neonDeep: "#3d6600",
  orange: "#c44400", green: "#0f6600", neon: "#c8f135",
};

const DROPS = [
  [4,3,55,0.0,7,0.55],[9,2,38,1.8,9,0.4],[14,4,72,0.5,11,0.6],
  [19,2,44,3.1,8,0.45],[24,3,60,1.2,10,0.55],[29,2,32,0.3,7,0.38],
  [34,5,85,2.4,12,0.65],[39,2,42,4.0,9,0.42],[44,3,66,0.8,10,0.58],
  [49,2,36,2.0,8,0.4],[54,4,78,1.5,11,0.62],[59,2,40,3.5,9,0.43],
  [64,3,58,0.6,10,0.52],[69,2,34,1.3,7,0.38],[74,4,80,2.8,12,0.6],
  [79,2,38,0.2,8,0.42],[84,3,62,1.9,10,0.55],[89,2,44,3.3,9,0.45],[94,3,52,0.9,10,0.5],
];
const STATIC_DROPS = [
  [6,18,7,4.5,0.22],[17,32,5,3,0.18],[27,8,9,6,0.25],[36,48,6,3.8,0.2],
  [46,22,8,5,0.22],[55,38,5,3.2,0.17],[66,12,7,4.5,0.2],[75,55,6,3.8,0.22],
  [83,28,8,5,0.19],[91,44,5,3.2,0.18],[11,62,6,4,0.15],[22,75,9,5.5,0.2],
];

function GlassDrop({ size = 56 }) {
  return (
    <svg viewBox="0 0 60 75" width={size} height={size * 1.25} fill="none">
      <defs>
        <linearGradient id="df" x1="20" y1="5" x2="45" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(255,255,255,0.92)" />
          <stop offset="40%" stopColor="rgba(255,255,255,0.6)" />
          <stop offset="100%" stopColor="rgba(155,215,0,0.55)" />
        </linearGradient>
        <linearGradient id="ds" x1="10" y1="5" x2="50" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
          <stop offset="100%" stopColor="rgba(120,190,0,0.45)" />
        </linearGradient>
        <filter id="dsf"><feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="rgba(70,130,0,0.3)" /></filter>
      </defs>
      <ellipse cx="30" cy="71" rx="13" ry="3" fill="rgba(40,80,0,0.14)" />
      <path d="M30 4 C30 4 9 28 9 44 C9 57 18 67 30 67 C42 67 51 57 51 44 C51 28 30 4 30 4Z"
        fill="url(#df)" stroke="url(#ds)" strokeWidth="0.8" filter="url(#dsf)" />
    </svg>
  );
}

function SegGroup({ options, value, onChange }) {
  return (
    <div style={{ display:"flex", gap:6 }}>
      {options.map(([v,l]) => (
        <button key={v} style={{ flex:1, padding:"9px 4px", borderRadius:10, cursor:"pointer", fontFamily:"'Outfit',sans-serif", fontWeight:600, fontSize:13, transition:"all 0.2s", border:value===v?`1.5px solid ${C.black}`:"1px solid rgba(10,15,2,0.18)", background:value===v?C.black:"rgba(255,255,255,0.4)", color:value===v?C.neon:C.dark }}
          onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

const bnr = (color, align) => ({ background:"rgba(255,255,255,0.5)", border:`1.5px solid ${color}`, color, borderRadius:12, padding:"10px 16px", fontSize:13, width:"100%", textAlign:align, fontWeight:700 });
const lbl_ = { fontFamily:"'DM Mono',monospace", fontSize:10, color:"#1a2505", letterSpacing:1.5, textTransform:"uppercase", display:"block", marginBottom:7, fontWeight:500 };
const inp_ = { width:"100%", background:"rgba(255,255,255,0.52)", border:"1.5px solid rgba(10,15,2,0.18)", borderRadius:12, color:"#0a0f02", fontSize:20, fontWeight:700, padding:"9px 32px 9px 12px", outline:"none", fontFamily:"'Outfit',sans-serif" };

export default function App() {
  const saved = loadState();
  const [step, setStep] = useState(saved?.step || "setup");
  const [tab, setTab] = useState("today");
  const [form, setForm] = useState(saved?.form || { weight:"", age:"", gender:"male", activity:"low", climate:"normal", wake:7, sleep:23, glassSize:"250" });
  const [goal, setGoal] = useState(saved?.goal || null);
  const [schedule, setSchedule] = useState(saved?.schedule || []);
  const [drunk, setDrunk] = useState(saved?.drunk || []);
  const [skipped, setSkipped] = useState(saved?.skipped || []);
  const [notifPerm, setNotifPerm] = useState("default");
  const [lastReminder, setLastReminder] = useState(null);
  const [pulse, setPulse] = useState(false);
  const [now, setNow] = useState(new Date());
  const [history, setHistory] = useState(loadHistory());

  const gs = parseInt(form.glassSize) || 250;

  useEffect(() => { saveState({ step, form, goal, schedule, drunk, skipped }); }, [step, form, goal, schedule, drunk, skipped]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  useEffect(() => { if ("Notification" in window) setNotifPerm(Notification.permission); }, []);

  useEffect(() => {
    if (!goal || step !== "tracker") return;
    const drunkMl = drunk.length * gs;
    const pct = Math.min(100, Math.round((drunkMl / goal) * 100));
    const completed = drunkMl >= goal;
    const key = todayKey();
    const newHistory = { ...history, [key]: { pct, completed, goal, drunkMl } };
    setHistory(newHistory);
    saveHistory(newHistory);
  }, [drunk, goal, step]);

  useEffect(() => {
    if ("Notification" in window && notifPerm === "granted") {
      const n = new Date();
      if (n.getHours() === (form.wake || 7) && n.getMinutes() === 0) {
        new Notification("💧 Dewy Point — Nový deň!", { body: "You look thirsty. Let's fix it.", icon: "/icon-192.png" });
      }
    }
  }, [now]);

  const requestNotif = async () => {
    if ("Notification" in window) { const p = await Notification.requestPermission(); setNotifPerm(p); }
  };

  const handleStart = () => {
    if (!form.weight || isNaN(form.weight) || !form.age || isNaN(form.age)) return;
    const g = calcDailyGoal(form);
    setGoal(g); setSchedule(buildSchedule(g, form.wake, form.sleep, form.glassSize));
    setDrunk([]); setSkipped([]); setStep("tracker"); setTab("today");
  };

  const amounts = goal ? calcDynamicAmounts(schedule, drunk, skipped, goal, form.glassSize) : {};
  const drunkMl = drunk.reduce((sum, i) => sum + (amounts[i] || gs), 0);
  const pct = goal ? Math.min(100, Math.round((drunkMl / goal) * 100)) : 0;
  const remainingGlasses = schedule.filter((_, i) => !drunk.includes(i) && !skipped.includes(i)).length;
  const missedCount = skipped.length;
  const catchUpMl = goal ? Math.max(0, goal - drunkMl) : 0;
  const nextReminder = schedule.find((t, i) => !drunk.includes(i) && !skipped.includes(i) && new Date(t) > now);
  const streak = calcStreak(history);
  const last7 = getLast7Days(history);
  const isComplete = drunkMl >= goal;

  const checkReminders = useCallback(() => {
    if (!schedule.length) return;
    for (let i = 0; i < schedule.length; i++) {
      const t = new Date(schedule[i]);
      const diff = new Date() - t;
      if (diff >= 0 && diff < 600000 && !drunk.includes(i) && !skipped.includes(i)) {
        if (lastReminder !== i) {
          setLastReminder(i); setPulse(true); setTimeout(() => setPulse(false), 800);
          if (notifPerm === "granted") {
            new Notification("💧 Dewy Point", { body:`${formatTime(schedule[i])} — vypij ${amounts[i] || gs} ml`, icon:"/icon-192.png", tag:"dewpoint", renotify:true });
          }
        }
        break;
      }
    }
  }, [schedule, drunk, skipped, notifPerm, lastReminder, amounts]);

  useEffect(() => {
    if (step !== "tracker") return;
    const t = setInterval(checkReminders, 60000);
    checkReminders();
    return () => clearInterval(t);
  }, [step, checkReminders]);

  const drink = (i) => { if (drunk.includes(i)||skipped.includes(i)) return; setDrunk(d=>[...d,i]); setPulse(true); setTimeout(()=>setPulse(false),800); };
  const skip = (i) => { if (drunk.includes(i)||skipped.includes(i)) return; setSkipped(s=>[...s,i]); };
  const undoDrink = (i) => setDrunk(d=>d.filter(x=>x!==i));
  const undoSkip = (i) => setSkipped(s=>s.filter(x=>x!==i));

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#d4f545 0%,#b5e020 45%,#c8f135 100%)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Outfit',sans-serif", position:"relative", overflow:"hidden", padding:20 }}>
      <style>{css}</style>

      <div style={{ position:"fixed", inset:0, zIndex:1, pointerEvents:"none", overflow:"hidden" }}>
        {DROPS.map(([left,w,h,delay,dur,op],i) => (
          <div key={i} style={{ position:"absolute", left:`${left}%`, top:0, width:w, display:"flex", flexDirection:"column", alignItems:"center", animation:`fallDown ${dur}s ${delay}s linear infinite`, opacity:op }}>
            <div style={{ width:Math.max(1.5,w*0.45), height:h, background:"linear-gradient(180deg,rgba(255,255,255,0) 0%,rgba(255,255,255,0.7) 40%,rgba(255,255,255,0.9) 100%)", borderRadius:999 }} />
            <div style={{ width:w*1.1, height:w*0.75, background:"rgba(255,255,255,0.85)", borderRadius:"50%", marginTop:-1 }} />
          </div>
        ))}
        {STATIC_DROPS.map(([left,top,w,h,op],i) => (
          <div key={`s${i}`} style={{ position:"absolute", left:`${left}%`, top:`${top}%`, width:w, height:h, background:"rgba(255,255,255,0.75)", borderRadius:"50% 50% 50% 50% / 40% 40% 60% 60%", opacity:op }} />
        ))}
      </div>
      <div style={{ position:"fixed", inset:0, zIndex:1, pointerEvents:"none", background:"linear-gradient(180deg,rgba(255,255,255,0.1) 0%,rgba(255,255,255,0.03) 50%,rgba(255,255,255,0.07) 100%)" }} />

      <div style={{ position:"relative", zIndex:2, width:"100%", maxWidth:420, background:"rgba(255,255,255,0.35)", backdropFilter:"blur(30px) saturate(1.5)", WebkitBackdropFilter:"blur(30px) saturate(1.5)", border:"1px solid rgba(255,255,255,0.65)", borderRadius:24, boxShadow:"inset 0 2px 0 rgba(255,255,255,0.85), 0 16px 56px rgba(70,120,0,0.18)" }}>
        {step === "setup"
          ? <Setup form={form} setForm={setForm} onStart={handleStart} notifPerm={notifPerm} onRequestNotif={requestNotif} hasSaved={!!saved?.goal} streak={streak} />
          : <TrackerShell tab={tab} setTab={setTab} onReset={()=>{setDrunk([]);setSkipped([]);setStep("setup");}}>
              {tab === "today" && <TodayTab goal={goal} schedule={schedule} drunk={drunk} skipped={skipped} drunkMl={drunkMl} pct={pct} nextReminder={nextReminder} pulse={pulse} now={now} drink={drink} skip={skip} undoDrink={undoDrink} undoSkip={undoSkip} notifPerm={notifPerm} onRequestNotif={requestNotif} lastReminder={lastReminder} amounts={amounts} missedCount={missedCount} catchUpMl={catchUpMl} remainingGlasses={remainingGlasses} age={form.age} isComplete={isComplete} gs={gs} />}
              {tab === "history" && <HistoryTab last7={last7} history={history} />}
              {tab === "badges" && <BadgesTab streak={streak} history={history} />}
            </TrackerShell>
        }
      </div>
    </div>
  );
}

function Setup({ form, setForm, onStart, notifPerm, onRequestNotif, hasSaved, streak }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.weight && !isNaN(form.weight) && form.age && !isNaN(form.age);
  const a = parseInt(form.age);
  const ageTag = a >= 70 ? "+400 ml" : a >= 55 ? "+200 ml" : null;
  const preview = valid ? calcDailyGoal(form) : null;

  return (
    <div style={{ padding:"36px 24px 32px" }}>
      <div style={{ textAlign:"center", marginBottom:28 }}>
        <div style={{ marginBottom:12, display:"flex", justifyContent:"center" }} className="dropAnim"><GlassDrop size={56} /></div>
        <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:26, fontWeight:900, color:C.black, letterSpacing:6 }}>DEWY POINT</div>
        <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:17, fontStyle:"italic", color:C.dark, marginTop:6 }}>You look thirsty. Let's fix it.</div>
        {streak > 0 && <div style={{ marginTop:8, fontSize:12, color:C.neonDeep, fontWeight:700 }}>🔥 {streak} dní v rade</div>}
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        <div style={{ display:"flex", gap:10 }}>
          {[["weight","Hmotnosť","kg","75"],["age","Vek","r.","32"]].map(([key,lbl,unit,ph]) => (
            <div key={key} style={{ flex:1 }}>
              <label style={lbl_}>{lbl} {key==="age"&&ageTag&&<span style={{color:C.orange,fontWeight:700}}>{ageTag}</span>}</label>
              <div style={{ position:"relative" }}>
                <input style={inp_} type="number" placeholder={ph} value={form[key]} onChange={e=>set(key,e.target.value)} />
                <span style={{ position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",color:C.mid,fontSize:11,fontFamily:"'DM Mono',monospace",fontWeight:500 }}>{unit}</span>
              </div>
            </div>
          ))}
        </div>

        <div>
          <label style={lbl_}>Veľkosť pohára / fľaše</label>
          <div style={{ display:"flex", gap:6 }}>
            {[["150","150 ml"],["250","250 ml"],["330","330 ml"],["500","500 ml"],["750","750 ml"]].map(([v,l]) => (
              <button key={v} style={{ flex:1, padding:"7px 2px", borderRadius:10, cursor:"pointer", fontFamily:"'Outfit',sans-serif", fontWeight:600, fontSize:11, border:form.glassSize===v?`1.5px solid ${C.black}`:"1px solid rgba(10,15,2,0.18)", background:form.glassSize===v?C.black:"rgba(255,255,255,0.4)", color:form.glassSize===v?C.neon:C.dark }} onClick={()=>set("glassSize",v)}>{l}</button>
            ))}
          </div>
        </div>

        <div><label style={lbl_}>Pohlavie</label><SegGroup options={[["male","Muž"],["female","Žena"]]} value={form.gender} onChange={v=>set("gender",v)} /></div>
        <div><label style={lbl_}>Aktivita</label><SegGroup options={[["low","Nízka"],["moderate","Stredná"],["high","Vysoká"]]} value={form.activity} onChange={v=>set("activity",v)} /></div>
        <div><label style={lbl_}>Klíma</label><SegGroup options={[["normal","☁️ Bežná"],["hot","☀️ Horúca"]]} value={form.climate} onChange={v=>set("climate",v)} /></div>

        <div style={{ display:"flex", gap:16 }}>
          {[["wake","Vstávam",4,12],["sleep","Spím o",20,26]].map(([key,lbl,min,max]) => (
            <div key={key} style={{ flex:1 }}>
              <label style={lbl_}>{lbl}</label>
              <input type="range" min={min} max={max} value={form[key]} onChange={e=>set(key,+e.target.value)} className="lightRange" />
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:14, color:C.black, textAlign:"center", marginTop:5, fontWeight:700 }}>
                {String(form[key]%24).padStart(2,"0")}:00
              </div>
            </div>
          ))}
        </div>

        {preview && (
          <div style={{ background:"rgba(255,255,255,0.5)", border:`1.5px solid ${C.neonDeep}`, borderRadius:12, padding:"10px 16px", textAlign:"center" }}>
            <div style={{ fontSize:10, color:C.mid, fontFamily:"'DM Mono',monospace", letterSpacing:1 }}>DENNÝ CIEĽ</div>
            <div style={{ fontSize:26, fontWeight:900, color:C.black, lineHeight:1.3 }}>{preview} ml</div>
            <div style={{ fontSize:11, color:C.mid }}>{Math.ceil(preview/(parseInt(form.glassSize)||250))} pohárov × {parseInt(form.glassSize)||250} ml</div>
          </div>
        )}

        {notifPerm !== "granted"
          ? <button style={{ background:"rgba(255,255,255,0.55)", border:`1.5px solid ${C.dark}`, color:C.dark, borderRadius:12, padding:11, cursor:"pointer", fontSize:13, fontFamily:"'Outfit',sans-serif", fontWeight:600 }} onClick={onRequestNotif}>🔔 Povoliť notifikácie</button>
          : <p style={{ color:C.green, fontSize:12, textAlign:"center", fontFamily:"'DM Mono',monospace", letterSpacing:1, fontWeight:500 }}>✓ NOTIFIKÁCIE AKTÍVNE</p>
        }

        <button style={{ background:valid?C.black:"rgba(10,15,2,0.12)", border:"none", borderRadius:14, color:valid?C.neon:C.muted, fontSize:15, fontWeight:800, padding:"15px 20px", cursor:valid?"pointer":"default", fontFamily:"'Outfit',sans-serif", letterSpacing:1, transition:"all 0.25s", display:"flex", alignItems:"center", justifyContent:"center", gap:8, boxShadow:valid?"0 4px 20px rgba(10,15,2,0.3)":"none" }}
          onClick={onStart} disabled={!valid}>
          {hasSaved?"NOVÝ DEŇ":"ŠTART"} <span style={{fontSize:18}}>→</span>
        </button>
      </div>
    </div>
  );
}

function TrackerShell({ tab, setTab, onReset, children }) {
  return (
    <div style={{ padding:"24px 22px 20px", display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:16, fontWeight:900, color:C.black, letterSpacing:5 }}>DEWY POINT</div>
          <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:13, fontStyle:"italic", color:C.dark }}>You look thirsty. Let's fix it.</div>
        </div>
        <button style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", opacity:0.6 }} onClick={onReset}>⚙️</button>
      </div>
      <div style={{ display:"flex", gap:6, background:"rgba(255,255,255,0.35)", borderRadius:12, padding:4 }}>
        {[["today","💧 Dnes"],["history","📊 História"],["badges","🏆 Odznaky"]].map(([t,l]) => (
          <button key={t} style={{ flex:1, padding:"7px 4px", borderRadius:9, border:"none", cursor:"pointer", fontFamily:"'Outfit',sans-serif", fontWeight:700, fontSize:12, transition:"all 0.2s", background:tab===t?C.black:"transparent", color:tab===t?C.neon:C.mid }}
            onClick={()=>setTab(t)}>{l}</button>
        ))}
      </div>
      {children}
    </div>
  );
}

function TodayTab({ goal, schedule, drunk, skipped, drunkMl, pct, nextReminder, pulse, now, drink, skip, undoDrink, undoSkip, notifPerm, onRequestNotif, lastReminder, amounts, missedCount, catchUpMl, remainingGlasses, age, isComplete, gs }) {
  const catchUpPerGlass = remainingGlasses > 0 ? Math.round(catchUpMl / remainingGlasses / 10) * 10 : 0;
  const a = parseInt(age);
  const R = 68, CX = 90, CY = 90, circ = 2 * Math.PI * R;
  const arcColor = isComplete ? C.green : missedCount > 0 ? C.orange : C.neonDeep;

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
      <div style={{ position:"relative", width:180, height:180, animation:pulse?"dpulse 0.7s ease":"none" }}>
        <svg width="180" height="180" viewBox="0 0 180 180">
          <circle cx={CX} cy={CY} r={R} fill="rgba(255,255,255,0.35)" stroke="rgba(10,15,2,0.1)" strokeWidth="10" />
          <circle cx={CX} cy={CY} r={R} fill="none" stroke={arcColor} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ*(1-pct/100)}
            transform={`rotate(-90 ${CX} ${CY})`}
            style={{transition:"stroke-dashoffset 0.7s cubic-bezier(.4,0,.2,1),stroke 0.4s"}} />
        </svg>
        <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" }}>
          <div style={{ fontFamily:"'Outfit',sans-serif",fontSize:48,fontWeight:900,color:arcColor,lineHeight:1 }}>{pct}<span style={{fontSize:20,fontWeight:600}}>%</span></div>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:11,color:C.dark,marginTop:3,fontWeight:500 }}>{drunkMl} / {goal} ml</div>
          <div style={{ fontSize:11,color:C.mid,marginTop:2,fontWeight:500 }}>💧 {drunk.length} × {gs} ml</div>
        </div>
      </div>

      {isComplete && <div style={bnr(C.green,"center")}>✦ CIEĽ SPLNENÝ — SKVELÁ PRÁCA!</div>}
      {!isComplete && missedCount > 0 && remainingGlasses > 0 && (
        <div style={{...bnr(C.orange,"left"),display:"flex",gap:10}}>
          <span style={{fontSize:18}}>⚡</span>
          <div><div style={{fontWeight:700}}>DOBIEHANIE — {missedCount} preskočené</div>
          <div style={{marginTop:2,color:C.dark,fontWeight:500}}>Každý pohár = <strong>{catchUpPerGlass} ml</strong> ({remainingGlasses} zostáva)</div></div>
        </div>
      )}
      {!isComplete && nextReminder && (
        <div style={{...bnr("rgba(10,15,2,0.2)","left"),display:"flex",gap:8,color:C.dark,fontWeight:500}}>
          <span>⏰</span><span>Ďalší pohár o <strong>{formatTime(nextReminder)}</strong></span>
        </div>
      )}
      {a >= 55 && !isComplete && <div style={{background:"rgba(255,255,255,0.35)",border:"1px solid rgba(10,15,2,0.12)",color:C.mid,borderRadius:10,padding:"7px 12px",fontSize:12,width:"100%",textAlign:"center",fontWeight:500}}>👴 Po 55-ke smäd klamie — pij pravidelne</div>}
      {notifPerm !== "granted" && <button style={{background:"rgba(255,255,255,0.5)",border:`1.5px solid ${C.dark}`,color:C.dark,borderRadius:10,padding:"7px 14px",cursor:"pointer",fontSize:12,fontFamily:"'Outfit',sans-serif",fontWeight:600}} onClick={onRequestNotif}>🔔 Povoliť upozornenia</button>}

      <div style={{width:"100%",display:"flex",flexDirection:"column",gap:5,maxHeight:260,overflowY:"auto"}}>
        {schedule.map((t, i) => {
          const isDone=drunk.includes(i), isSkip=skipped.includes(i);
          const isCur=lastReminder===i&&!isDone&&!isSkip;
          const isPast=new Date(t)<now&&!isDone&&!isSkip;
          const ml=amounts[i]||gs, isCatch=!isDone&&!isSkip&&ml>gs;
          return (
            <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",borderRadius:11,padding:"8px 12px",transition:"all 0.2s",background:isCur?"rgba(255,255,255,0.65)":"rgba(255,255,255,0.38)",border:isDone?"1px solid rgba(15,102,0,0.2)":isCur?`1.5px solid ${C.black}`:isPast?`1.5px solid ${C.orange}`:"1px solid rgba(255,255,255,0.6)",opacity:isSkip?0.3:1}}>
              <div style={{display:"flex",flexDirection:"column",gap:1}}>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:isDone?C.mid:C.black,fontWeight:600}}>{formatTime(t)}</span>
                <span style={{fontSize:11,color:isCatch?C.orange:C.mid,fontWeight:isCatch?700:500}}>{isDone||isSkip?`${gs} ml`:`${ml} ml`}{isCatch?" ⚡":""}</span>
              </div>
              <div style={{display:"flex",gap:5}}>
                {!isDone&&!isSkip&&<><button style={{background:C.black,border:"none",color:C.neon,borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:14,fontWeight:700}} onClick={()=>drink(i)}>✓</button><button style={{background:"rgba(255,255,255,0.55)",border:"1px solid rgba(10,15,2,0.18)",color:C.mid,borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:13,fontWeight:600}} onClick={()=>skip(i)}>✕</button></>}
                {isDone&&<button style={{background:"rgba(255,255,255,0.55)",border:"1px solid rgba(10,15,2,0.12)",color:C.mid,borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:13}} onClick={()=>undoDrink(i)}>↩</button>}
                {isSkip&&<button style={{background:"rgba(255,255,255,0.55)",border:"1px solid rgba(10,15,2,0.12)",color:C.mid,borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:13}} onClick={()=>undoSkip(i)}>↩</button>}
              </div>
            </div>
          );
        })}
      </div>
      <p style={{fontFamily:"'DM Mono',monospace",color:C.mid,fontSize:10,textAlign:"center",letterSpacing:0.5,fontWeight:500}}>✓ vypil som · ✕ preskočiť · ↩ späť</p>
    </div>
  );
}

function HistoryTab({ last7, history }) {
  const totalDays = Object.keys(history).filter(k=>history[k]?.completed).length;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:C.mid,letterSpacing:2,textTransform:"uppercase",fontWeight:500}}>Posledných 7 dní</div>
      <div style={{display:"flex",gap:6,alignItems:"flex-end",height:90}}>
        {last7.map((d,i) => (
          <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <div style={{fontSize:9,fontFamily:"'DM Mono',monospace",color:C.mid,fontWeight:500}}>{d.pct>0?`${d.pct}%`:""}</div>
            <div style={{width:"100%",background:"rgba(255,255,255,0.4)",borderRadius:6,height:70,display:"flex",alignItems:"flex-end",overflow:"hidden"}}>
              <div style={{width:"100%",height:`${d.pct}%`,background:d.completed?C.black:d.pct>0?"rgba(10,15,2,0.35)":"transparent",borderRadius:6,transition:"height 0.6s ease",minHeight:d.pct>0?4:0}} />
            </div>
            <div style={{fontSize:10,fontFamily:"'Outfit',sans-serif",color:C.dark,fontWeight:600}}>{d.label}</div>
            {d.completed&&<div style={{fontSize:12}}>✅</div>}
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:8}}>
        {[
          ["Splnených",`${last7.filter(d=>d.completed).length}/7`,"tento týždeň"],
          ["Priemer",`${Math.round(last7.reduce((s,d)=>s+d.pct,0)/7)}%`,"hydratácia"],
          ["Celkovo",`${totalDays}`,"splnených dní"],
        ].map(([label,val,sub]) => (
          <div key={label} style={{flex:1,background:"rgba(255,255,255,0.45)",border:"1px solid rgba(255,255,255,0.65)",borderRadius:12,padding:"10px 8px",textAlign:"center"}}>
            <div style={{fontSize:9,fontFamily:"'DM Mono',monospace",color:C.mid,letterSpacing:0.5}}>{label}</div>
            <div style={{fontSize:20,fontWeight:900,color:C.black,lineHeight:1.2}}>{val}</div>
            <div style={{fontSize:9,color:C.mid}}>{sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BadgesTab({ streak, history }) {
  const totalDays = Object.keys(history).filter(k=>history[k]?.completed).length;
  const allBadges = [
    {icon:"🌱",label:"Prvý deň",desc:"Splni cieľ 1×",unlocked:totalDays>=1},
    {icon:"🔥",label:"3 dni v rade",desc:"Streak 3 dni",unlocked:streak>=3},
    {icon:"⚡",label:"Týždeň",desc:"Streak 7 dní",unlocked:streak>=7},
    {icon:"💎",label:"2 týždne",desc:"Streak 14 dní",unlocked:streak>=14},
    {icon:"🏆",label:"Mesiac",desc:"Streak 30 dní",unlocked:streak>=30},
    {icon:"🌊",label:"5 dní",desc:"Celkovo 5×",unlocked:totalDays>=5},
    {icon:"🌟",label:"10 dní",desc:"Celkovo 10×",unlocked:totalDays>=10},
    {icon:"💫",label:"30 dní",desc:"Celkovo 30×",unlocked:totalDays>=30},
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{background:"rgba(255,255,255,0.5)",border:`2px solid ${streak>0?C.black:"rgba(10,15,2,0.15)"}`,borderRadius:14,padding:"14px 16px",textAlign:"center"}}>
        <div style={{fontSize:32}}>🔥</div>
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:36,fontWeight:900,color:C.black,lineHeight:1}}>{streak}</div>
        <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:C.mid,letterSpacing:1,marginTop:2}}>DNÍ V RADE</div>
        <div style={{fontSize:11,color:C.mid,marginTop:4}}>Celkovo splnených: {totalDays} dní</div>
      </div>
      <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:C.mid,letterSpacing:2,textTransform:"uppercase",fontWeight:500}}>Odznaky</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {allBadges.map((b,i) => (
          <div key={i} style={{background:b.unlocked?"rgba(255,255,255,0.55)":"rgba(255,255,255,0.2)",border:b.unlocked?`1.5px solid ${C.black}`:"1px solid rgba(10,15,2,0.1)",borderRadius:12,padding:"10px 12px",display:"flex",alignItems:"center",gap:10,opacity:b.unlocked?1:0.45}}>
            <div style={{fontSize:22,filter:b.unlocked?"none":"grayscale(1)"}}>{b.icon}</div>
            <div>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:700,color:C.black}}>{b.label}</div>
              <div style={{fontSize:10,color:C.mid}}>{b.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:#c8f135; }
  @keyframes fallDown { 0% { transform:translateY(-120px); opacity:0; } 6% { opacity:1; } 90% { opacity:1; } 100% { transform:translateY(105vh); opacity:0; } }
  @keyframes dpulse { 0% { transform:scale(1); } 50% { transform:scale(1.05); } 100% { transform:scale(1); } }
  .dropAnim { animation:dropFloat 3.5s ease-in-out infinite; }
  @keyframes dropFloat { 0%,100% { transform:translateY(0); filter:drop-shadow(0 8px 18px rgba(70,130,0,0.22)); } 50% { transform:translateY(-7px); filter:drop-shadow(0 16px 24px rgba(70,130,0,0.32)); } }
  .lightRange { -webkit-appearance:none; width:100%; height:3px; background:rgba(10,15,2,0.18); border-radius:2px; outline:none; }
  .lightRange::-webkit-slider-thumb { -webkit-appearance:none; width:20px; height:20px; border-radius:50%; background:#0a0f02; cursor:pointer; box-shadow:0 2px 8px rgba(10,15,2,0.3); }
  ::-webkit-scrollbar { width:3px; }
  ::-webkit-scrollbar-thumb { background:rgba(10,15,2,0.18); border-radius:2px; }
  button { transition:opacity 0.15s,transform 0.1s; }
  button:active { opacity:0.7; transform:scale(0.96); }
  input[type=number]::-webkit-inner-spin-button { opacity:0; }
  input::placeholder { color:rgba(10,15,2,0.28); }
`;
