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

const FONTS_URL = "https://fonts.googleapis.com/css2?family=Syne:wght@700&family=DM+Sans:wght@300;400;500;600&display=swap";

const C = {
  bg: "#F5F6F8", surface: "#FFFFFF", surfaceAlt: "#FAFBFC",
  text: "#1A1D26", muted: "#6B7280", dim: "#B0B5C0", border: "rgba(0,0,0,0.07)",
  accent: "#4F6AE8", green: "#22C55E", amber: "#E8930C", slate: "#64748B", danger: "#EF4444",
  accentDim: "rgba(79,106,232,0.08)", accentGlow: "rgba(79,106,232,0.15)",
  greenDim: "rgba(34,197,94,0.08)",
  amberDim: "rgba(232,147,12,0.07)", slateDim: "rgba(100,116,139,0.06)",
};
const font = { heading: "'Syne', sans-serif", body: "'DM Sans', sans-serif" };

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Weekend"];
const BLOCKS = [
  { key: "Morning", label: "Morning", icon: "◐", color: C.amber, dim: C.amberDim },
  { key: "Afternoon", label: "Afternoon", icon: "◑", color: C.accent, dim: C.accentDim },
  { key: "Admin", label: "Admin", icon: "▤", color: C.slate, dim: C.slateDim },
];
const LISTS = [
  { key: "This Week", label: "This Week", icon: "⚡" },
  { key: "Next 30 Days", label: "Next 30 Days", icon: "◇" },
  { key: "Radar", label: "Radar", icon: "◉" },
  { key: "Think", label: "Think", icon: "△" },
];

const genId = () => Math.random().toString(36).substr(2, 9);
const getWeekKey = (date) => { const d = new Date(date); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); return new Date(d.setDate(diff)).toISOString().split("T")[0]; };
const getWeekLabel = (wk) => { const s = new Date(wk + "T00:00:00"), e = new Date(s); e.setDate(e.getDate() + 4); const f = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); return `${f(s)} – ${f(e)}, ${s.getFullYear()}`; };
const getAdjacentWeek = (wk, off) => { const d = new Date(wk + "T00:00:00"); d.setDate(d.getDate() + 7 * off); return getWeekKey(d); };
const emptyWeek = () => { const days = {}; DAYS.forEach(d => { days[d] = {}; BLOCKS.forEach(b => { days[d][b.key] = []; }); }); return { priorities: "", days }; };
const emptyLists = () => { const l = {}; LISTS.forEach(li => { l[li.key] = []; }); return l; };

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

function TaskItem({ task, onToggle, onUpdate, onDelete, dragType, dragZone }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.text);
  const ref = useRef(null);
  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);
  const save = () => { if (text.trim()) onUpdate(task.id, text.trim()); else onDelete(task.id); setEditing(false); };
  return (
    <div draggable={!editing}
      onDragStart={e => { dragPayload = { task: { ...task }, type: dragType, zone: dragZone }; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", task.id); e.currentTarget.style.opacity = "0.4"; }}
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
          style={{ flex: 1, fontSize: 13, fontFamily: font.body, cursor: "text", textDecoration: task.done ? "line-through" : "none", color: task.done ? C.dim : C.text, lineHeight: 1.45, wordBreak: "break-word" }}>{task.text}</span>
      )}
      <button onClick={() => onDelete(task.id)}
        style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1, marginTop: 1, flexShrink: 0 }}
        onMouseEnter={e => e.target.style.color = C.danger} onMouseLeave={e => e.target.style.color = C.dim}>×</button>
    </div>
  );
}

// Edit #2: AddTask now submits on blur (when you tap/click elsewhere)
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

function RolloverModal({ items, onConfirm, onCancel }) {
  const [selected, setSelected] = useState(items.map(i => i.id));
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 14, padding: 24, maxWidth: 480, width: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 40px rgba(0,0,0,0.12)" }}>
        <h3 style={{ margin: "0 0 4px", fontFamily: font.heading, fontSize: 18, color: C.text }}>Roll Over → Next Week</h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: C.muted, fontFamily: font.body }}>Incomplete tasks will be added to next Monday's Morning block. Uncheck any you want to leave behind.</p>
        <div style={{ flex: 1, overflowY: "auto", marginBottom: 16 }}>
          {items.length === 0 ? <p style={{ fontSize: 13, color: C.dim, textAlign: "center", padding: 20 }}>No incomplete tasks to roll over! 🎉</p>
          : items.map(item => (
            <label key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: selected.includes(item.id) ? C.accentDim : "transparent", border: `1px solid ${selected.includes(item.id) ? "rgba(79,106,232,0.2)" : "transparent"}`, marginBottom: 4 }}>
              <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} style={{ marginTop: 2, accentColor: C.accent }} />
              <div><span style={{ fontSize: 13, color: C.text }}>{item.text}</span><span style={{ display: "block", fontSize: 11, color: C.dim, marginTop: 2 }}>{item.day} · {item.block}</span></div>
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, fontFamily: font.body, fontSize: 13, cursor: "pointer", color: C.muted }}>Cancel</button>
          <button onClick={() => onConfirm(selected)} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontFamily: font.body, fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: `0 0 16px ${C.accentGlow}` }}>
            {items.length === 0 ? "Start New Week" : `Roll Over (${selected.length})`}
          </button>
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
        <h3 style={{ fontFamily: font.heading, fontSize: 18, margin: "0 0 16px", color: C.text }}>↓ Export Planner</h3>
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

function QuickNoteModal({ note, onSave, onClose }) {
  const [text, setText] = useState(note);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 14, padding: 20, width: 400, maxWidth: "100%", boxShadow: "0 20px 40px rgba(0,0,0,0.12)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontFamily: font.heading, fontSize: 15, fontWeight: 700, color: C.text }}>✎ Quick Notes</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <textarea value={text} onChange={e => { setText(e.target.value); onSave(e.target.value); }} placeholder="Jot down anything..." rows={10}
          style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px", fontFamily: font.body, fontSize: 16, color: C.text, resize: "vertical", outline: "none", background: C.surfaceAlt, boxSizing: "border-box", lineHeight: 1.6 }}
          onFocus={e => e.target.style.borderColor = C.accent} onBlur={e => e.target.style.borderColor = C.border} />
        <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>Syncs across all your devices</div>
      </div>
    </div>
  );
}

// Edit #3: Swipe hook for mobile tab switching
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
    touchStart.current = null;
    touchEnd.current = null;
  };

  return { onTouchStart, onTouchMove, onTouchEnd };
}

export default function WeeklyPlanner() {
  const [currentWeek, setCurrentWeek] = useState(getWeekKey(new Date()));
  const [weekData, setWeekData] = useState(null);
  const [runningLists, setRunningLists] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [collapsedDays, setCollapsedDays] = useState({});
  const [mobileView, setMobileView] = useState("week");
  const [showRollover, setShowRollover] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [quickNote, setQuickNote] = useState("");
  const [allCollapsed, setAllCollapsed] = useState(false);
  const saveTimeout = useRef(null);
  const noteTimeout = useRef(null);
  const isCurrentWeek = currentWeek === getWeekKey(new Date());

  // Edit #3: swipe between Week and Lists on mobile
  const swipeHandlers = useSwipe(
    () => setMobileView("lists"),  // swipe left → show lists
    () => setMobileView("week")    // swipe right → show week
  );

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
        setWeekData(week || emptyWeek());
        setRunningLists(lists || emptyLists());
        if (note) setQuickNote(note);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentWeek]);

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
    const d = new Date(currentWeek + "T00:00:00");
    d.setDate(d.getDate() + DAYS.indexOf(dayName));
    return d;
  };

  const updateWeek = (updater) => {
    setWeekData(prev => { const next = typeof updater === "function" ? updater(JSON.parse(JSON.stringify(prev))) : updater; debouncedSave(`planner-week:${currentWeek}`, next); return next; });
  };
  const updateLists = (updater) => {
    setRunningLists(prev => { const next = typeof updater === "function" ? updater(JSON.parse(JSON.stringify(prev))) : updater; debouncedSave("planner-running-lists", next); return next; });
  };

  const addTask = (day, block, text) => { updateWeek(w => { w.days[day][block].push({ id: genId(), text, done: false }); return w; }); };
  const toggleTask = (day, block, id) => { updateWeek(w => { const t = w.days[day][block].find(x => x.id === id); if (t) t.done = !t.done; return w; }); };
  const editTask = (day, block, id, text) => { updateWeek(w => { const t = w.days[day][block].find(x => x.id === id); if (t) t.text = text; return w; }); };
  const deleteTask = (day, block, id) => { updateWeek(w => { w.days[day][block] = w.days[day][block].filter(x => x.id !== id); return w; }); };

  const addListItem = (ln, text) => { updateLists(l => { if (!l[ln]) l[ln] = []; l[ln].push({ id: genId(), text, done: false }); return l; }); };
  const toggleListItem = (ln, id) => { updateLists(l => { const t = l[ln]?.find(x => x.id === id); if (t) t.done = !t.done; return l; }); };
  const editListItem = (ln, id, text) => { updateLists(l => { const t = l[ln]?.find(x => x.id === id); if (t) t.text = text; return l; }); };
  const deleteListItem = (ln, id) => { updateLists(l => { l[ln] = l[ln].filter(x => x.id !== id); return l; }); };

  const handleDropOnBlock = (day, block) => (payload) => {
    const { task, type, zone } = payload;
    if (type === "week") {
      const [srcDay, srcBlock] = zone.split("|");
      updateWeek(w => { w.days[srcDay][srcBlock] = w.days[srcDay][srcBlock].filter(t => t.id !== task.id); w.days[day][block].push({ id: genId(), text: task.text, done: task.done }); return w; });
    } else if (type === "list") {
      updateLists(l => { l[zone] = l[zone].filter(t => t.id !== task.id); return l; });
      updateWeek(w => { w.days[day][block].push({ id: genId(), text: task.text, done: false }); return w; });
    }
  };
  const handleDropOnList = (listName) => (payload) => {
    const { task, type, zone } = payload;
    if (type === "list") {
      if (zone === listName) return;
      updateLists(l => { l[zone] = l[zone].filter(t => t.id !== task.id); l[listName].push({ id: genId(), text: task.text, done: task.done }); return l; });
    } else if (type === "week") {
      const [srcDay, srcBlock] = zone.split("|");
      updateWeek(w => { w.days[srcDay][srcBlock] = w.days[srcDay][srcBlock].filter(t => t.id !== task.id); return w; });
      updateLists(l => { if (!l[listName]) l[listName] = []; l[listName].push({ id: genId(), text: task.text, done: false }); return l; });
    }
  };

  // Edit #1: Expand/Collapse All
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
  const handleRollover = async (selectedIds) => {
    const nextWeek = getAdjacentWeek(currentWeek, 1);
    const existing = (await loadStorage(`planner-week:${nextWeek}`)) || emptyWeek();
    getIncompleteItems().filter(i => selectedIds.includes(i.id)).forEach(item => { existing.days["Monday"]["Morning"].push({ id: genId(), text: item.text, done: false }); });
    await saveStorage(`planner-week:${nextWeek}`, existing);
    setShowRollover(false); setCurrentWeek(nextWeek);
  };

  const stats = (() => { if (!weekData) return { total: 0, done: 0 }; let total = 0, done = 0; DAYS.forEach(d => BLOCKS.forEach(b => { (weekData.days[d]?.[b.key] || []).forEach(t => { total++; if (t.done) done++; }); })); return { total, done }; })();
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const todayIndex = new Date().getDay() - 1;
  const todayName = todayIndex >= 0 && todayIndex < 5 ? DAYS[todayIndex] : (todayIndex >= 5 || todayIndex === -1 ? "Weekend" : null);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg, fontFamily: font.body, color: C.dim }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 18, height: 18, border: `2px solid ${C.accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Loading...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <>
      <link href={FONTS_URL} rel="stylesheet" />
      <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: font.body }}
        {...swipeHandlers}>
        <style>{`
          * { box-sizing: border-box; -webkit-text-size-adjust: 100%; }
          ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 3px; }
          textarea::placeholder, input::placeholder { color: ${C.dim}; }
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
          @media (min-width: 768px) { .mobile-tabs { display: none !important; } .lists-panel { display: block !important; } .week-panel { display: block !important; } }
          @media (max-width: 767px) { .mobile-tabs { display: flex !important; } .lists-panel { width: 100% !important; min-width: 100% !important; border-right: none !important; } .week-panel { width: 100% !important; } .header-actions { gap: 6px !important; } .header-actions button { padding: 6px 10px !important; font-size: 11px !important; } }
        `}</style>

        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "10px 16px 0", position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingBottom: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto" }}>
              <div style={{ display: "flex", flexShrink: 0 }}>
                <button onClick={() => setCurrentWeek(getAdjacentWeek(currentWeek, -1))} style={{ background: "rgba(0,0,0,0.04)", border: `1px solid ${C.border}`, color: C.muted, borderRadius: "6px 0 0 6px", padding: "5px 10px", cursor: "pointer", fontSize: 15 }}>‹</button>
                <button onClick={() => setCurrentWeek(getAdjacentWeek(currentWeek, 1))} style={{ background: "rgba(0,0,0,0.04)", border: `1px solid ${C.border}`, borderLeft: "none", color: C.muted, borderRadius: "0 6px 6px 0", padding: "5px 10px", cursor: "pointer", fontSize: 15 }}>›</button>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: font.heading, fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{getWeekLabel(currentWeek)}</div>
                {stats.total > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: C.muted }}>{stats.done}/{stats.total}</span>
                    <div style={{ width: 60, height: 4, background: "rgba(0,0,0,0.06)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: pct + "%", background: `linear-gradient(90deg, ${C.accent}, ${C.green})`, borderRadius: 2, transition: "width 0.4s" }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="header-actions" style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
              {saving && <span style={{ fontSize: 11, color: C.dim, display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, animation: "pulse 1s infinite" }} /> syncing</span>}
              {!isCurrentWeek && <button onClick={() => setCurrentWeek(getWeekKey(new Date()))} style={{ background: "rgba(0,0,0,0.04)", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontFamily: font.body }}>Today</button>}
              <button onClick={() => setShowExport(true)} style={{ background: "rgba(0,0,0,0.04)", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontFamily: font.body }}>↓ Export</button>
              <button onClick={() => setShowQuickNote(true)} style={{ background: showQuickNote ? C.accentDim : "rgba(0,0,0,0.04)", border: `1px solid ${showQuickNote ? "rgba(79,106,232,0.3)" : C.border}`, color: showQuickNote ? C.accent : C.muted, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontFamily: font.body }}>✎ Notes</button>
              {/* Edit #1: Expand/Collapse All button */}
              <button onClick={toggleAllDays} style={{ background: "rgba(0,0,0,0.04)", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontFamily: font.body }}>
                {allCollapsed ? "▸ Expand" : "▾ Collapse"}
              </button>
              <button onClick={() => setShowRollover(true)} style={{ background: C.accent, border: "none", color: "#fff", borderRadius: 8, padding: "6px 16px", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font.body, boxShadow: `0 0 20px ${C.accentGlow}` }}>Roll Over →</button>
            </div>
          </div>
          <div className="mobile-tabs" style={{ display: "none", borderTop: `1px solid ${C.border}` }}>
            {[{ key: "week", label: "📅 Week" }, { key: "lists", label: "📋 Lists" }].map(tab => (
              <button key={tab.key} onClick={() => setMobileView(tab.key)}
                style={{ flex: 1, padding: "10px 0", border: "none", background: "transparent", color: mobileView === tab.key ? C.accent : C.dim, fontSize: 13, cursor: "pointer", fontFamily: font.body, fontWeight: 600, borderBottom: mobileView === tab.key ? `2.5px solid ${C.accent}` : "2.5px solid transparent" }}>{tab.label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", maxWidth: 1200, margin: "0 auto", minHeight: "calc(100vh - 110px)" }}>
          <div className="lists-panel" style={{ width: 280, minWidth: 280, borderRight: `1px solid ${C.border}`, background: C.surface, padding: 16, overflowY: "auto", display: mobileView === "lists" ? "block" : "none" }}>
            {LISTS.map(li => (
              <DropZone key={li.key} onDrop={handleDropOnList(li.key)} style={{ marginBottom: 16, padding: 10, border: `1px solid ${C.border}`, borderRadius: 10, background: C.surfaceAlt }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, padding: "4px 0" }}>
                  <span style={{ fontSize: 14, opacity: 0.55 }}>{li.icon}</span>
                  <span style={{ fontFamily: font.heading, fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{li.label}</span>
                  <span style={{ fontSize: 10, marginLeft: "auto", background: C.accentDim, color: C.accent, padding: "1px 7px", borderRadius: 99, fontWeight: 600 }}>{(runningLists?.[li.key] || []).filter(i => !i.done).length}</span>
                </div>
                {(runningLists?.[li.key] || []).map(item => (
                  <TaskItem key={item.id} task={item} dragType="list" dragZone={li.key}
                    onToggle={id => toggleListItem(li.key, id)} onUpdate={(id, text) => editListItem(li.key, id, text)} onDelete={id => deleteListItem(li.key, id)} />
                ))}
                <AddTask onAdd={text => addListItem(li.key, text)} placeholder={`Add to ${li.label.toLowerCase()}...`} />
              </DropZone>
            ))}
          </div>

          <div className="week-panel" style={{ flex: 1, overflowY: "auto", padding: 16, display: mobileView === "week" ? "block" : "none" }}>
            <div style={{ marginBottom: 14, padding: "12px 16px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, fontFamily: font.heading }}>Weekly Priorities</div>
              <textarea value={weekData?.priorities || ""} onChange={e => updateWeek(w => ({ ...w, priorities: e.target.value }))} placeholder="What matters most this week?" rows={2}
                style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 16, fontFamily: font.body, color: C.text, resize: "vertical", lineHeight: 1.6 }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {DAYS.map(day => {
                const isWeekend = day === "Weekend";
                const isToday = isCurrentWeek && day === todayName;
                const isExpanded = !collapsedDays[day];
                const dayTasks = BLOCKS.reduce((s, b) => s + (weekData?.days[day]?.[b.key]?.length || 0), 0);
                const dayDone = BLOCKS.reduce((s, b) => s + (weekData?.days[day]?.[b.key]?.filter(t => t.done).length || 0), 0);
                const dayDateStr = isWeekend
                  ? (() => { const sat = new Date(currentWeek + "T00:00:00"); sat.setDate(sat.getDate() + 5); const sun = new Date(sat); sun.setDate(sun.getDate() + 1); return `${sat.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })} – ${sun.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}`; })()
                  : getDayDate(day).toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
                const bgColor = isToday ? "rgba(79,106,232,0.03)" : isWeekend ? "#F0F1F3" : C.surfaceAlt;
                const borderColor = isToday ? "1px solid rgba(79,106,232,0.3)" : `1px solid ${C.border}`;
                return (
                  <div key={day} style={{ borderRadius: 10, overflow: "hidden", border: borderColor, background: bgColor, boxShadow: isToday ? "0 0 30px rgba(79,106,232,0.06)" : "0 1px 3px rgba(0,0,0,0.03)" }}>
                    <button onClick={() => setCollapsedDays(prev => ({ ...prev, [day]: !prev[day] }))}
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", border: "none", background: "transparent", cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: font.heading, fontWeight: 700, fontSize: 14, color: isToday ? C.accent : isWeekend ? C.slate : C.text }}>{day}</span>
                        <span style={{ fontSize: 12, color: C.muted, fontWeight: 400 }}>{dayDateStr}</span>
                        {isToday && <span style={{ fontSize: 10, background: C.accent, color: "white", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>today</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {dayTasks > 0 && <span style={{ fontSize: 11, color: C.dim }}>{dayDone}/{dayTasks}</span>}
                        <span style={{ color: C.dim, fontSize: 12, transition: "transform 0.2s", transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)", display: "inline-block" }}>▾</span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                        {BLOCKS.map(block => (
                          <DropZone key={block.key} onDrop={handleDropOnBlock(day, block.key)} style={{ background: block.dim, borderRadius: 8, padding: "8px 12px", border: "1px solid rgba(0,0,0,0.04)" }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: block.color, marginBottom: 5, display: "flex", alignItems: "center", gap: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                              <span style={{ fontSize: 12 }}>{block.icon}</span> {block.label}
                            </div>
                            {(weekData?.days[day]?.[block.key] || []).map(task => (
                              <TaskItem key={task.id} task={task} dragType="week" dragZone={`${day}|${block.key}`}
                                onToggle={id => toggleTask(day, block.key, id)} onUpdate={(id, text) => editTask(day, block.key, id, text)} onDelete={id => deleteTask(day, block.key, id)} />
                            ))}
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
        {showExport && <ExportModal currentWeek={currentWeek} lists={runningLists} onClose={() => setShowExport(false)} />}
        {showQuickNote && <QuickNoteModal note={quickNote} onSave={saveQuickNoteFn} onClose={() => setShowQuickNote(false)} />}
      </div>
    </>
  );
}
