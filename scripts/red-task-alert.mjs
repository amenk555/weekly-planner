// Daily check for unfinished red (**) tasks; sends email (Resend) and phone push (ntfy).
// Run logs are public on this repo, so never log task text.
import { pathToFileURL } from "node:url";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://vsepkhuppboolbtbkszj.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZXBraHVwcGJvb2xidGJrc3pqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzU0ODgsImV4cCI6MjA4ODI1MTQ4OH0.w9ZVBfxJ-ZPM7cSaztoDnzjYMonEJL5p2s0qUSWMIBA";
const TZ = "America/Chicago";
const BLOCKS = ["Morning", "Afternoon", "Admin"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const LAST_RUN_KEY = "planner-alert-last-run";
// Alerts go out between 3:30pm and 5:30pm Central; several cron runs land in this window and the last-run marker dedupes them.
const WINDOW_START = 15 * 60 + 30;
const WINDOW_END = 17 * 60 + 30;

const pad = (n) => String(n).padStart(2, "0");

export function centralNow(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  return { y: +parts.year, m: +parts.month, d: +parts.day, hour: +parts.hour, minute: +parts.minute, weekday: parts.weekday };
}

// Mirrors the app: weeks start Monday, and Saturday/Sunday share the "Weekend" bucket.
export function plannerDay({ y, m, d, weekday }) {
  const idx = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
  const monday = new Date(Date.UTC(y, m - 1, d - idx));
  return {
    weekKey: monday.toISOString().slice(0, 10),
    dayName: idx < 5 ? WEEKDAYS[idx] : "Weekend",
    dateStr: `${y}-${pad(m)}-${pad(d)}`,
  };
}

export function openRedTasks(week, dayName) {
  const day = week?.days?.[dayName] || {};
  return BLOCKS.flatMap((block) =>
    (day[block] || [])
      .filter((t) => !t.done && typeof t.text === "string" && t.text.startsWith("**"))
      .map((t) => ({ text: t.text.slice(2).trim(), block }))
  );
}

const sbHeaders = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

async function loadKey(key) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/planner_data?key=eq.${encodeURIComponent(key)}&select=value`, { headers: sbHeaders });
  if (!res.ok) throw new Error(`Supabase read failed: ${res.status}`);
  const rows = await res.json();
  return rows[0]?.value ?? null;
}

async function saveKey(key, value) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/planner_data?on_conflict=key`, {
    method: "POST",
    headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ key, value }]),
  });
  if (!res.ok) throw new Error(`Supabase write failed: ${res.status}`);
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function buildMessage(tasks, dayName, isTest) {
  const prefix = isTest ? "[Test] " : "";
  const count = tasks.length;
  const subject = count
    ? `${prefix}${count} red task${count === 1 ? "" : "s"} still open today`
    : `${prefix}No open red tasks today`;
  const lines = tasks.map((t) => `• ${t.text} (${t.block})`);
  const text = count ? `Still open for ${dayName}:\n${lines.join("\n")}` : `Nothing red left open for ${dayName}.`;
  const html = count
    ? `<p>Still open for <strong>${dayName}</strong>:</p><ul>${tasks.map((t) => `<li><strong style="color:#DC2626">${escapeHtml(t.text)}</strong> <span style="color:#6B7280">(${t.block})</span></li>`).join("")}</ul>`
    : `<p>Nothing red left open for ${dayName}.</p>`;
  return { subject, text, html };
}

async function sendEmail({ subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL;
  if (!apiKey || !to) { console.log("Email: skipped (RESEND_API_KEY or ALERT_EMAIL not set)"); return; }
  const appUrl = process.env.APP_URL;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.ALERT_FROM || "Weekly Planner <onboarding@resend.dev>",
      to: [to],
      subject,
      text: appUrl ? `${text}\n\nOpen planner: ${appUrl}` : text,
      html: appUrl ? `${html}<p><a href="${escapeHtml(appUrl)}">Open planner</a></p>` : html,
    }),
  });
  if (!res.ok) throw new Error(`Email failed: ${res.status} ${await res.text()}`);
  console.log("Email: sent");
}

async function sendPush({ subject, text }) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) { console.log("Push: skipped (NTFY_TOPIC not set)"); return; }
  const headers = { Title: subject, Priority: "high", Tags: "red_circle" };
  if (process.env.APP_URL) headers.Click = process.env.APP_URL;
  const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, { method: "POST", headers, body: text });
  if (!res.ok) throw new Error(`Push failed: ${res.status} ${await res.text()}`);
  console.log("Push: sent");
}

async function main() {
  const isTest = process.env.TEST_MODE === "true";
  const now = centralNow();
  const { weekKey, dayName, dateStr } = plannerDay(now);
  const minutes = now.hour * 60 + now.minute;
  console.log(`Central time ${dateStr} ${pad(now.hour)}:${pad(now.minute)} (${dayName})${isTest ? " [test mode]" : ""}`);

  if (!isTest) {
    if (minutes < WINDOW_START || minutes > WINDOW_END) { console.log("Outside alert window; exiting."); return; }
    if ((await loadKey(LAST_RUN_KEY)) === dateStr) { console.log("Already checked today; exiting."); return; }
  }

  const week = await loadKey(`planner-week:${weekKey}`);
  const tasks = openRedTasks(week, dayName);
  console.log(`Open red tasks: ${tasks.length}`);

  if (tasks.length || isTest) {
    const msg = buildMessage(tasks, dayName, isTest);
    const results = await Promise.allSettled([sendEmail(msg), sendPush(msg)]);
    const failures = results.filter((r) => r.status === "rejected");
    failures.forEach((f) => console.error(f.reason.message));
    // Leave the marker unset on failure so the next scheduled run retries.
    if (failures.length) process.exit(1);
  }

  if (!isTest) await saveKey(LAST_RUN_KEY, dateStr);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
