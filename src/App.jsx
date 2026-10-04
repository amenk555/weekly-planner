import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://vsepkhuppboolbtbkszj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZXBraHVwcGJvb2xidGJrc3pqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzU0ODgsImV4cCI6MjA4ODI1MTQ4OH0.w9ZVBfxJ-ZPM7cSaztoDnzjYMonEJL5p2s0qUSWMIBA";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const saveStorage = async (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  try { await supabase.from("planner_data").upsert({ key: k, value: v }, { onConflict: "key" }); } catch (e) { console.error("Supabase save error:", e); }
};
const loadStorage = async (k) => {
  try {
    const { data } = await supabase.from("planner_data").select("value").eq("key", k).single();
    if (data?.value !== undefined && data?.value !== null) {
      localStorage.setItem(k, JSON.stringify(data.value));
      return data.value;
    }
  } catch {}
  try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; }
};

const THEMES = {
  light: {
    bg: "#F7F8FA", surface: "#FFFFFF", surfaceAlt: "#F3F4F6",
    text: "#111827", muted: "#6B7280", dim: "#9CA3AF", border: "rgba(17,24,39,0.08)",
    accent: "#4F46E5", green: "#16A34A", amber: "#D97706", slate: "#64748B", danger: "#DC2626",
    accentDim: "rgba(79,70,229,0.08)", accentGlow: "rgba(79,70,229,0.15)",
    greenDim: "rgba(22,163,74,0.08)",
    amberDim: "rgba(217,119,6,0.07)", slateDim: "rgba(100,116,139,0.06)",
    btn: "rgba(0,0,0,0.04)", track: "rgba(0,0,0,0.06)", weekendBg: "#EEF0F3", scroll: "#D1D5DB",
  },
  dark: {
    bg: "#0F1115", surface: "#171A21", surfaceAlt: "#1D2129",
    text: "#E5E7EB", muted: "#9CA3AF", dim: "#6B7280", border: "rgba(255,255,255,0.08)",
    accent: "#6366F1", green: "#4ADE80", amber: "#FBBF24", slate: "#94A3B8", danger: "#F87171",
    accentDim: "rgba(99,102,241,0.14)", accentGlow: "rgba(99,102,241,0.25)",
    greenDim: "rgba(74,222,128,0.07)",
    amberDim: "rgba(251,191,36,0.07)", slateDim: "rgba(148,163,184,0.07)",
    btn: "rgba(255,255,255,0.06)", track: "rgba(255,255,255,0.1)", weekendBg: "#14171D", scroll: "#374151",
  },
};
// Styles reference CSS variables so switching themes is just flipping data-theme on <html>.
const C = Object.fromEntries(Object.keys(THEMES.light).map(k => [k, `var(--${k})`]));
const themeVars = (t) => Object.entries(t).map(([k, v]) => `--${k}: ${v};`).join(" ");
document.head.insertAdjacentHTML("beforeend", `<style>
  :root { ${themeVars(THEMES.light)} }
  [data-theme="dark"] { ${themeVars(THEMES.dark)} color-scheme: dark; }
  body { background: var(--bg); }
</style>`);
const THEME_KEY = "planner-theme";
try { document.documentElement.dataset.theme = localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"; } catch { document.documentElement.dataset.theme = "light"; }
const font = { heading: "Arial, Helvetica, sans-serif", body: "Arial, Helvetica, sans-serif" };

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Weekend"];
const BLOCKS = [
  { key: "Morning", label: "Morning", icon: "\u25D0", color: C.green, dim: C.greenDim },
  { key: "Afternoon", label: "Afternoon", icon: "\u25D1", color: C.accent, dim: C.accentDim },
  { key: "Admin", label: "Admin", icon: "\u25A4", color: C.slate, dim: C.slateDim },
];
const LISTS = [
  { key: "This Week", label: "This Week", icon: "\u26A1" },
  { key: "Next 30 Days", label: "Next 30 Days", icon: "\u25C7" },
  { key: "Radar", label: "Radar", icon: "\u25C9" },
  { key: "Think", label: "Think", icon: "\u25B3" },
  { key: "Other", label: "Other", icon: "\u25CB" },
];

const genId = () => Math.random().toString(36).substr(2, 9);
const getWeekKey = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Sunday goes back 6, otherwise back to Monday
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return monday.toISOString().split("T")[0];
};
const getWeekLabel = (wk) => {
  const mon = new Date(wk + "T00:00:00");
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  const f = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${f(mon)} \u2013 ${f(sun)}, ${mon.getFullYear()}`;
};
const getAdjacentWeek = (wk, off) => {
  const d = new Date(wk + "T00:00:00");
  d.setDate(d.getDate() + 7 * off);
  return getWeekKey(d);
};
const emptyWeek = () => { const days = {}; DAYS.forEach(d => { days[d] = {}; BLOCKS.forEach(b => { days[d][b.key] = []; }); }); return { priorities: "", days }; };
const emptyLists = () => { const l = {}; LISTS.forEach(li => { l[li.key] = []; }); return l; };

// Parse task text for bold (*) and bold+red (**) prefixes
const parseTaskText = (text) => {
  if (text.startsWith(">>")) return { display: text.slice(2).trim(), bold: false, red: false, admin: true };
  if (text.startsWith("**")) return { display: text.slice(2), bold: true, red: true };
  if (text.startsWith("*")) return { display: text.slice(1), bold: true, red: false };
  return { display: text, bold: false, red: false };
};

// List order: open tasks, then open ">>" admin tasks, then completed. Stable sort keeps manual order within each group.
const taskRank = (t) => (t.done ? 2 : t.text.startsWith(">>") ? 1 : 0);
const sortTasks = (arr) => arr.sort((a, b) => taskRank(a) - taskRank(b));
const sortWeek = (wk) => { Object.values(wk?.days || {}).forEach(day => Object.values(day || {}).forEach(a => Array.isArray(a) && sortTasks(a))); return wk; };
const sortLists = (l) => { Object.values(l || {}).forEach(a => Array.isArray(a) && sortTasks(a)); return l; };

// Completed tasks sink to the bottom; unchecked tasks return to the end of the open ones.
const toggleAndReposition = (arr, id) => {
  const i = arr.findIndex(t => t.id === id);
  if (i === -1) return;
  const [t] = arr.splice(i, 1);
  t.done = !t.done;
  if (t.done) arr.push(t);
  else { const firstDone = arr.findIndex(x => x.done); arr.splice(firstDone === -1 ? arr.length : firstDone, 0, t); }
};

let dragPayload = null;

function DropZone({ onDrop, children, style }) {
  const [over, setOver] = useState(false);
  return (
    <div onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); if (dragPayload) { onDrop(dragPayload); dragPayload = null; } }}
      style={{ ...style, outline: over ? `2px dashed ${C.accent}` : "2px dashed transparent", outlineOffset: -2, borderRadius: 8, transition: "outline 0.15s, background 0.15s", background: over ? C.accentDim : (style?.background || "transparent") }}
    >{children}</div>
  );
}

// Reorder drop target between tasks
function ReorderDropZone({ onDrop, children }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; setOver(true); }}
      onDragLeave={e => { e.stopPropagation(); setOver(false); }}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); if (dragPayload) { onDrop(dragPayload); dragPayload = null; } }}
      style={{ borderTop: over ? `2px solid ${C.accent}` : "2px solid transparent", transition: "border-color 0.1s", minHeight: 2 }}
    >{children}</div>
  );
}

function TaskItem({ task, onToggle, onUpdate, onDelete, dragType, dragZone, index }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.text);
  const ref = useRef(null);
  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);
  const save = () => { if (text.trim()) onUpdate(task.id, text.trim()); else onDelete(task.id); setEditing(false); };
  const parsed = parseTaskText(task.text);
  return (
    <div draggable={!editing}
      onDragStart={e => { dragPayload = { task: { ...task }, type: dragType, zone: dragZone, index }; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", task.id); e.currentTarget.style.opacity = "0.4"; }}
      onDragEnd={e => { e.currentTarget.style.opacity = "1"; }}
      style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "5px 6px", borderRadius: 6, background: task.done ? C.surfaceAlt : "transparent", cursor: editing ? "text" : "grab", opacity: task.done ? 0.45 : 1, transition: "all 0.15s" }}>
      <button onClick={() => onToggle(task.id)} style={{ width: 16, height: 16, minWidth: 16, marginTop: 2, borderRadius: 4, padding: 0, border: task.done ? "none" : `1.5px solid ${C.dim}`, background: task.done ? C.accent : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {task.done && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5L4.5 7.5L8 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </button>
      {editing ? (
        <input ref={ref} value={text} onChange={e => setText(e.target.value)} onBlur={save}
          onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setText(task.text); setEditing(false); } }}
          style={{ flex: 1, border: "none", borderBottom: `1px solid ${C.accent}`, outline: "none", fontSize: 16, fontFamily: font.body, background: "transparent", padding: "1px 0", color: C.text }} />
      ) : (
        <span onClick={() => { setEditing(true); setText(task.text); }}
          style={{
            flex: 1, fontSize: 13, fontFamily: font.body, cursor: "text",
            textDecoration: task.done ? "line-through" : "none",
            color: task.done ? C.dim : parsed.red ? C.danger : C.text,
            fontWeight: parsed.bold ? 700 : 400,
            fontStyle: parsed.admin ? "italic" : "normal",
            lineHeight: 1.45, wordBreak: "break-word",
          }}>{parsed.admin && <span style={{ fontStyle: "normal", fontWeight: 600, color: C.muted, marginRight: 4 }}>(A)</span>}{parsed.display}</span>
      )}
      <button onClick={() => onDelete(task.id)}
        style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1, marginTop: 1, flexShrink: 0 }}
        onMouseEnter={e => e.target.style.color = C.danger} onMouseLeave={e => e.target.style.color = C.dim}>{"\u00D7"}</button>
    </div>
  );
}

function AddTask({ onAdd, placeholder }) {
  const [text, setText] = useState("");
  const submit = () => { if (text.trim()) { onAdd(text.trim()); setText(""); } };
  return (
    <div style={{ display: "flex", gap: 4, marginTop: 4, alignItems: "center" }}>
      <span style={{ color: C.dim, fontSize: 14, flexShrink: 0, paddingLeft: 2 }}>+</span>
      <input value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        onBlur={submit}
        placeholder={placeholder || "Add task..."} style={{ flex: 1, border: "none", outline: "none", fontFamily: font.body, fontSize: 16, background: "transparent", color: C.text, padding: "4px 0" }} />
    </div>
  );
}

// Hamburger menu
function HamburgerMenu({ onExport }) {
  const [open, setOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("touchstart", close); };
  }, [open]);

  const menuBtnStyle = {
    width: "100%", padding: "12px 16px", border: "none", background: "transparent",
    textAlign: "left", cursor: "pointer", fontFamily: font.body, fontSize: 13, color: C.text,
    display: "flex", alignItems: "center", gap: 10,
  };

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button onClick={() => setOpen(p => !p)} style={{
        background: open ? C.accentDim : C.btn, border: `1px solid ${open ? "rgba(79,70,229,0.3)" : C.border}`,
        color: open ? C.accent : C.muted, borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 16, fontFamily: font.body, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="16" height="14" viewBox="0 0 16 14" fill="none">
          <rect y="0" width="16" height="2" rx="1" fill="currentColor"/>
          <rect y="6" width="16" height="2" rx="1" fill="currentColor"/>
          <rect y="12" width="16" height="2" rx="1" fill="currentColor"/>
        </svg>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, background: C.surface,
          borderRadius: 10, boxShadow: "0 8px 30px rgba(0,0,0,0.12)", border: `1px solid ${C.border}`,
          minWidth: 200, zIndex: 200, overflow: "hidden",
        }}>
          <button onClick={() => { onExport(); setOpen(false); }} style={menuBtnStyle}
            onMouseEnter={e => e.currentTarget.style.background = C.surfaceAlt}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <span style={{ fontSize: 15 }}>{"\u2193"}</span> Export Planner
          </button>
          <div style={{ height: 1, background: C.border }} />
          <button onClick={() => { setShowHelp(true); setOpen(false); }} style={menuBtnStyle}
            onMouseEnter={e => e.currentTarget.style.background = C.surfaceAlt}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <span style={{ fontSize: 15 }}>?</span> How to Use
          </button>
        </div>
      )}
      {showHelp && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={() => setShowHelp(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 14, padding: 24, width: 480, maxWidth: "100%", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 20px 40px rgba(0,0,0,0.12)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontFamily: font.heading, fontSize: 18, color: C.text }}>How to Use This Planner</h3>
              <button onClick={() => setShowHelp(false)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>{"\u00D7"}</button>
            </div>
            <div style={{ fontFamily: font.body, fontSize: 13, color: C.text, lineHeight: 1.7 }}>
              {[
                ["Add a task", "Tap the + field in any block and hit Enter, or just tap elsewhere and it saves automatically"],
                ["Check off a task", "Tap the checkbox to mark it done (it'll dim and strikethrough)"],
                ["Drag & drop", "Drag tasks between blocks, days, or sidebar lists. Drag within a list to reorder"],
                ["Bold a task", "Type * before the text (e.g., *Important call) to make it bold"],
                ["Bold + red", "Type ** before the text (e.g., **URGENT deadline) for bold red"],
                ["Admin task", "Type >> before the text (e.g., >>Expense report) for an italic task marked (A) that stays below your regular tasks"],
                ["4pm red alert", "Any red task still open for today after 4pm shows a banner at the top, and triggers an email and phone push"],
                ["Running Lists", "The left sidebar has persistent lists that carry across weeks: This Week, Next 30 Days, Radar, Think, and Other"],
                ["Roll Day", "Move today\u2019s incomplete tasks to tomorrow, keeping them in their same blocks (Mon\u2013Thu only)"],
                ["Roll Week", "At the end of the week, carry incomplete tasks forward to next Monday\u2019s Morning block"],
                ["Notes", "Tap \u270E Notes to open your notes beside the planner (drag its edge to resize). Start lines with - or 1. for lists, [ ] for checkboxes, and use Add to planner to turn highlighted lines into tasks. On a computer, Shift+Alt+Up/Down moves the current or highlighted lines"],
                ["Collapse / Expand", "Tap a day header to collapse that day, or use the Collapse button to toggle all days"],
                ["Navigate weeks", "Use \u2039 \u203A arrows to move between weeks, or tap Today to jump back"],
              ].map(([title, desc], i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <span style={{ color: C.accent, flexShrink: 0, marginTop: 1 }}>{"\u2022"}</span>
                  <div><span style={{ fontWeight: 600 }}>{title}</span> {"\u2014"} {desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RolloverModal({ items, onConfirm, onCancel }) {
  const [selected, setSelected] = useState(items.map(i => i.id));
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 14, padding: 24, maxWidth: 480, width: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 40px rgba(0,0,0,0.12)" }}>
        <h3 style={{ margin: "0 0 4px", fontFamily: font.heading, fontSize: 18, color: C.text }}>Roll Week {"\u2192"} Next Week</h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: C.muted, fontFamily: font.body }}>Incomplete tasks will be added to next Monday's Morning block. Uncheck any you want to leave behind.</p>
        <div style={{ flex: 1, overflowY: "auto", marginBottom: 16 }}>
          {items.length === 0 ? <p style={{ fontSize: 13, color: C.dim, textAlign: "center", padding: 20 }}>No incomplete tasks to roll over! {"\uD83C\uDF89"}</p>
          : items.map(item => (
            <label key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: selected.includes(item.id) ? C.accentDim : "transparent", border: `1px solid ${selected.includes(item.id) ? "rgba(79,70,229,0.2)" : "transparent"}`, marginBottom: 4 }}>
              <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} style={{ marginTop: 2, accentColor: C.accent }} />
              <div><span style={{ fontSize: 13, color: C.text }}>{item.text}</span><span style={{ display: "block", fontSize: 11, color: C.dim, marginTop: 2 }}>{item.day} {"\u00B7"} {item.block}</span></div>
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, fontFamily: font.body, fontSize: 13, cursor: "pointer", color: C.muted }}>Cancel</button>
          <button onClick={() => onConfirm(selected)} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontFamily: font.body, fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: `0 0 16px ${C.accentGlow}` }}>
            {items.length === 0 ? "Start New Week" : `Roll Week (${selected.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function RollDayModal({ weekData, todayName, onConfirm, onCancel }) {
  const defaultFrom = DAYS.includes(todayName) ? todayName : DAYS[0];
  const [fromDay, setFromDay] = useState(defaultFrom);
  const [toDay, setToDay] = useState(DAYS[(DAYS.indexOf(defaultFrom) + 1) % DAYS.length]);

  const getItemsForDay = (day) => {
    if (!weekData) return [];
    const items = [];
    BLOCKS.forEach(b => { (weekData.days[day]?.[b.key] || []).filter(t => !t.done).forEach(t => items.push({ ...t, block: b.label, blockKey: b.key })); });
    return items;
  };
  const items = getItemsForDay(fromDay);
  const [selected, setSelected] = useState(items.map(i => i.id));
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  // Recalculate selected when fromDay changes; nudge toDay off of fromDay if they collide
  const prevFromDay = useRef(fromDay);
  useEffect(() => {
    if (prevFromDay.current !== fromDay) {
      const newItems = getItemsForDay(fromDay);
      setSelected(newItems.map(i => i.id));
      prevFromDay.current = fromDay;
      if (toDay === fromDay) setToDay(DAYS[(DAYS.indexOf(fromDay) + 1) % DAYS.length]);
    }
  }, [fromDay]);

  const daySelector = (label, value, onChange, excludeDay) => (
    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ fontSize: 12, color: C.muted, fontFamily: font.body, marginRight: 4, lineHeight: "28px" }}>{label}</span>
      {DAYS.map(d => (
        <button key={d} disabled={d === excludeDay} onClick={() => onChange(d)} style={{
          padding: "4px 12px", borderRadius: 6, fontSize: 12, fontFamily: font.body, fontWeight: 500,
          cursor: d === excludeDay ? "not-allowed" : "pointer", opacity: d === excludeDay ? 0.35 : 1,
          border: value === d ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
          background: value === d ? C.accentDim : C.surfaceAlt,
          color: value === d ? C.accent : C.muted,
        }}>{d}</button>
      ))}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 14, padding: 24, maxWidth: 480, width: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 40px rgba(0,0,0,0.12)" }}>
        <h3 style={{ margin: "0 0 12px", fontFamily: font.heading, fontSize: 18, color: C.text }}>Roll Day {"\u2192"} {toDay}</h3>
        {daySelector("From:", fromDay, setFromDay, toDay)}
        {daySelector("To:", toDay, setToDay, fromDay)}
        <p style={{ margin: "0 0 16px", fontSize: 13, color: C.muted, fontFamily: font.body }}>Move {fromDay}'s incomplete tasks to {toDay}, keeping them in their same blocks. Uncheck any you want to leave behind.</p>
        <div style={{ flex: 1, overflowY: "auto", marginBottom: 16 }}>
          {items.length === 0 ? <p style={{ fontSize: 13, color: C.dim, textAlign: "center", padding: 20 }}>No incomplete tasks on {fromDay}! {"\uD83C\uDF89"}</p>
          : items.map(item => (
            <label key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: selected.includes(item.id) ? C.accentDim : "transparent", border: `1px solid ${selected.includes(item.id) ? "rgba(79,70,229,0.2)" : "transparent"}`, marginBottom: 4 }}>
              <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} style={{ marginTop: 2, accentColor: C.accent }} />
              <div><span style={{ fontSize: 13, color: C.text }}>{item.text}</span><span style={{ display: "block", fontSize: 11, color: C.dim, marginTop: 2 }}>{item.block}</span></div>
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, fontFamily: font.body, fontSize: 13, cursor: "pointer", color: C.muted }}>Cancel</button>
          {items.length > 0 && (
            <button onClick={() => onConfirm(selected, fromDay, toDay)} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontFamily: font.body, fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: `0 0 16px ${C.accentGlow}` }}>
              Roll Day ({selected.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ExportModal({ currentWeek, lists, onClose }) {
  const [startWeek, setStartWeek] = useState(currentWeek);
  const [endWeek, setEndWeek] = useState(currentWeek);
  const [fmt, setFmt] = useState("md");
  const [incLists, setIncLists] = useState(true);
  const [exporting, setExporting] = useState(false);
  const quickSelect = (l) => {
    if (l === "this") { setStartWeek(currentWeek); setEndWeek(currentWeek); }
    else if (l === "4w") { setStartWeek(getAdjacentWeek(currentWeek, -3)); setEndWeek(currentWeek); }
    else if (l === "3m") { setStartWeek(getAdjacentWeek(currentWeek, -12)); setEndWeek(currentWeek); }
    else if (l === "all") { setStartWeek(getAdjacentWeek(currentWeek, -52)); setEndWeek(currentWeek); }
  };
  const doExport = async () => {
    setExporting(true);
    try {
      const weeks = []; let wk = startWeek; const endDate = new Date(endWeek + "T00:00:00");
      while (new Date(wk + "T00:00:00") <= endDate) { const data = await loadStorage(`planner-week:${wk}`); if (data) weeks.push({ monday: wk, label: getWeekLabel(wk), data }); wk = getAdjacentWeek(wk, 1); if (weeks.length > 52) break; }
      let content, filename, mimeType, blobData;
      if (fmt === "md") {
        let md = "# Weekly Planner Export\n\n";
        if (incLists && lists) { md += "---\n\n## Running Lists\n\n"; LISTS.forEach(li => { const items = lists[li.key] || []; if (items.length) { md += `### ${li.icon} ${li.label}\n`; items.forEach(t => { md += `- [${t.done ? "x" : " "}] ${t.text}\n`; }); md += "\n"; } }); }
        weeks.forEach(w => { md += `---\n\n## Week of ${w.label}\n\n`; if (w.data.priorities) md += `**Priorities:** ${w.data.priorities}\n\n`; DAYS.forEach(day => { const tasks = BLOCKS.flatMap(b => (w.data.days?.[day]?.[b.key] || [])); if (tasks.length) { md += `### ${day}\n`; BLOCKS.forEach(b => { const bt = w.data.days?.[day]?.[b.key] || []; if (bt.length) { md += `**${b.label}**\n`; bt.forEach(t => { md += `- [${t.done ? "x" : " "}] ${t.text}\n`; }); } }); md += "\n"; } }); });
        content = md; filename = "planner.md"; mimeType = "text/markdown";
      } else if (fmt === "json") {
        content = JSON.stringify({ weeks: weeks.map(w => ({ key: w.monday, ...w.data })), ...(incLists ? { runningLists: lists } : {}) }, null, 2); filename = "planner.json"; mimeType = "application/json";
      } else {
        const rows = [["Week", "Day", "Block", "Task", "Status"]];
        if (incLists && lists) LISTS.forEach(li => (lists[li.key] || []).forEach(t => rows.push(["Running Lists", li.label, "", t.text, t.done ? "Done" : "Open"])));
        weeks.forEach(w => { if (w.data.priorities) rows.push([w.label, "", "Priorities", w.data.priorities, ""]); DAYS.forEach(day => BLOCKS.forEach(b => (w.data.days?.[day]?.[b.key] || []).forEach(t => rows.push([w.label, day, b.label, t.text, t.done ? "Done" : "Open"])))); });
        if (fmt === "csv") { content = rows.map(r => r.map(c => { const s = String(c).replace(/"/g, '""'); return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s; }).join(",")).join("\n"); filename = "planner.csv"; mimeType = "text/csv"; }
        else { try { const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs"); const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 50 }, { wch: 8 }]; XLSX.utils.book_append_sheet(wb, ws, "Planner"); if (incLists && lists) { const lr = [["List", "Item", "Status"]]; LISTS.forEach(li => (lists[li.key] || []).forEach(t => lr.push([li.label, t.text, t.done ? "Done" : "Open"]))); const ws2 = XLSX.utils.aoa_to_sheet(lr); ws2["!cols"] = [{ wch: 16 }, { wch: 50 }, { wch: 8 }]; XLSX.utils.book_append_sheet(wb, ws2, "Running Lists"); } const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }); blobData = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }); filename = "planner.xlsx"; } catch (e) { console.error(e); content = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"); filename = "planner.csv"; mimeType = "text/csv"; } }
      }
      const blob = blobData || new Blob([content], { type: mimeType }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); onClose();
    } catch (e) { console.error(e); } setExporting(false);
  };
  const inputStyle = { padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 16, fontFamily: font.body, outline: "none", width: "100%" };
  const qBtn = (label, key) => (<button key={key} onClick={() => quickSelect(key)} style={{ padding: "5px 12px", borderRadius: 6, fontSize: 12, fontFamily: font.body, fontWeight: 500, border: `1px solid ${C.border}`, background: C.surfaceAlt, color: C.muted, cursor: "pointer" }}>{label}</button>);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)", background: "rgba(0,0,0,0.25)", padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 14, padding: 24, width: 440, maxWidth: "100%", boxShadow: "0 20px 40px rgba(0,0,0,0.12)" }}>
        <h3 style={{ fontFamily: font.heading, fontSize: 18, margin: "0 0 16px", color: C.text }}>{"\u2193"} Export Planner</h3>
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>{qBtn("This week", "this")}{qBtn("Last 4 weeks", "4w")}{qBtn("Last 3 months", "3m")}{qBtn("All time", "all")}</div>
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>Start</label><input type="date" value={startWeek} onChange={e => setStartWeek(getWeekKey(e.target.value))} style={inputStyle} /></div>
          <div style={{ flex: 1 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>End</label><input type="date" value={endWeek} onChange={e => setEndWeek(getWeekKey(e.target.value))} style={inputStyle} /></div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <select value={fmt} onChange={e => setFmt(e.target.value)} style={{ ...inputStyle, width: "auto", cursor: "pointer" }}><option value="md">Markdown (.md)</option><option value="json">JSON (.json)</option><option value="csv">CSV (.csv)</option><option value="xlsx">Excel (.xlsx)</option></select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: font.body, fontSize: 13, color: C.muted, cursor: "pointer" }}><input type="checkbox" checked={incLists} onChange={e => setIncLists(e.target.checked)} style={{ accentColor: C.accent }} />Include running lists</label>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, fontFamily: font.body, fontSize: 13, cursor: "pointer", color: C.muted }}>Cancel</button>
          <button onClick={doExport} disabled={exporting} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontFamily: font.body, fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: exporting ? 0.6 : 1 }}>{exporting ? "Exporting..." : "Export"}</button>
        </div>
      </div>
    </div>
  );
}

const LIST_PREFIX_RE = /^(\s*)(\[[ xX]\] |[-\u2022\u2014*][ \u00A0]|(\d+)([.)]) )/;
const CHECKBOX_RE = /^(\s*)\[([ xX])\]/;

// Inserts through execCommand so the browser's undo history keeps working.
const insertText = (ta, text, onChange) => {
  ta.focus();
  // Chrome mishandles the caret for insertText with an empty string, so use delete for removals.
  const ok = text === "" ? (ta.selectionStart === ta.selectionEnd || document.execCommand("delete")) : document.execCommand("insertText", false, text);
  if (!ok) {
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end");
    onChange(ta.value);
  }
};

const lineBounds = (value, pos) => {
  const start = value.lastIndexOf("\n", pos - 1) + 1;
  const end = value.indexOf("\n", pos);
  return { start, end: end === -1 ? value.length : end };
};

const toggleCheckboxAt = (ta, lineStart, onChange) => {
  const m = ta.value.slice(lineStart).match(CHECKBOX_RE);
  if (!m) return false;
  const markPos = lineStart + m[1].length + 1;
  const caret = ta.selectionStart;
  ta.setSelectionRange(markPos, markPos + 1);
  insertText(ta, m[2] === " " ? "x" : " ", onChange);
  ta.setSelectionRange(caret, caret);
  return true;
};

// Styled copy of the text drawn behind a transparent textarea, so checkboxes and done items render while editing stays native.
function NotesMirror({ text }) {
  return text.split("\n").map((line, i) => {
    const cb = line.match(/^(\s*)\[([ xX])\]( ?)(.*)$/);
    if (cb) {
      const done = cb[2] !== " ";
      return <div key={i}>{cb[1]}<span className={`nchk${done ? " done" : ""}`}>[{cb[2]}]</span>{cb[3]}<span className={done ? "ndone" : ""}>{cb[4] || "\u200B"}</span></div>;
    }
    const b = line.match(/^(\s*)([-\u2022\u2014*]|\d+[.)])([ \u00A0].*)$/);
    if (b) return <div key={i}>{b[1]}<span className={b[2] === "-" ? "nbul ndash" : "nbul"}>{b[2]}</span>{b[3]}</div>;
    return <div key={i}>{line || "\u200B"}</div>;
  });
}

function NotesEditor({ value, onChange, taRef }) {
  const mirrorRef = useRef(null);
  const text = value.replace(/\r\n?/g, "\n")
    .replace(/^([ \t]*)[\u2010\u2011\u2012\u2013\u2212](?=[ \u00A0])/gm, "$1-")
    .replace(/^([ \t]*)([-\u2022\u2014*]|\d+[.)])\u00A0/gm, "$1$2 ");

  const onKeyDown = (e) => {
    const ta = e.target;
    const { value: v, selectionStart: s, selectionEnd: en } = ta;
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const { start } = lineBounds(v, s);
      if (!toggleCheckboxAt(ta, start, onChange)) {
        const [, indent, bullet = ""] = v.slice(start).match(/^(\s*)([-•—*] |\d+[.)] )?/);
        const from = start + indent.length;
        ta.setSelectionRange(from, from + bullet.length);
        insertText(ta, "[ ] ", onChange);
        const caret = Math.max(from + 4, s + 4 - bullet.length);
        ta.setSelectionRange(caret, caret);
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && s === en) {
      const { start, end } = lineBounds(v, s);
      const m = v.slice(start, s).match(LIST_PREFIX_RE);
      if (!m) return;
      e.preventDefault();
      if (v.slice(start, end).trim() === m[2].trim()) {
        ta.setSelectionRange(start, end);
        insertText(ta, "", onChange);
        return;
      }
      const next = m[2].startsWith("[") ? "[ ] " : m[3] ? `${+m[3] + 1}${m[4]} ` : m[2];
      insertText(ta, "\n" + m[1] + next, onChange);
      return;
    }
    if (e.altKey && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const blockStart = lineBounds(v, s).start;
      const blockEnd = lineBounds(v, Math.max(s, en - (en > s && v[en - 1] === "\n" ? 1 : 0))).end;
      const block = v.slice(blockStart, blockEnd);
      if (e.key === "ArrowUp") {
        if (blockStart === 0) return;
        const prevStart = lineBounds(v, blockStart - 1).start;
        const prev = v.slice(prevStart, blockStart - 1);
        ta.setSelectionRange(prevStart, blockEnd);
        insertText(ta, block + "\n" + prev, onChange);
        ta.setSelectionRange(s - prev.length - 1, en - prev.length - 1);
      } else {
        if (blockEnd >= v.length) return;
        const nextEnd = lineBounds(v, blockEnd + 1).end;
        const next = v.slice(blockEnd + 1, nextEnd);
        ta.setSelectionRange(blockStart, nextEnd);
        insertText(ta, next + "\n" + block, onChange);
        ta.setSelectionRange(s + next.length + 1, en + next.length + 1);
      }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const blockStart = lineBounds(v, s).start;
      const blockEnd = lineBounds(v, Math.max(s, en - (en > s && v[en - 1] === "\n" ? 1 : 0))).end;
      const lines = v.slice(blockStart, blockEnd).split("\n");
      const changed = lines.map(l => e.shiftKey ? l.replace(/^ {1,2}/, "") : "  " + l);
      const firstDelta = changed[0].length - lines[0].length;
      const totalDelta = changed.join("\n").length - (blockEnd - blockStart);
      ta.setSelectionRange(blockStart, blockEnd);
      insertText(ta, changed.join("\n"), onChange);
      ta.setSelectionRange(Math.max(blockStart, s + firstDelta), en + totalDelta);
    }
  };

  const onClick = (e) => {
    const ta = e.target;
    if (ta.selectionStart !== ta.selectionEnd) return;
    const pos = ta.selectionStart;
    const { start } = lineBounds(ta.value, pos);
    const m = ta.value.slice(start).match(CHECKBOX_RE);
    if (m && pos >= start + m[1].length && pos <= start + m[1].length + 3) toggleCheckboxAt(ta, start, onChange);
  };

  const shared = {
    position: "absolute", inset: 0, margin: 0, border: "none", padding: "18px 22px 40px", boxSizing: "border-box",
    fontFamily: font.body, fontSize: 14, lineHeight: "21px", letterSpacing: "normal", tabSize: 2,
    whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: "normal", overflowY: "scroll",
  };
  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, background: C.surfaceAlt }}>
      <style>{`
        .notes-ta, .notes-mirror { scrollbar-width: thin; scrollbar-color: ${C.scroll} transparent; }
        .notes-ta::selection { background: ${C.accentGlow}; color: transparent; }
        .notes-mirror .nchk { position: relative; color: transparent; }
        .notes-mirror .nchk::before { content: ""; position: absolute; left: 50%; top: 50%; width: 13px; height: 13px; transform: translate(-50%, -50%); border: 1.5px solid ${C.dim}; border-radius: 4px; box-sizing: border-box; background: ${C.surface}; }
        .notes-mirror .nchk.done::before { background: ${C.accent}; border-color: ${C.accent}; }
        .notes-mirror .nchk.done::after { content: ""; position: absolute; left: 50%; top: 45%; width: 3px; height: 7px; transform: translate(-50%, -50%) rotate(45deg); border: solid #fff; border-width: 0 2px 2px 0; }
        .notes-mirror .ndone { color: ${C.dim}; text-decoration: line-through; }
        .notes-mirror .nbul { color: ${C.accent}; }
        .notes-mirror .ndash { position: relative; color: transparent; }
        .notes-mirror .ndash::before { content: "\u2013"; position: absolute; left: -3.5px; top: -1px; font-weight: 700; color: ${C.text}; }
      `}</style>
      <div ref={mirrorRef} className="notes-mirror" aria-hidden="true" style={{ ...shared, color: C.text, pointerEvents: "none" }}>
        <NotesMirror text={text} />
      </div>
      <textarea ref={taRef} className="notes-ta" value={text} spellCheck
        onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown} onClick={onClick}
        onScroll={e => { if (mirrorRef.current) mirrorRef.current.scrollTop = e.target.scrollTop; }}
        placeholder={"Jot down anything...\n\n- Start a line with - or 1. for a list\n[ ] Start a line with [ ] for a checkbox"}
        style={{ ...shared, width: "100%", height: "100%", resize: "none", outline: "none", background: "transparent", color: "transparent", caretColor: C.text }} />
    </div>
  );
}

// Turns the selected note lines (or the caret's line) into planner tasks.
function SendToPlanner({ taRef, defaultDay, onSend }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState([]);
  const [target, setTarget] = useState({ type: "week", day: defaultDay, block: "Morning" });
  const [flash, setFlash] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const openPicker = () => {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: en, value: v } = ta;
    const from = lineBounds(v, s).start;
    const to = lineBounds(v, en > s && v[en - 1] === "\n" ? en - 1 : en).end;
    setLines(v.slice(from, to).split("\n").map(l => l.replace(/^\s*(\[[ xX]\]\s*|[-\u2022\u2014*]\s+|\d+[.)]\s+)?/, "").trim()).filter(Boolean));
    setTarget(t => ({ ...t, day: defaultDay }));
    setOpen(true);
  };

  const send = () => {
    onSend(lines, target);
    const where = target.type === "week" ? `${target.day} \u00B7 ${target.block}` : target.list;
    setFlash(`Added ${lines.length} to ${where}`);
    setOpen(false);
    setTimeout(() => setFlash(""), 2500);
  };

  const chip = (label, active, onClick) => (
    <button key={label} onClick={onClick} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, fontFamily: font.body, cursor: "pointer", border: `1px solid ${active ? C.accent : C.border}`, background: active ? C.accentDim : C.surfaceAlt, color: active ? C.accent : C.muted }}>{label}</button>
  );
  const label = (t) => <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", margin: "10px 0 6px" }}>{t}</div>;

  return (
    <div ref={ref} style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
      {flash && <span style={{ fontSize: 11, color: C.green }}>{"\u2713"} {flash}</span>}
      <button onMouseDown={e => e.preventDefault()} onClick={() => open ? setOpen(false) : openPicker()} title="Highlight lines in your notes, then send them to the planner as tasks"
        style={{ background: open ? C.accentDim : C.btn, border: `1px solid ${open ? C.accent : C.border}`, color: open ? C.accent : C.muted, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontFamily: font.body }}>
        {"\u2192"} Add to planner
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 340, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.18)", padding: 14, zIndex: 300 }}>
          {lines.length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>Click a line or highlight several lines in your notes first, then press Add to planner.</div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: C.text, maxHeight: 110, overflowY: "auto", lineHeight: 1.5 }}>
                {lines.map((l, i) => <div key={i} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{"\u2022"} {l}</div>)}
              </div>
              {label("Day")}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {DAYS.map(d => chip(d === "Weekend" ? "Wknd" : d.slice(0, 3), target.type === "week" && target.day === d, () => setTarget(t => ({ type: "week", day: d, block: t.block || "Morning" }))))}
              </div>
              {target.type === "week" && <div style={{ display: "flex", gap: 4, marginTop: 6 }}>{BLOCKS.map(b => chip(b.label, target.block === b.key, () => setTarget(t => ({ ...t, block: b.key }))))}</div>}
              {label("Or a list")}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {LISTS.map(li => chip(li.label, target.type === "list" && target.list === li.key, () => setTarget({ type: "list", list: li.key })))}
              </div>
              <button onClick={send} style={{ marginTop: 14, width: "100%", padding: "8px 0", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontFamily: font.body, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Add {lines.length} task{lines.length === 1 ? "" : "s"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NotesPanel({ note, onSave, onClose, saving, defaultDay, onSend, docked, width, onResize }) {
  const taRef = useRef(null);
  useEffect(() => { if (taRef.current && !docked) taRef.current.focus(); }, [docked]);

  const startResize = (e) => {
    e.preventDefault();
    const move = (ev) => onResize(Math.min(75, Math.max(30, (ev.clientX / window.innerWidth) * 100)), false);
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); document.body.style.userSelect = ""; onResize(null, true); };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  const body = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px 10px 20px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
        <span style={{ fontFamily: font.heading, fontSize: 15, fontWeight: 700, color: C.text }}>{"\u270E"} Notes</span>
        <span style={{ fontSize: 11, color: C.dim, marginRight: "auto" }}>{saving ? "Saving\u2026" : "Synced"}</span>
        <SendToPlanner taRef={taRef} defaultDay={defaultDay} onSend={onSend} />
        <button onClick={onClose} title="Close notes" style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "0 4px" }}>{"\u00D7"}</button>
      </div>
      <NotesEditor value={note} onChange={onSave} taRef={taRef} />
      <div style={{ padding: "6px 20px", fontSize: 11, color: C.dim, borderTop: `1px solid ${C.border}`, background: C.surface }}>
        <b>-</b> or <b>1.</b> list {"\u00B7"} <b>[ ]</b> checkbox {"\u00B7"} {docked ? <><b>Tab</b> indent {"\u00B7"} <b>Ctrl+Enter</b> make/check a box {"\u00B7"} <b>Shift+Alt+\u2191\u2193</b> move lines</> : "tap a box to check it"}
      </div>
    </>
  );

  if (docked) {
    return (
      <div style={{ position: "fixed", top: "var(--header-h, 56px)", left: 0, bottom: 0, width: `${width}vw`, display: "flex", flexDirection: "column", background: C.surface, borderRight: `1px solid ${C.border}`, boxShadow: "8px 0 24px rgba(0,0,0,0.06)", zIndex: 90 }}>
        <div onMouseDown={startResize} title="Drag to resize" style={{ position: "absolute", right: -4, top: 0, bottom: 0, width: 8, cursor: "col-resize", zIndex: 1 }} />
        {body}
      </div>
    );
  }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 10 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}
        style={{ background: C.surface, borderRadius: 14, width: "100%", height: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
        {body}
      </div>
    </div>
  );
}

function useIsDesktop() {
  const query = "(min-width: 768px)";
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return match;
}

function useSwipe(onSwipeLeft, onSwipeRight) {
  const touchStart = useRef(null);
  const touchEnd = useRef(null);
  const minSwipe = 50;
  const onTouchStart = (e) => { touchEnd.current = null; touchStart.current = e.targetTouches[0].clientX; };
  const onTouchMove = (e) => { touchEnd.current = e.targetTouches[0].clientX; };
  const onTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;
    const dist = touchStart.current - touchEnd.current;
    if (dist > minSwipe) onSwipeLeft();
    if (dist < -minSwipe) onSwipeRight();
    touchStart.current = null; touchEnd.current = null;
  };
  return { onTouchStart, onTouchMove, onTouchEnd };
}

export default function WeeklyPlanner() {
  const [currentWeek, setCurrentWeek] = useState(getWeekKey(new Date()));
  const [weekData, setWeekData] = useState(null);
  const [runningLists, setRunningLists] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Default: collapse all days except today
  const getDefaultCollapsed = () => {
    const ti = new Date().getDay() - 1;
    const tn = ti >= 0 && ti < 5 ? DAYS[ti] : (ti >= 5 || ti === -1 ? "Weekend" : null);
    const c = {};
    DAYS.forEach(d => { c[d] = d !== tn; });
    return c;
  };

  const [collapsedDays, setCollapsedDays] = useState(getDefaultCollapsed);
  const [mobileView, setMobileView] = useState("week");
  const [showRollover, setShowRollover] = useState(false);
  const [showRollDay, setShowRollDay] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const isDesktop = useIsDesktop();
  const [showQuickNote, setShowQuickNote] = useState(() => { try { return window.matchMedia("(min-width: 768px)").matches && localStorage.getItem("planner-notes-open") === "1"; } catch { return false; } });
  const [notesWidth, setNotesWidth] = useState(() => { try { return Number(localStorage.getItem("planner-notes-width")) || 60; } catch { return 60; } });
  const notesDocked = showQuickNote && isDesktop;
  const setNotesOpen = (open) => { setShowQuickNote(open); try { localStorage.setItem("planner-notes-open", open ? "1" : "0"); } catch {} };
  const resizeNotes = (w, done) => {
    if (w !== null) setNotesWidth(w);
    if (done) setNotesWidth(cur => { try { localStorage.setItem("planner-notes-width", String(Math.round(cur))); } catch {} return cur; });
  };
  const headerRef = useRef(null);
  useEffect(() => {
    if (!headerRef.current) return;
    const ro = new ResizeObserver(([entry]) => document.documentElement.style.setProperty("--header-h", `${entry.target.offsetHeight}px`));
    ro.observe(headerRef.current);
    return () => ro.disconnect();
  }, [loading]);
  const [quickNote, setQuickNote] = useState("");
  const [collapsedLists, setCollapsedLists] = useState({});
  const [allCollapsed, setAllCollapsed] = useState(true);
  const [theme, setTheme] = useState(document.documentElement.dataset.theme);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch {}
    setTheme(next);
  };
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);
  const saveTimeout = useRef(null);
  const noteTimeout = useRef(null);
  const isCurrentWeek = currentWeek === getWeekKey(new Date());

  const swipeHandlers = useSwipe(
    () => setMobileView("lists"),
    () => setMobileView("week")
  );

  // Auto-insert "Pray" 2-3 times per week on app load
  const maybeAddPray = useCallback((wk) => {
    if (!wk) return wk;
    const today = new Date();
    const dayIdx = today.getDay() - 1;
    if (dayIdx < 0 || dayIdx > 4) return wk; // skip weekends
    const dayName = DAYS[dayIdx];

    // Check if "Pray" already exists today in any block
    const alreadyHas = BLOCKS.some(b => (wk.days[dayName]?.[b.key] || []).some(t => t.text === "Pray" || t.text === "*Pray"));
    if (alreadyHas) return wk;

    // Use a seeded random based on the date so it's consistent per day
    const dateStr = today.toISOString().split("T")[0];
    const seed = dateStr.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    // ~40% chance per day = roughly 2-3 days per 5-day week
    if ((seed * 7 + dayIdx * 13) % 10 >= 4) return wk;

    // Pick Morning or Afternoon randomly
    const blockKey = (seed + dayIdx) % 2 === 0 ? "Morning" : "Afternoon";
    const copy = JSON.parse(JSON.stringify(wk));
    copy.days[dayName][blockKey].unshift({ id: genId(), text: "Pray", done: false });
    return copy;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [week, lists, note] = await Promise.all([
        loadStorage(`planner-week:${currentWeek}`),
        loadStorage("planner-running-lists"),
        loadStorage("planner-quick-note"),
      ]);
      if (!cancelled) {
        let wk = week || emptyWeek();
        // Only add Pray if viewing the current week
        if (currentWeek === getWeekKey(new Date())) {
          const updated = maybeAddPray(wk);
          if (updated !== wk) {
            wk = updated;
            saveStorage(`planner-week:${currentWeek}`, wk);
          }
        }
        setWeekData(sortWeek(wk));
        setRunningLists(sortLists(lists || emptyLists()));
        if (note) setQuickNote(note);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentWeek, maybeAddPray]);

  const debouncedSave = useCallback((key, data) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    setSaving(true);
    saveTimeout.current = setTimeout(async () => { await saveStorage(key, data); setSaving(false); }, 800);
  }, []);

  const saveQuickNoteFn = (val) => {
    setQuickNote(val);
    if (noteTimeout.current) clearTimeout(noteTimeout.current);
    setSaving(true);
    noteTimeout.current = setTimeout(async () => { await saveStorage("planner-quick-note", val); setSaving(false); }, 800);
  };

  const getDayDate = (dayName) => {
    const mon = new Date(currentWeek + "T00:00:00");
    const offset = DAYS.indexOf(dayName);
    return new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + offset);
  };

  const updateWeek = (updater) => {
    setWeekData(prev => {
      const next = typeof updater === "function" ? updater(JSON.parse(JSON.stringify(prev))) : updater;
      sortWeek(next);
      debouncedSave(`planner-week:${currentWeek}`, next); return next;
    });
  };
  const sendNotesToPlanner = (lines, target) => {
    const tasks = lines.map(text => ({ id: genId(), text, done: false }));
    if (target.type === "week") updateWeek(w => { w.days[target.day][target.block].push(...tasks); return w; });
    else updateLists(l => { (l[target.list] = l[target.list] || []).push(...tasks); return l; });
  };
  const updateLists = (updater) => {
    setRunningLists(prev => {
      const next = typeof updater === "function" ? updater(JSON.parse(JSON.stringify(prev))) : updater;
      sortLists(next);
      debouncedSave("planner-running-lists", next); return next;
    });
  };

  const addTask = (day, block, text) => { updateWeek(w => { w.days[day][block].push({ id: genId(), text, done: false }); return w; }); };
  const toggleTask = (day, block, id) => { updateWeek(w => { toggleAndReposition(w.days[day][block], id); return w; }); };
  const editTask = (day, block, id, text) => { updateWeek(w => { const t = w.days[day][block].find(x => x.id === id); if (t) t.text = text; return w; }); };
  const deleteTask = (day, block, id) => { updateWeek(w => { w.days[day][block] = w.days[day][block].filter(x => x.id !== id); return w; }); };

  // Reorder within same block
  const reorderTask = (day, block, taskId, toIndex) => {
    updateWeek(w => {
      const arr = w.days[day][block];
      const fromIndex = arr.findIndex(t => t.id === taskId);
      if (fromIndex === -1) return w;
      const [item] = arr.splice(fromIndex, 1);
      const adjustedIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
      arr.splice(adjustedIndex, 0, item);
      return w;
    });
  };

  const addListItem = (ln, text) => { updateLists(l => { if (!l[ln]) l[ln] = []; l[ln].push({ id: genId(), text, done: false }); return l; }); };
  const toggleListItem = (ln, id) => { updateLists(l => { if (l[ln]) toggleAndReposition(l[ln], id); return l; }); };
  const editListItem = (ln, id, text) => { updateLists(l => { const t = l[ln]?.find(x => x.id === id); if (t) t.text = text; return l; }); };
  const deleteListItem = (ln, id) => { updateLists(l => { l[ln] = l[ln].filter(x => x.id !== id); return l; }); };

  const reorderListItem = (listKey, taskId, toIndex) => {
    updateLists(l => {
      const arr = l[listKey];
      if (!arr) return l;
      const fromIndex = arr.findIndex(t => t.id === taskId);
      if (fromIndex === -1) return l;
      const [item] = arr.splice(fromIndex, 1);
      const adjustedIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
      arr.splice(adjustedIndex, 0, item);
      return l;
    });
  };

  const handleDropOnBlock = (day, block, atIndex) => (payload) => {
    const { task, type, zone, index: srcIndex } = payload;
    // Same block reorder
    if (type === "week" && zone === `${day}|${block}` && atIndex !== undefined) {
      reorderTask(day, block, task.id, atIndex);
      return;
    }
    if (type === "week") {
      const [srcDay, srcBlock] = zone.split("|");
      updateWeek(w => {
        w.days[srcDay][srcBlock] = w.days[srcDay][srcBlock].filter(t => t.id !== task.id);
        const newTask = { id: genId(), text: task.text, done: task.done };
        if (atIndex !== undefined) w.days[day][block].splice(atIndex, 0, newTask);
        else w.days[day][block].push(newTask);
        return w;
      });
    } else if (type === "list") {
      updateLists(l => { l[zone] = l[zone].filter(t => t.id !== task.id); return l; });
      updateWeek(w => {
        const newTask = { id: genId(), text: task.text, done: false };
        if (atIndex !== undefined) w.days[day][block].splice(atIndex, 0, newTask);
        else w.days[day][block].push(newTask);
        return w;
      });
    }
  };

  const handleDropOnList = (listName, atIndex) => (payload) => {
    const { task, type, zone } = payload;
    if (type === "list") {
      if (zone === listName && atIndex !== undefined) {
        reorderListItem(listName, task.id, atIndex);
        return;
      }
      if (zone === listName) return;
      updateLists(l => {
        l[zone] = l[zone].filter(t => t.id !== task.id);
        const newTask = { id: genId(), text: task.text, done: task.done };
        if (atIndex !== undefined) l[listName].splice(atIndex, 0, newTask);
        else l[listName].push(newTask);
        return l;
      });
    } else if (type === "week") {
      const [srcDay, srcBlock] = zone.split("|");
      updateWeek(w => { w.days[srcDay][srcBlock] = w.days[srcDay][srcBlock].filter(t => t.id !== task.id); return w; });
      updateLists(l => {
        if (!l[listName]) l[listName] = [];
        const newTask = { id: genId(), text: task.text, done: false };
        if (atIndex !== undefined) l[listName].splice(atIndex, 0, newTask);
        else l[listName].push(newTask);
        return l;
      });
    }
  };

  const toggleAllDays = () => {
    const next = !allCollapsed;
    setAllCollapsed(next);
    const newState = {};
    DAYS.forEach(d => { newState[d] = next; });
    setCollapsedDays(newState);
  };

  const getIncompleteItems = () => {
    if (!weekData) return [];
    const items = [];
    DAYS.forEach(day => BLOCKS.forEach(b => { (weekData.days[day]?.[b.key] || []).filter(t => !t.done).forEach(t => items.push({ ...t, day, block: b.label })); }));
    return items;
  };

  const getTodayIncompleteItems = () => {
    if (!weekData || !todayName) return [];
    const items = [];
    BLOCKS.forEach(b => { (weekData.days[todayName]?.[b.key] || []).filter(t => !t.done).forEach(t => items.push({ ...t, block: b.label, blockKey: b.key })); });
    return items;
  };

  const getTomorrowName = () => {
    const idx = DAYS.indexOf(todayName);
    if (idx === -1 || idx >= 4) return null; // Friday or Weekend — no tomorrow within weekdays
    return DAYS[idx + 1];
  };

  const handleRollDay = (selectedIds, fromDay, toDay) => {
    if (!toDay || !weekData) return;
    updateWeek(w => {
      BLOCKS.forEach(b => {
        const arr = w.days[fromDay]?.[b.key] || [];
        const toMove = arr.filter(t => selectedIds.includes(t.id) && !t.done);
        w.days[fromDay][b.key] = arr.filter(t => !selectedIds.includes(t) || t.done);
        // Remove selected incomplete from source
        w.days[fromDay][b.key] = arr.filter(t => !selectedIds.includes(t.id) || t.done);
        // Add to destination
        toMove.forEach(t => {
          w.days[toDay][b.key].push({ id: genId(), text: t.text, done: false });
        });
      });
      return w;
    });
    setShowRollDay(false);
  };
  const handleRollover = async (selectedIds) => {
    const nextWeek = getAdjacentWeek(currentWeek, 1);
    const existing = (await loadStorage(`planner-week:${nextWeek}`)) || emptyWeek();
    getIncompleteItems().filter(i => selectedIds.includes(i.id)).forEach(item => { existing.days["Monday"]["Morning"].push({ id: genId(), text: item.text, done: false }); });
    await saveStorage(`planner-week:${nextWeek}`, existing);
    setShowRollover(false); setCurrentWeek(nextWeek);
  };

  const stats = (() => { if (!weekData) return { total: 0, done: 0 }; let total = 0, done = 0; DAYS.forEach(d => BLOCKS.forEach(b => { (weekData.days[d]?.[b.key] || []).forEach(t => { total++; if (t.done) done++; }); })); return { total, done }; })();
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const todayIndex = now.getDay() - 1;
  const todayName = todayIndex >= 0 && todayIndex < 5 ? DAYS[todayIndex] : (todayIndex >= 5 || todayIndex === -1 ? "Weekend" : null);
  const openRedToday = isCurrentWeek && now.getHours() >= 16 && weekData
    ? BLOCKS.flatMap(b => (weekData.days[todayName]?.[b.key] || []).filter(t => !t.done && t.text.startsWith("**")).map(t => ({ ...t, block: b.label })))
    : [];

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg, fontFamily: font.body, color: C.dim }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 18, height: 18, border: `2px solid ${C.accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Loading...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // Render a task list with reorder drop zones between items
  const renderTaskList = (tasks, opts) => {
    const { dragType, dragZone, onToggle, onUpdate, onDelete, onDropAt } = opts;
    const items = [];
    tasks.forEach((task, i) => {
      items.push(
        <ReorderDropZone key={`drop-${i}`} onDrop={(payload) => onDropAt(payload, i)}>
          <TaskItem task={task} dragType={dragType} dragZone={dragZone} index={i}
            onToggle={onToggle} onUpdate={onUpdate} onDelete={onDelete} />
        </ReorderDropZone>
      );
    });
    // Final drop zone at end
    items.push(
      <ReorderDropZone key="drop-end" onDrop={(payload) => onDropAt(payload, tasks.length)}>
        <div />
      </ReorderDropZone>
    );
    return items;
  };

  return (
    <>
      <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: font.body }}
        {...swipeHandlers}>
        <style>{`
          * { box-sizing: border-box; -webkit-text-size-adjust: 100%; }
          ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: ${C.scroll}; border-radius: 3px; }
          textarea::placeholder, input::placeholder { color: ${C.dim}; }
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
          @media (min-width: 768px) { .mobile-tabs { display: none !important; } .lists-panel { display: block !important; } .week-panel { display: block !important; } .lists-panel.notes-hide { display: none !important; } }
          @media (max-width: 767px) { .mobile-tabs { display: flex !important; } .lists-panel { width: 100% !important; min-width: 100% !important; border-right: none !important; position: static !important; height: auto !important; } .week-panel { width: 100% !important; } .header-actions { gap: 6px !important; } .header-actions button { padding: 6px 10px !important; font-size: 11px !important; } }
        `}</style>

        <div ref={headerRef} style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "10px 16px 0", position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ position: "absolute", top: 10, right: 16, zIndex: 101, display: "flex", gap: 6 }}>
            <button onClick={toggleTheme} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} style={{
              background: C.btn, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "6px 9px", cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {theme === "dark" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
              )}
            </button>
            <HamburgerMenu onExport={() => setShowExport(true)} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingBottom: 10, paddingRight: 86, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto" }}>
              <div style={{ display: "flex", flexShrink: 0 }}>
                <button onClick={() => setCurrentWeek(getAdjacentWeek(currentWeek, -1))} style={{ background: C.btn, border: `1px solid ${C.border}`, color: C.muted, borderRadius: "6px 0 0 6px", padding: "5px 10px", cursor: "pointer", fontSize: 15 }}>{"\u2039"}</button>
                <button onClick={() => setCurrentWeek(getAdjacentWeek(currentWeek, 1))} style={{ background: C.btn, border: `1px solid ${C.border}`, borderLeft: "none", color: C.muted, borderRadius: "0 6px 6px 0", padding: "5px 10px", cursor: "pointer", fontSize: 15 }}>{"\u203A"}</button>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: font.heading, fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{getWeekLabel(currentWeek)}</div>
                {stats.total > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: C.muted }}>{stats.done}/{stats.total}</span>
                    <div style={{ width: 60, height: 4, background: C.track, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: pct + "%", background: `linear-gradient(90deg, ${C.accent}, ${C.green})`, borderRadius: 2, transition: "width 0.4s" }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="header-actions" style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
              {saving && <span style={{ fontSize: 11, color: C.dim, display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, animation: "pulse 1s infinite" }} /> syncing</span>}
              {!isCurrentWeek && <button onClick={() => setCurrentWeek(getWeekKey(new Date()))} style={{ background: C.btn, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontFamily: font.body }}>Today</button>}
              <button onClick={() => setNotesOpen(!showQuickNote)} style={{ background: showQuickNote ? C.accentDim : C.btn, border: `1px solid ${showQuickNote ? "rgba(79,70,229,0.3)" : C.border}`, color: showQuickNote ? C.accent : C.muted, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontFamily: font.body }}>{"\u270E"} Notes</button>
              <button onClick={toggleAllDays} style={{ background: C.btn, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontFamily: font.body }}>
                {allCollapsed ? "\u25B8 Expand" : "\u25BE Collapse"}
              </button>
              <button onClick={() => setShowRollDay(true)} style={{ background: C.btn, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontFamily: font.body }}>Roll Day {"\u2192"}</button>
              <button onClick={() => setShowRollover(true)} style={{ background: C.accent, border: "none", color: "#fff", borderRadius: 8, padding: "6px 16px", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font.body, boxShadow: `0 0 20px ${C.accentGlow}` }}>Roll Week {"\u2192"}</button>
            </div>
          </div>
          <div className="mobile-tabs" style={{ display: "none", borderTop: `1px solid ${C.border}` }}>
            {[{ key: "week", label: "\uD83D\uDCC5 Week" }, { key: "lists", label: "\uD83D\uDCCB Lists" }].map(tab => (
              <button key={tab.key} onClick={() => setMobileView(tab.key)}
                style={{ flex: 1, padding: "10px 0", border: "none", background: "transparent", color: mobileView === tab.key ? C.accent : C.dim, fontSize: 13, cursor: "pointer", fontFamily: font.body, fontWeight: 600, borderBottom: mobileView === tab.key ? `2.5px solid ${C.accent}` : "2.5px solid transparent" }}>{tab.label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", maxWidth: 1200, minHeight: "calc(100vh - 110px)", marginLeft: notesDocked ? `${notesWidth}vw` : "auto", marginRight: "auto" }}>
          <div className={notesDocked ? "lists-panel notes-hide" : "lists-panel"} style={{ width: 280, minWidth: 280, borderRight: `1px solid ${C.border}`, background: C.surface, padding: 16, overflowY: "auto", position: "sticky", top: 56, height: "calc(100vh - 56px)", display: mobileView === "lists" ? "block" : "none" }}>
            {LISTS.map(li => {
              const isListExpanded = !collapsedLists[li.key];
              return (
              <DropZone key={li.key} onDrop={handleDropOnList(li.key)} style={{ marginBottom: 16, padding: 10, border: `1px solid ${C.border}`, borderRadius: 10, background: C.surfaceAlt }}>
                <button onClick={() => setCollapsedLists(prev => ({ ...prev, [li.key]: !prev[li.key] }))}
                  style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: isListExpanded ? 8 : 0, padding: "4px 0", width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: 14, opacity: 0.55 }}>{li.icon}</span>
                  <span style={{ fontFamily: font.heading, fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{li.label}</span>
                  <span style={{ fontSize: 10, marginLeft: "auto", background: C.accentDim, color: C.accent, padding: "1px 7px", borderRadius: 99, fontWeight: 600 }}>{(runningLists?.[li.key] || []).filter(i => !i.done).length}</span>
                  <span style={{ color: C.dim, fontSize: 11, transition: "transform 0.2s", transform: isListExpanded ? "rotate(0deg)" : "rotate(-90deg)", display: "inline-block", marginLeft: 4 }}>{"\u25BE"}</span>
                </button>
                {isListExpanded && (
                  <>
                    {renderTaskList(runningLists?.[li.key] || [], {
                      dragType: "list", dragZone: li.key,
                      onToggle: id => toggleListItem(li.key, id),
                      onUpdate: (id, text) => editListItem(li.key, id, text),
                      onDelete: id => deleteListItem(li.key, id),
                      onDropAt: (payload, idx) => handleDropOnList(li.key, idx)(payload),
                    })}
                    <AddTask onAdd={text => addListItem(li.key, text)} placeholder={`Add to ${li.label.toLowerCase()}...`} />
                  </>
                )}
              </DropZone>
              );
            })}
          </div>

          <div className="week-panel" style={{ flex: 1, overflowY: "auto", padding: 16, display: mobileView === "week" ? "block" : "none" }}>
            {openRedToday.length > 0 && (
              <div style={{ marginBottom: 14, padding: "12px 16px", borderRadius: 10, background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.25)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.danger, marginBottom: 6 }}>
                  {"⚠"} {openRedToday.length} red task{openRedToday.length === 1 ? "" : "s"} still open today
                </div>
                {openRedToday.map(t => (
                  <div key={t.id} style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
                    {"•"} {t.text.slice(2)} <span style={{ color: C.muted, fontSize: 11 }}>({t.block})</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginBottom: 14, padding: "12px 16px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, fontFamily: font.heading }}>Weekly Priorities</div>
              <textarea value={weekData?.priorities || ""} onChange={e => updateWeek(w => ({ ...w, priorities: e.target.value }))} placeholder="What matters most this week?" rows={2}
                style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 13, fontFamily: font.body, color: C.text, resize: "vertical", lineHeight: 1.6 }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {DAYS.map(day => {
                const isWeekend = day === "Weekend";
                const isToday = isCurrentWeek && day === todayName;
                const isExpanded = !collapsedDays[day];
                const dayTasks = BLOCKS.reduce((s, b) => s + (weekData?.days[day]?.[b.key]?.length || 0), 0);
                const dayDone = BLOCKS.reduce((s, b) => s + (weekData?.days[day]?.[b.key]?.filter(t => t.done).length || 0), 0);
                const dayDateStr = isWeekend
                  ? (() => { const mon = new Date(currentWeek + "T00:00:00"); const sat = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 5); const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6); return `${sat.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })} \u2013 ${sun.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}`; })()
                  : getDayDate(day).toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
                const bgColor = isToday ? "rgba(79,70,229,0.03)" : isWeekend ? C.weekendBg : C.surfaceAlt;
                const borderColor = isToday ? "1px solid rgba(79,70,229,0.3)" : `1px solid ${C.border}`;
                return (
                  <div key={day} style={{ borderRadius: 10, overflow: "hidden", border: borderColor, background: bgColor, boxShadow: isToday ? "0 0 30px rgba(79,70,229,0.06)" : "0 1px 3px rgba(0,0,0,0.03)" }}>
                    <button onClick={() => setCollapsedDays(prev => ({ ...prev, [day]: !prev[day] }))}
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", border: "none", background: "transparent", cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: font.heading, fontWeight: 700, fontSize: 14, color: isToday ? C.accent : isWeekend ? C.slate : C.text }}>{day}</span>
                        <span style={{ fontSize: 12, color: C.muted, fontWeight: 400 }}>{dayDateStr}</span>
                        {isToday && <span style={{ fontSize: 10, background: C.accent, color: "white", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>today</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {dayTasks > 0 && <span style={{ fontSize: 11, color: C.dim }}>{dayDone}/{dayTasks}</span>}
                        <span style={{ color: C.dim, fontSize: 12, transition: "transform 0.2s", transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)", display: "inline-block" }}>{"\u25BE"}</span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                        {BLOCKS.map(block => (
                          <DropZone key={block.key} onDrop={handleDropOnBlock(day, block.key)} style={{ background: block.dim, borderRadius: 8, padding: "8px 12px", border: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: block.color, marginBottom: 5, display: "flex", alignItems: "center", gap: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                              <span style={{ fontSize: 12 }}>{block.icon}</span> {block.label}
                            </div>
                            {renderTaskList(weekData?.days[day]?.[block.key] || [], {
                              dragType: "week", dragZone: `${day}|${block.key}`,
                              onToggle: id => toggleTask(day, block.key, id),
                              onUpdate: (id, text) => editTask(day, block.key, id, text),
                              onDelete: id => deleteTask(day, block.key, id),
                              onDropAt: (payload, idx) => handleDropOnBlock(day, block.key, idx)(payload),
                            })}
                            <AddTask onAdd={text => addTask(day, block.key, text)} placeholder={block.label} />
                          </DropZone>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {showRollover && <RolloverModal items={getIncompleteItems()} onConfirm={handleRollover} onCancel={() => setShowRollover(false)} />}
        {showRollDay && <RollDayModal weekData={weekData} todayName={todayName} onConfirm={handleRollDay} onCancel={() => setShowRollDay(false)} />}
        {showExport && <ExportModal currentWeek={currentWeek} lists={runningLists} onClose={() => setShowExport(false)} />}
        {showQuickNote && (
          <NotesPanel note={quickNote} onSave={saveQuickNoteFn} onClose={() => setNotesOpen(false)} saving={saving}
            defaultDay={isCurrentWeek && todayName ? todayName : "Monday"} onSend={sendNotesToPlanner}
            docked={isDesktop} width={notesWidth} onResize={resizeNotes} />
        )}
      </div>
    </>
  );
}
