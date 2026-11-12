import "./styles.css";
import LOGO from "./assets/logo.png";
import { sb, configured } from "./supabase.js";
import { searchList } from "./search.js";

const STAGES = ["Sourced", "Applied", "Shortlisted", "Screening", "Interview", "Offer", "Hired", "Rejected", "Withdrawn"];
// Rejected = HighCall VA decided not to continue. Withdrawn = the candidate declined or pulled out.
const STAGE_LABEL = { Rejected: "Rejected (our decision)", Withdrawn: "Withdrawn (candidate declined or pulled out)" };
const CLOSED = ["Hired", "Rejected", "Withdrawn"];
const APP_NAME = "HighCall Careers"; // product name in the sidebar, like "DeviceCare"
const STATUS_LABEL = { draft: "Draft", public: "Public", internal: "Internal", archived: "Archived" };
const S = {
  session: null, staff: null, recovery: false, isRecruiter: false, isAdmin: false, isMember: false,
  roles: [], cands: [], pipes: [], templates: [], settings: {}, team: [],
  ready: false, loadError: "",
  ui: { route: null, poolQ: "", roleQ: "", stage: "all", roleTab: "active", sel: new Set(), f: {}, targetRole: "", openJob: null },
};

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ts = (s) => (s ? Date.parse(s) : 0);
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");
const ago = (s) => { if (!s) return ""; const d = (Date.now() - ts(s)) / 864e5; if (d < 1) return "today"; if (d < 2) return "yesterday"; if (d < 30) return Math.floor(d) + " days ago"; return fmtDate(s); };
const initials = (n) => (n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : null; };
const nowIso = () => new Date().toISOString();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2800); }
function lines(t) { return String(t || "").split(/\n+/).map((s) => s.replace(/^[-•*]\s*/, "").trim()).filter(Boolean); }
async function q(promise) { const { data, error } = await promise; if (error) throw error; return data; }
function writeErr(e) {
  console.error(e);
  if (e?.code === "23505") toast("A candidate with that email is already in the talent pool.");
  else if (e?.code === "42501" || /row-level security/i.test(e?.message || "")) toast("Your account doesn’t have permission to do that.");
  else toast(e?.message ? "Couldn’t save: " + e.message : "That didn’t save. Check your connection and try again.");
}
const ICON = {
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></svg>',
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 5-3.4 8.6-7 10-3.6-1.4-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  userplus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M19 8v6M16 11h6"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
  roles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  pool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 5.5 5.5"/></svg>',
  careers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
};

/* ---------- derived ---------- */
const roleById = (id) => S.roles.find((r) => r.id === id);
const candById = (id) => S.cands.find((c) => c.id === id);
const pipeFor = (cid, roleId) => S.pipes.find((p) => p.candidate_id === cid && (p.role_id || null) === (roleId || null));
const roleTitle = (id) => (!id ? "Talent pool" : roleById(id)?.title || "Removed role");
const candRoles = (c) => S.pipes.filter((p) => p.candidate_id === c.id && p.role_id).map((p) => p.role_id);
const titlesFor = (c) => candRoles(c).map(roleTitle).join(" ");
function roleEntries(roleId) {
  return S.pipes.filter((p) => p.role_id === roleId).map((p) => ({ pipe: p, cand: candById(p.candidate_id), stage: p.stage || "Applied", appliedAt: p.created_at })).filter((e) => e.cand);
}
function readiness(c, role) {
  const d = c.device || {};
  if (!d.checkedAt) return { cls: "", label: "Not checked" };
  const issues = [];
  if (num(role?.min_download) != null && (num(d.down) ?? 0) < num(role.min_download)) issues.push("speed");
  if (num(role?.min_ram) != null && (num(d.ram) ?? 0) < num(role.min_ram)) issues.push("RAM");
  if (role?.need_backup) { if (d.backupDevice !== "yes") issues.push("backup device"); if (d.backupNet !== "yes") issues.push("backup internet"); if (d.backupPower !== "yes") issues.push("backup power"); }
  return issues.length ? { cls: "warn", label: "Below spec: " + issues.join(", ") } : { cls: "ok", label: "Meets specs" };
}
function questionsFor(roleId) { return (S.templates.find((t) => (t.role_id || null) === (roleId || null))?.questions) || []; }
const appliedKey = "hcva-applied";
const myApplied = () => { try { return JSON.parse(localStorage.getItem(appliedKey) || "{}"); } catch { return {}; } };
const rememberApplied = (id) => { try { const m = myApplied(); m[id || "pool"] = Date.now(); localStorage.setItem(appliedKey, JSON.stringify(m)); } catch {} };

/* ---------- data ---------- */
async function setSession(session) {
  S.session = session; S.staff = null;
  if (session) { S.staff = (await sb.from("ats_staff").select("*").eq("user_id", session.user.id).maybeSingle()).data || null; }
  S.isAdmin = S.staff?.role === "admin";
  S.isRecruiter = S.isAdmin || S.staff?.role === "recruiter";
  S.isMember = !!S.staff;
}
async function loadAll() {
  S.loadError = "";
  try {
    const jobs = [q(sb.from("ats_settings").select("key,value")), q(sb.from("ats_roles").select("*").order("updated_at", { ascending: false }))];
    if (S.isRecruiter) jobs.push(
      q(sb.from("ats_candidates").select("*").order("created_at", { ascending: false })),
      q(sb.from("ats_pipeline").select("*")),
      q(sb.from("ats_screening_templates").select("*")),
      q(sb.from("ats_staff").select("*").order("created_at")),
    );
    const [settings, roles, cands, pipes, templates, team] = await Promise.all(jobs);
    S.settings = Object.fromEntries((settings || []).map((r) => [r.key, r.value]));
    S.roles = roles || [];
    S.cands = cands || []; S.pipes = pipes || []; S.templates = templates || []; S.team = team || [];
  } catch (e) { console.error(e); S.loadError = "Couldn’t load data. Check your connection and refresh."; }
  S.ready = true;
}
async function reload() { await loadAll(); refresh(); }
let focusT = 0;
window.addEventListener("focus", () => { if (S.isRecruiter && Date.now() - focusT > 20000 && !$("#layer").innerHTML) { focusT = Date.now(); reload(); } });

/* ---------- routing ---------- */
const STAFF_ROUTES = ["dashboard", "roles", "pool", "config"];
function route() {
  let h = location.hash.replace(/^#/, "");
  if (S.recovery && S.session) { S.ui.route = "setpw"; render(); return; }
  if (h === "login" && S.session) h = S.isRecruiter ? "dashboard" : S.isMember ? "careers" : "noaccess";
  else if (STAFF_ROUTES.includes(h) || h.startsWith("role-")) { if (!S.isRecruiter) h = S.session ? "noaccess" : "login"; }
  else if (h !== "login") h = S.isRecruiter && !h ? "dashboard" : "careers";
  S.ui.route = h; render();
}
window.addEventListener("hashchange", () => { S.ui.sel.clear(); S.ui.roleQ = ""; S.ui.stage = "all"; route(); });
const go = (h) => { if (location.hash === "#" + h) route(); else location.hash = h; };

let mounted = null;
function render() {
  const r = S.ui.route, root = $("#root"), key = r.startsWith("role-") ? r : r;
  if (mounted !== key) { mounted = key; root.innerHTML = shell(r); bindShell(); }
  update(r);
}
function refresh() { if (S.ui.route) render(); }
const CRUMB = { dashboard: "Dashboard", roles: "Roles", pool: "Talent pool", config: "Settings" };
const manilaDate = () => new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(new Date());
function shell(r) {
  if (r === "careers" || r === "login" || r === "noaccess" || r === "setpw") {
    const bar = S.isRecruiter && r === "careers" ? `<div class="previewbar"><span>You’re viewing the public careers page</span><a class="btn sm" href="#dashboard">Back to recruiting</a></div>` : "";
    return `<div class="app public">${bar}<div id="view"></div></div>`;
  }
  const nav = [["dashboard", "Dashboard", ICON.dash], ["roles", "Roles", ICON.roles], ["pool", "Talent pool", ICON.pool], ["careers", "Careers page", ICON.careers]];
  const cur = r.startsWith("role-") ? "roles" : r;
  const role = r.startsWith("role-") ? roleById(r.slice(5)) : null;
  const crumb = role ? `<a href="#roles" style="color:inherit;text-decoration:none">Roles</a><i>/</i><b>${esc(role.title)}</b>` : `<b>${CRUMB[cur] || ""}</b>`;
  const navLink = ([h, l, i]) => `<a href="#${h}" class="${cur === h ? "on" : ""}">${i}${l}<span class="count" data-count="${h}"></span></a>`;
  return `<div class="app" id="app"><aside class="side" id="side">
      <div class="brand"><img src="${LOGO}" alt="HighCall VA"><div><b>${APP_NAME}</b><span>HighCall Virtual Assistants</span></div></div>
      <div class="navlabel">Workspace</div>
      <nav class="nav">${nav.map(navLink).join("")}</nav>
      <div class="navlabel" style="margin-top:26px">Admin</div>
      <nav class="nav">${navLink(["config", "Settings", ICON.settings])}<a href="#" id="signout">${ICON.logout}Sign out</a></nav>
      <div class="tagline">${ICON.heart}The right people. The right setup.</div>
    </aside>
    <div class="main">
      <header class="topbar"><button class="menubtn" id="menubtn" aria-label="Open menu">${ICON.menu}</button>
        <div class="crumbs"><span>HCVA</span><i>/</i>${crumb}</div>
        <div class="meta"><span class="when">${manilaDate()} · Manila</span><span class="session">${S.isAdmin ? "Admin" : "Recruiter"} session</span></div>
      </header>
      <main id="view"></main>
    </div></div>`;
}
function bindShell() {
  const so = $("#signout"); if (so) so.onclick = (e) => { e.preventDefault(); signOut(); };
  const mb = $("#menubtn"), app = $("#app");
  if (mb && app) {
    mb.onclick = () => app.classList.toggle("navopen");
    app.addEventListener("click", (e) => { if (app.classList.contains("navopen") && (e.target.closest(".nav a") || !e.target.closest(".side,.menubtn"))) app.classList.remove("navopen"); });
  }
}
function pageHead(eyebrow, title, sub, actions = "") {
  return `<div class="pagehead"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${actions ? `<div class="actions">${actions}</div>` : ""}</div>`;
}
async function signOut() { await sb.auth.signOut(); location.hash = "careers"; }
function update(r) {
  const v = $("#view"); if (!v) return;
  $$("[data-count]").forEach((el) => { const k = el.dataset.count; el.textContent = k === "roles" ? S.roles.filter((x) => x.status === "public" || x.status === "internal").length || "" : k === "pool" ? S.cands.length || "" : ""; });
  if (!S.ready) { v.innerHTML = `<div class="ldr" style="max-width:240px;margin:40px auto"></div>`; return; }
  if (r === "careers") return viewCareers(v);
  if (r === "login") return viewLogin(v);
  if (r === "setpw") return viewSetPassword(v);
  if (r === "noaccess") return viewNoAccess(v);
  if (S.loadError) { v.innerHTML = `<div class="note warn">${esc(S.loadError)}</div>`; return; }
  if (r === "dashboard") return viewDashboard(v);
  if (r === "roles") return viewRoles(v);
  if (r === "pool") return viewPool(v);
  if (r === "config") return viewSettings(v);
  if (r.startsWith("role-")) return viewRole(v, r.slice(5));
}

/* ---------- login ---------- */
function authOpen() {
  return `<div class="auth"><div class="art"><img class="loop" src="${LOGO}" alt="">
      <div class="brand" style="padding:0"><img src="${LOGO}" alt="HighCall VA"><div><b>${APP_NAME}</b><span>HighCall Virtual Assistants</span></div></div>
      <h2>The right people. Ready to work.</h2>
      <p>Roles, candidates, screening and hiring for the HighCall VA team, in one place.</p></div>
    <div class="formside"><div class="formcard">`;
}
const authClose = `</div></div></div>`;
function viewLogin(v, mode = "signin") {
  const reset = mode === "reset";
  v.innerHTML = `${authOpen()}
    <h1>${reset ? "Reset your password" : "Team sign in"}</h1>
    <p class="muted" style="margin:0 0 20px">${reset ? "Enter your HCVA login email and we’ll send a link to set a new password." : "Use your HCVA login. It’s the same email and password you use for DeviceCare."}</p>
    <form class="stack" id="lf" novalidate>
      <label class="f">Email<input class="in" type="email" name="email" required autocomplete="username"></label>
      ${reset ? "" : `<label class="f">Password<input class="in" type="password" name="password" required autocomplete="current-password"></label>`}
      <div class="qerr hidden" id="lerr" role="alert"></div>
      <button class="btn primary">${reset ? "Email me a reset link" : "Sign in"}</button>
    </form>
    <p class="small" style="margin-top:18px;display:flex;gap:16px;flex-wrap:wrap">
      <a href="#login" id="swap">${reset ? "Back to sign in" : "Forgot your password?"}</a><a href="#careers">Careers page</a></p>${authClose}`;
  $("#swap", v).onclick = (e) => { e.preventDefault(); viewLogin(v, reset ? "signin" : "reset"); };
  $("#lf", v).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, email = f.elements.email.value.trim(), err = $("#lerr", v), b = $("button", f);
    const fail = (m) => { err.textContent = m; err.classList.remove("hidden"); b.disabled = false; b.textContent = reset ? "Email me a reset link" : "Sign in"; };
    err.classList.add("hidden");
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail("Enter your login email.");
    b.disabled = true; b.textContent = reset ? "Sending…" : "Signing in…";
    if (reset) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/?recovery=1" });
      if (error && /rate|limit/i.test(error.message)) return fail("Too many emails were sent recently. Wait a few minutes and try again.");
      f.outerHTML = `<div class="note">If ${esc(email)} has an HCVA login, a reset link is on its way. Open it in this browser.</div>`;
      return;
    }
    if (!f.elements.password.value) return fail("Enter your password.");
    const { error } = await sb.auth.signInWithPassword({ email, password: f.elements.password.value });
    if (error) return fail(/invalid/i.test(error.message) ? "That email and password don’t match an HCVA login." : error.message);
    // onAuthStateChange loads the account and routes.
  };
}
function viewSetPassword(v) {
  v.innerHTML = `${authOpen()}
    <h1>Set a new password</h1>
    <p class="muted" style="margin:0 0 20px">This changes your HCVA login, so use it for DeviceCare too.</p>
    <form class="stack" id="pf" novalidate>
      <label class="f">New password<span class="hint">At least 8 characters</span><input class="in" type="password" name="p1" autocomplete="new-password" required></label>
      <label class="f">Confirm new password<input class="in" type="password" name="p2" autocomplete="new-password" required></label>
      <div class="qerr hidden" id="perr" role="alert"></div><button class="btn primary">Save new password</button></form>${authClose}`;
  $("#pf", v).onsubmit = async (e) => {
    e.preventDefault(); const f = e.target, err = $("#perr", v), b = $("button", f);
    const fail = (m) => { err.textContent = m; err.classList.remove("hidden"); b.disabled = false; b.textContent = "Save new password"; };
    if (f.elements.p1.value.length < 8) return fail("Use at least 8 characters.");
    if (f.elements.p1.value !== f.elements.p2.value) return fail("The two passwords don’t match.");
    b.disabled = true; b.textContent = "Saving…";
    const { error } = await sb.auth.updateUser({ password: f.elements.p1.value });
    if (error) return fail(error.message);
    S.recovery = false; toast("Password updated"); mounted = null; location.hash = S.isRecruiter ? "dashboard" : "careers"; route();
  };
}
function viewNoAccess(v) {
  v.innerHTML = `${authOpen()}
    <h1>This area is for recruiters</h1>
    <p class="muted">You’re signed in as ${esc(S.session?.user?.email)}, which doesn’t have recruiter access to the ATS. DeviceCare access is separate. Ask an ATS admin to add you in Settings, Team.</p>
    <div class="row"><a class="btn" href="#careers">Go to careers page</a><button class="btn ghost" id="so">Sign out</button></div>${authClose}`;
  $("#so", v).onclick = signOut;
}

/* ---------- careers ---------- */
function visibleJobs() { return S.roles.filter((r) => r.status === "public" || (r.status === "internal" && S.isMember)).sort((a, b) => ts(b.posted_at) - ts(a.posted_at)); }
const JOB_TYPES = ["Full-time", "Part-time", "Project-based"];
function viewCareers(v) {
  if (v.dataset.v !== "careers") {
    v.dataset.v = "careers";
    v.innerHTML = `
    <header class="lp-bar"><div class="lp-wrap">
      <a class="lp-brand" href="#careers"><img src="${LOGO}" alt=""><span><b>${APP_NAME}</b><small>HighCall Virtual Assistants</small></span></a>
      <nav class="lp-nav"><button type="button" class="lp-navlink" id="toroles">Open roles</button><span id="authbtn"></span></nav>
    </div></header>
    <section class="lp-hero"><div class="lp-wrap">
      <img class="lp-mark" src="${LOGO}" alt="HighCall VA">
      <div class="lp-line" aria-hidden="true"></div>
      <h1>Build your remote career with HighCall VA</h1>
      <p id="lpintro"></p>
      <form class="lp-search" id="lpsearch" role="search">
        <input id="jobq" type="search" placeholder="Search roles, e.g. executive assistant" aria-label="Search roles" value="${esc(S.ui.jobQ || "")}">
        <select id="jobtype" aria-label="Job type"><option value="">Any type</option>${JOB_TYPES.map((t) => `<option ${S.ui.jobType === t ? "selected" : ""}>${t}</option>`).join("")}</select>
        <button class="btn primary" type="submit">Search</button>
      </form>
    </div></section>
    <section class="lp-section" id="openroles"><div class="lp-wrap">
      <div id="lperr"></div>
      <p class="eyebrow">Open positions</p><h2 class="lp-h2" id="jobcount"></h2>
      <div class="lp-grid" id="jobgrid"></div>
    </div></section>
    <section class="lp-section lp-last"><div class="lp-wrap">
      <div class="lp-cta"><img src="${LOGO}" alt=""><div><h3>Don’t see the right role?</h3><p>Join the talent pool and we’ll reach out when a role fits.</p></div>
        <button class="btn primary" data-apply="">Join the talent pool ${ICON.arrow}</button></div>
    </div></section>
    <footer class="lp-foot"><div class="lp-wrap">© ${new Date().getFullYear()} HighCall Virtual Assistants</div></footer>`;
    const scrollToRoles = () => $("#openroles", v).scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    $("#toroles", v).onclick = scrollToRoles;
    $("#jobq", v).oninput = (e) => { S.ui.jobQ = e.target.value; drawJobs(v); };
    $("#jobtype", v).onchange = (e) => { S.ui.jobType = e.target.value; drawJobs(v); };
    $("#lpsearch", v).onsubmit = (e) => { e.preventDefault(); drawJobs(v); scrollToRoles(); };
    $("[data-apply]", v).onclick = () => openApply(null);
  }
  $("#lpintro", v).textContent = S.settings.careers_intro || "Work from home with clients in the US and around the world.";
  $("#lperr", v).innerHTML = S.loadError ? `<div class="note warn" style="margin-bottom:20px">${esc(S.loadError)}</div>` : "";
  $("#authbtn", v).innerHTML = S.session ? `<button class="btn" id="so">Sign out</button>` : `<a href="#login" class="btn">Team sign in</a>`;
  const so = $("#so", v); if (so) so.onclick = signOut;
  drawJobs(v);
}
function drawJobs(v) {
  const all = visibleJobs(), qq = (S.ui.jobQ || "").trim().toLowerCase(), type = S.ui.jobType || "";
  const list = all.filter((j) => (!type || j.employment_type === type) &&
    (!qq || [j.title, j.department, j.description, j.requirements, j.schedule, j.location].join(" ").toLowerCase().includes(qq)));
  const filtered = qq || type;
  $("#jobcount", v).textContent = !all.length ? "No open roles right now" : filtered ? `${list.length} of ${all.length} role${all.length === 1 ? "" : "s"} match` : `${all.length} role${all.length === 1 ? "" : "s"} hiring now`;
  const grid = $("#jobgrid", v), applied = myApplied();
  if (!all.length) { grid.innerHTML = `<div class="lp-empty">New roles open often. Join the talent pool below and we’ll contact you when one fits.</div>`; return; }
  if (!list.length) {
    grid.innerHTML = `<div class="lp-empty">No roles match your search. <button type="button" class="link" id="clearjobs">Show all roles</button></div>`;
    $("#clearjobs", v).onclick = () => { S.ui.jobQ = ""; S.ui.jobType = ""; $("#jobq", v).value = ""; $("#jobtype", v).value = ""; drawJobs(v); };
    return;
  }
  grid.innerHTML = list.map((j) => `<article class="lp-job">
      <div class="lp-tags">${j.employment_type ? `<span class="tag">${esc(j.employment_type)}</span>` : ""}${j.status === "internal" ? `<span class="tag internal">Internal</span>` : ""}${applied[j.id] ? `<span class="tag done">Applied</span>` : ""}</div>
      <h3>${esc(j.title)}</h3>
      <p>${[j.department, j.schedule || j.location].filter(Boolean).map(esc).join(" · ") || "Remote"}</p>
      <button type="button" class="btn" data-job="${esc(j.id)}">View role ${ICON.arrow}</button>
    </article>`).join("");
  $$("[data-job]", grid).forEach((b) => (b.onclick = () => openJob(b.dataset.job)));
}
function openJob(id) {
  const j = visibleJobs().find((x) => x.id === id); if (!j) return;
  const specs = [];
  if (j.min_download) specs.push(`Internet of at least ${esc(j.min_download)} Mbps download`);
  if (j.min_ram) specs.push(`A computer with ${esc(j.min_ram)} GB RAM or more`);
  if (j.need_backup) specs.push("Backup device, backup internet and backup power");
  const applied = myApplied()[j.id];
  const m = openLayer(`<div class="modal lp-detail">
    <div class="dhead"><div><div class="lp-tags">${j.employment_type ? `<span class="tag">${esc(j.employment_type)}</span>` : ""}${j.status === "internal" ? `<span class="tag internal">Internal</span>` : ""}</div>
      <h2>${esc(j.title)}</h2><div class="muted small" style="margin-top:4px">${[j.department, j.location, j.schedule].filter(Boolean).map(esc).join(" · ")}</div></div>
      <button type="button" class="btn ghost x" data-close aria-label="Close">${ICON.x}</button></div>
    ${j.compensation ? `<div><h4>Compensation</h4><p>${esc(j.compensation)}</p></div>` : ""}
    ${j.description ? `<div><h4>About the role</h4><p style="white-space:pre-line">${esc(j.description)}</p></div>` : ""}
    ${lines(j.requirements).length ? `<div><h4>What you’ll need</h4><ul>${lines(j.requirements).map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>` : ""}
    ${specs.length ? `<div><h4>Work-from-home setup</h4><ul>${specs.map((x) => `<li>${x}</li>`).join("")}</ul></div>` : ""}
    <div class="row mfoot" style="justify-content:flex-end"><button type="button" class="btn" data-close>Close</button><button type="button" class="btn primary" id="applyjob">${applied ? "Apply again" : "Apply for this role"} ${ICON.arrow}</button></div>
  </div>`);
  $$("[data-close]", m).forEach((b) => (b.onclick = closeLayer));
  $("#applyjob", m).onclick = () => openApply(j.id);
}
/* ---------- candidate form ---------- */
function candFields(c = {}, { recruiter = false } = {}) {
  return `
  <div class="grid2">
    <label class="f">Full name<input class="in" name="name" required value="${esc(c.name)}" autocomplete="name"></label>
    <label class="f">Email<input class="in" name="email" type="email" ${recruiter ? "" : "required"} value="${esc(c.email)}" autocomplete="email"></label>
    <label class="f">Mobile number<input class="in" name="phone" value="${esc(c.phone)}" autocomplete="tel"></label>
    <label class="f">City and country<input class="in" name="location" value="${esc(c.location)}" placeholder="Davao City, Philippines"></label>
  </div>
  <label class="f">Headline<span class="hint">The kind of VA work you do best</span><input class="in" name="headline" value="${esc(c.headline)}" placeholder="Executive assistant for real estate teams"></label>
  <div class="grid3">
    <label class="f">Years of VA experience<input class="in" name="years" type="number" min="0" max="60" step="0.5" value="${esc(c.years)}"></label>
    <label class="f">Availability<select class="in" name="availability">${["", "Full-time", "Part-time", "Project-based"].map((o) => `<option value="${o}" ${c.availability === o ? "selected" : ""}>${o || "Choose one"}</option>`).join("")}</select></label>
    <label class="f">Expected rate<input class="in" name="rate" value="${esc(c.rate)}" placeholder="$6/hour"></label>
  </div>
  <label class="f">Skills<span class="hint">Separate with commas</span><input class="in" name="skills" value="${esc((c.skills || []).join(", "))}" placeholder="Cold calling, GoHighLevel, Calendar management"></label>
  <label class="f">LinkedIn or portfolio link<input class="in" name="link" type="url" value="${esc(c.link)}" placeholder="https://"></label>
  ${recruiter ? "" : `<label class="f">Why HighCall VA?<span class="hint">Optional, a few sentences</span><textarea class="in" name="note">${esc(c.note)}</textarea></label>`}
  <div style="display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600">CV (PDF)
    <label class="drop" id="drop"><input type="file" name="cv" accept="application/pdf,.pdf" class="hidden"><span>Choose a PDF, up to 20 MB</span></label></div>
  <input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">`;
}
function bindDrop(root) {
  const d = $("#drop", root); if (!d) return; const inp = $("input", d);
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) { toast("Choose a PDF file."); inp.value = ""; return; }
    if (f.size > 20 * 1024 * 1024) { toast("That file is over 20 MB."); inp.value = ""; return; }
    d.classList.add("has"); $("span", d).textContent = f.name;
  };
}
function readForm(form) {
  const g = (n) => form.elements[n]?.value?.trim() || "";
  return {
    name: g("name"), email: g("email") || null, phone: g("phone") || null, location: g("location") || null, headline: g("headline") || null,
    years: num(g("years")), availability: g("availability") || null, rate: g("rate") || null,
    skills: g("skills").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 40),
    link: safeUrl(g("link")) || null, note: form.elements.note ? g("note") || null : null,
  };
}
async function uploadCv(file, folder) {
  const path = `${folder}/${uid()}.pdf`;
  await q(sb.storage.from("ats-cvs").upload(path, file, { contentType: "application/pdf", upsert: false }));
  let text = "";
  try { const { extractPdfText } = await import("./pdf.js"); text = await withTimeout(extractPdfText(file), 20000); } catch (e) { console.warn("CV text not extracted", e); }
  return { cv_path: path, cv_name: file.name.slice(0, 200), cv_text: text };
}

/* ---------- modal plumbing ---------- */
let layerDirty = false;
function openLayer(html, { center = true } = {}) {
  const L = $("#layer"); L.innerHTML = `<div class="scrim ${center ? "center" : ""}">${html}</div>`;
  const sc = $(".scrim", L), panel = sc.firstElementChild;
  layerDirty = false;
  // Typing marks the form as changed, so an accidental outside click or Escape can't wipe it.
  const mark = (e) => { if (!e.target.closest("[data-nodirty]")) layerDirty = true; };
  panel.addEventListener("input", mark); panel.addEventListener("change", mark);
  // Close only when the press AND release both land on the dark backdrop (never the form or a scrollbar).
  let downOnBackdrop = false;
  sc.addEventListener("mousedown", (e) => { downOnBackdrop = e.target === sc && e.clientX < sc.clientWidth; });
  sc.addEventListener("click", (e) => { if (downOnBackdrop && e.target === sc) requestClose(); downOnBackdrop = false; });
  document.addEventListener("keydown", escClose); document.body.style.overflow = "hidden";
  setTimeout(() => $("input:not([name=website]),select,textarea,button:not(.danger)", panel)?.focus({ preventScroll: true }), 30); // never land on a Delete button
  return panel;
}
function requestClose() {
  if (layerDirty && !window.confirm("Discard what you’ve entered?")) return;
  closeLayer();
}
function escClose(e) { if (e.key === "Escape") requestClose(); }
function closeLayer() { layerDirty = false; $("#layer").innerHTML = ""; document.removeEventListener("keydown", escClose); document.body.style.overflow = ""; }

/* ---------- apply ---------- */
function openApply(roleId) {
  const job = roleId ? visibleJobs().find((j) => j.id === roleId) : null;
  const m = openLayer(`<form class="modal" novalidate>
    <div class="dhead"><div><h2>${job ? esc(job.title) : "Join the talent pool"}</h2><div class="muted small" style="margin-top:4px">${job ? "Your application goes straight to our recruiters." : "We’ll keep your profile on file and contact you when a role fits."}</div></div><button type="button" class="btn ghost x" data-close aria-label="Close">${ICON.x}</button></div>
    ${candFields()}
    <div class="qerr hidden" id="ferr" role="alert"></div>
    <div class="row mfoot" style="justify-content:flex-end"><button type="button" class="btn" data-close>Cancel</button><button class="btn go" type="submit">${job ? "Submit application" : "Join the talent pool"}</button></div>
  </form>`);
  bindDrop(m); $$("[data-close]", m).forEach((b) => (b.onclick = closeLayer));
  m.onsubmit = async (e) => {
    e.preventDefault(); const err = $("#ferr", m); err.classList.add("hidden");
    const vals = readForm(m), file = m.elements.cv.files[0];
    const problems = [];
    if (!vals.name) problems.push("your name");
    if (!vals.email || !/^\S+@\S+\.\S+$/.test(vals.email)) problems.push("a valid email");
    if (!file) problems.push("your CV");
    if (problems.length) { err.textContent = "Add " + (problems.length > 1 ? problems.slice(0, -1).join(", ") + " and " + problems.at(-1) : problems[0]) + " to continue."; err.classList.remove("hidden"); return; }
    const btn = $("button[type=submit]", m); btn.disabled = true; btn.textContent = "Sending…";
    try {
      if (!m.elements.website.value) {
        const cv = await uploadCv(file, "applications");
        await q(sb.rpc("ats_submit_application", { p_role: roleId || null, p_data: { ...vals, ...cv } }));
      }
      rememberApplied(roleId);
      layerDirty = false;
      m.innerHTML = `<div class="done"><img src="${LOGO}" alt="" style="width:110px;margin-bottom:14px"><h2>${job ? "Application sent" : "You’re in the talent pool"}</h2>
        <p class="muted">${job ? `We received your application for ${esc(job.title)}. Our recruiters will email you about next steps.` : "Our recruiters will reach out when a role matches your profile."}</p>
        <button class="btn primary" type="button" data-close>Done</button></div>`;
      $$("[data-close]", m).forEach((b) => (b.onclick = () => { closeLayer(); refresh(); }));
    } catch (ex) {
      console.error(ex); btn.disabled = false; btn.textContent = "Try again";
      const msg = ex?.message || "";
      err.textContent = /exceeded|too large|413/i.test(msg) ? "That CV is over 20 MB. Upload a smaller PDF."
        : /mime|type/i.test(msg) ? "Upload your CV as a PDF."
        : /not open/i.test(msg) ? "This role just closed. Join the talent pool instead."
        : "Your application didn’t send. Check your connection and try again.";
      err.classList.remove("hidden");
    }
  };
}


/* ---------- dashboard ---------- */
const PERIODS = [["this_month", "This month"], ["last_month", "Last month"], ["last_30", "Last 30 days"], ["this_year", "This year"], ["all", "All time"]];
const periodLabel = (k) => (PERIODS.find((p) => p[0] === k) || PERIODS[0])[1].toLowerCase();
function viewDashboard(v) {
  if (!S.ui.period) S.ui.period = "this_month";
  if (v.dataset.v !== "dash") {
    v.dataset.v = "dash";
    v.innerHTML = `${pageHead("Your recruiting workspace", "The right people. Ready to work.", "Hiring activity for HighCall VA, all in one place.",
      `<select class="in" id="period" style="width:auto;padding:12px 14px" aria-label="Time period">${PERIODS.map(([k, l]) => `<option value="${k}" ${S.ui.period === k ? "selected" : ""}>${l}</option>`).join("")}</select>
       <button class="btn primary" id="dnew">${ICON.plus}New role</button>`)}
      <div id="dbanner"></div><div id="dash"><div class="ldr" style="max-width:240px;margin:20px 0"></div></div>`;
    $("#period", v).onchange = (e) => { S.ui.period = e.target.value; loadDash(v, true); };
    $("#dnew", v).onclick = () => openRoleEditor();
  }
  drawBanner($("#dbanner", v));
  loadDash(v, false);
}
function drawBanner(el) {
  const open = S.roles.filter((r) => r.status === "public" || r.status === "internal");
  const waiting = open.map((r) => ({ r, n: roleEntries(r.id).filter((e) => e.stage === "Applied").length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
  const total = waiting.reduce((t, x) => t + x.n, 0);
  let title, text, btn;
  if (!open.length) { title = "Your first hire starts here"; text = "Create a role, add screening questions and minimum specs, then publish it to the careers page."; btn = `<button class="btn" data-b="new">Create a role ${ICON.arrow}</button>`; }
  else if (total) { title = `${total} new application${total === 1 ? "" : "s"} waiting for review`; text = `Most are for ${esc(waiting[0].r.title)}. Shortlist the strongest candidates to keep things moving.`; btn = `<button class="btn" data-b="role-${esc(waiting[0].r.id)}">Review applications ${ICON.arrow}</button>`; }
  else { title = "You’re all caught up"; text = "No new applications are waiting. Search the talent pool for people to bring into your open roles."; btn = `<button class="btn" data-b="pool">Search talent pool ${ICON.arrow}</button>`; }
  el.innerHTML = `<div class="banner"><div class="ico">${ICON.check}</div><div><b>${title}</b><span>${text}</span></div>${btn}</div>`;
  const b = $("[data-b]", el); if (b) b.onclick = () => (b.dataset.b === "new" ? openRoleEditor() : go(b.dataset.b));
}
let dashReq = 0;
async function loadDash(v, showLoader) {
  const box = $("#dash", v); if (!box) return;
  if (showLoader || !S.dash) box.innerHTML = `<div class="ldr" style="max-width:240px;margin:20px 0"></div>`;
  const my = ++dashReq;
  try {
    const d = await q(sb.rpc("ats_dashboard", { p_period: S.ui.period }));
    if (my !== dashReq || !$("#dash", v)) return;
    S.dash = d; drawDash(box, d);
  } catch (e) {
    console.error(e);
    if (my === dashReq) box.innerHTML = `<div class="note warn">Couldn’t load dashboard numbers. ${/ats_dashboard|function/i.test(e?.message || "") ? "Run the dashboard database update (20261112130000_ats_dashboard.sql) first." : "Check your connection and refresh."}</div>`;
  }
}
function statCard(label, value, cap, icon, tone = "", goTo = "") {
  const tag = goTo ? "button" : "div";
  return `<${tag} class="statcard" ${goTo ? `data-go="${goTo}"` : ""}><div class="lab"><span>${label}</span>${icon}</div><div class="num">${value}</div><div class="cap ${tone}">${cap}</div></${tag}>`;
}
function drawDash(box, d) {
  const per = periodLabel(d.period), n = (k) => Number(d[k] || 0);
  const f = d.funnel || {}, entered = n("entered");
  const funnel = [["Entered pipeline", entered], ["Shortlisted", +f.Shortlisted || 0], ["Screening", +f.Screening || 0], ["Interview", +f.Interview || 0], ["Offer", +f.Offer || 0], ["Hired", n("hired")]];
  const fmax = Math.max(1, ...funnel.map((x) => x[1]));
  const trend = d.trend || [], tmax = Math.max(1, ...trend.map((t) => Math.max(t.applied, t.hired)));
  const mon = (ym) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-US", { month: "short" });
  const thisMonth = trend.length ? trend[trend.length - 1] : { hired: 0 };
  const rate = entered ? Math.round((n("hired") / entered) * 100) : 0;
  const recruiters = d.recruiters || [], roles = d.roles || [];
  const o = d.outcomes || {};
  const decided = n("hired") + (+o.offer_declined || 0);
  const accRate = decided ? Math.round((n("hired") / decided) * 100) + "%" : "–";
  const losses = [
    ["Rejected before screening", +o.rejected_before_screening || 0, "Rejected from Sourced, Applied or Shortlisted"],
    ["Failed screening", +o.failed_screening || 0, "Rejected from Screening"],
    ["Failed interview", +o.failed_interview || 0, "Rejected from Interview"],
    ["Rejected after offer", +o.rejected_after_offer || 0, "Offer withdrawn by HighCall VA"],
    ["Withdrew before offer", +o.withdrew_before_offer || 0, "Candidate pulled out before an offer"],
    ["Declined offer", +o.offer_declined || 0, "Candidate turned down the offer"],
  ];
  const lmax = Math.max(1, ...losses.map((x) => x[1]));
  box.innerHTML = `
  <div class="stats">
    ${statCard("Applied", n("applied"), `Applications to roles ${per}`, ICON.inbox)}
    ${statCard("Shortlisted", n("shortlisted"), `Moved past review ${per}`, ICON.star)}
    ${statCard("Hired", n("hired"), n("hired") ? `Hires ${per}` : `No hires ${per} yet`, ICON.check, n("hired") ? "" : "muted")}
    ${statCard("Added by recruiters", n("recruiter_added"), `Sourced into the talent pool ${per}`, ICON.userplus)}
  </div>
  <div class="dashgrid">
    <div class="panel">
      <div class="cardhead"><div><h2>Hiring funnel</h2><p>How far candidates got ${per}. Each person counts once at the furthest stage they reached.</p></div><a class="link" href="#roles">View roles ${ICON.arrow}</a></div>
      <div class="funnel">${funnel.map(([l, v]) => `<div class="frow"><span>${l}</span><div class="bar"><i style="width:${(v / fmax) * 100}%"></i></div><b>${v}</b></div>`).join("")}</div>
      <div class="ministats">
        <div><b>${n("pool_joined")}</b><span>New candidates who applied themselves</span></div>
        <div><b>${n("copied_to_roles")}</b><span>Copied from pool into roles</span></div>
        <div><b>${n("rejected") + n("withdrawn")}</b><span>Left the pipeline</span></div>
        <div><b>${rate}%</b><span>Hire rate from pipeline</span></div>
      </div>
    </div>
    <div class="mintcard">
      <p class="eyebrow">Six-month hiring trend</p>
      <div class="legend"><span>Applied</span><span class="h">Hired</span></div>
      <div class="trend">${trend.map((t) => `<div class="col"><div class="bars"><i style="height:${(t.applied / tmax) * 100}%" title="${t.applied} applied"></i><i class="h" style="height:${(t.hired / tmax) * 100}%" title="${t.hired} hired"></i></div><span class="m">${mon(t.month)}</span></div>`).join("")}</div>
      <div class="tagcopy"><div><b>${thisMonth.hired} hired this month.<br>${n("open_roles")} open role${n("open_roles") === 1 ? "" : "s"}, ${n("pool_total")} in the pool.</b><p>Keep the pipeline moving from applied to hired.</p></div></div>
    </div>
  </div>
  <div class="dashgrid2">
    <div class="panel">
      <div class="cardhead"><div><h2>Offers</h2><p>Offers decided ${per}. An accepted offer counts as a hire.</p></div></div>
      <div class="offerstats">
        <div><b>${n("hired")}</b><span>Accepted (hired)</span></div>
        <div><b>${+o.offer_declined || 0}</b><span>Declined by candidate</span></div>
        <div><b>${accRate}</b><span>Offer acceptance rate</span></div>
      </div>
      <div class="offernote">${+o.rejected_after_offer ? `${o.rejected_after_offer} offer${o.rejected_after_offer == 1 ? " was" : "s were"} withdrawn by HighCall VA. ` : ""}Acceptance rate is accepted ÷ (accepted + declined).</div>
    </div>
    <div class="panel">
      <div class="cardhead"><div><h2>Where candidates dropped out</h2><p>Exits ${per}, by the stage they left from</p></div></div>
      <div class="funnel losses">${losses.map(([l, v, hint]) => `<div class="frow"><span title="${hint}">${l}</span><div class="bar">${v ? `<i style="width:${(v / lmax) * 100}%"></i>` : ""}</div><b>${v}</b></div>`).join("")}</div>
      <div class="offernote" style="border-top:1px solid var(--line)">Rejected means HighCall VA decided not to continue. Withdrawn means the candidate pulled out.</div>
    </div>
  </div>
  <div class="panel" style="margin-bottom:30px">
    <div class="cardhead"><div><h2>Recruiter activity</h2><p>What each recruiter did ${per}</p></div><a class="link" href="#config">Manage team ${ICON.arrow}</a></div>
    <div class="table-wrap">${recruiters.length ? `<table class="t"><thead><tr><th>Recruiter</th><th>Added to pool</th><th>Copied into roles</th><th>Shortlisted</th><th>Hired</th><th>Last active</th></tr></thead><tbody>
      ${recruiters.map((r) => `<tr><td class="who"><b>${esc(r.name)}</b><span>${r.role === "admin" ? "Admin" : "Recruiter"}</span></td><td class="num">${r.added}</td><td class="num">${r.copied}</td><td class="num">${r.shortlisted}</td><td class="num">${r.hired}</td><td class="muted">${r.last_active ? ago(r.last_active) : "No activity yet"}</td></tr>`).join("")}
    </tbody></table>` : `<div class="empty"><p>No recruiters yet. Add your team in Settings.</p></div>`}</div>
  </div>
  <div class="panel">
    <div class="cardhead"><div><h2>Open roles</h2><p>Applications ${per} and where each pipeline stands now</p></div><a class="link" href="#roles">All roles ${ICON.arrow}</a></div>
    <div class="table-wrap">${roles.length ? `<table class="t"><thead><tr><th>Role</th><th>Visibility</th><th>Applied</th><th>Waiting for review</th><th>In progress</th><th>Hired</th></tr></thead><tbody>
      ${roles.map((r) => `<tr data-go="role-${esc(r.id)}"><td class="who"><b>${esc(r.title)}</b></td><td><span class="badge ${r.status}"><span class="dot"></span>${STATUS_LABEL[r.status]}</span></td><td class="num">${r.applied}</td><td>${r.waiting ? `<span class="badge warn">${r.waiting} new</span>` : `<span class="muted">None</span>`}</td><td class="num">${r.active}</td><td class="num">${r.hired}</td></tr>`).join("")}
    </tbody></table>` : `<div class="empty">${ICON.roles}<h3>No open roles</h3><p>Publish a role to start receiving applications.</p><button class="btn primary" id="dnew2">${ICON.plus}New role</button></div>`}</div>
  </div>`;
  $$("[data-go]", box).forEach((el) => (el.onclick = () => go(el.dataset.go)));
  const n2 = $("#dnew2", box); if (n2) n2.onclick = () => openRoleEditor();
}

/* ---------- roles ---------- */
function viewRoles(v) {
  const tab = S.ui.roleTab;
  const groups = { active: S.roles.filter((r) => r.status === "public" || r.status === "internal"), draft: S.roles.filter((r) => r.status === "draft"), archived: S.roles.filter((r) => r.status === "archived") };
  const list = groups[tab];
  v.innerHTML = `
  ${pageHead("Your open positions", "Roles", "Publish roles publicly on the careers page or internally for the team.", `<button class="btn primary" id="newrole">${ICON.plus}New role</button>`)}
  <div class="tabs">${[["active", "Open"], ["draft", "Drafts"], ["archived", "Archived"]].map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? "on" : ""}">${l}<span class="n">${groups[k].length}</span></button>`).join("")}</div>
  ${list.length ? `<div class="panel list">${list.map((r) => {
    const es = roleEntries(r.id), active = es.filter((e) => !CLOSED.includes(e.stage)).length, fresh = es.filter((e) => e.stage === "Applied").length;
    return `<button class="item" data-role="${esc(r.id)}"><div><div class="t">${esc(r.title)}</div><div class="m">${[r.department, r.employment_type, r.location].filter(Boolean).map((s) => `<span>${esc(s)}</span>`).join("")}<span>${r.status === "archived" ? "Archived " + fmtDate(r.archived_at) : r.posted_at ? "Posted " + ago(r.posted_at) : "Not published"}</span></div></div>
      <div class="r"><span class="badge ${r.status}"><span class="dot"></span>${STATUS_LABEL[r.status]}</span><div style="text-align:right;min-width:92px"><div class="stat">${es.length}</div><div class="muted small">${fresh ? fresh + " new" : active + " active"}</div></div></div></button>`;
  }).join("")}</div>`
  : `<div class="panel empty">${tab === "active" ? `<h3>No open roles</h3><p>Create a role, add screening questions and minimum specs, then publish it.</p><button class="btn primary" id="newrole2">${ICON.plus}New role</button>` : tab === "draft" ? `<h3>No drafts</h3><p>Roles you save without publishing appear here.</p>` : `<h3>Nothing archived</h3><p>Archive a role once it’s filled. Its candidates stay in the talent pool.</p>`}</div>`}`;
  $$("[data-tab]", v).forEach((b) => (b.onclick = () => { S.ui.roleTab = b.dataset.tab; viewRoles(v); }));
  $$("[data-role]", v).forEach((b) => (b.onclick = () => go("role-" + b.dataset.role)));
  [$("#newrole", v), $("#newrole2", v)].forEach((b) => b && (b.onclick = () => openRoleEditor()));
}

function openRoleEditor(role) {
  const r = role || { status: "draft", employment_type: "Full-time", location: "Remote", min_download: 25, min_ram: 8, need_backup: true };
  let qs = (role ? questionsFor(role.id) : []).map((x) => ({ ...x }));
  const m = openLayer(`<form class="modal" novalidate>
    <div class="dhead"><h2>${role ? "Edit role" : "New role"}</h2><button type="button" class="btn ghost x" data-close aria-label="Close">${ICON.x}</button></div>
    <label class="f">Role title<input class="in" name="title" required value="${esc(r.title)}" placeholder="Appointment setter"></label>
    <div class="grid3">
      <label class="f">Team<input class="in" name="department" value="${esc(r.department)}" placeholder="Sales support"></label>
      <label class="f">Employment type<select class="in" name="employment_type">${["Full-time", "Part-time", "Project-based"].map((o) => `<option ${r.employment_type === o ? "selected" : ""}>${o}</option>`).join("")}</select></label>
      <label class="f">Location<input class="in" name="location" value="${esc(r.location)}"></label>
    </div>
    <div class="grid2">
      <label class="f">Schedule<input class="in" name="schedule" value="${esc(r.schedule)}" placeholder="US Eastern hours, Mon to Fri"></label>
      <label class="f">Compensation<input class="in" name="compensation" value="${esc(r.compensation)}" placeholder="₱35,000 to ₱45,000 a month"></label>
    </div>
    <label class="f">About the role<textarea class="in" name="description" style="min-height:120px">${esc(r.description)}</textarea></label>
    <label class="f">Requirements<span class="hint">One per line</span><textarea class="in" name="requirements">${esc(r.requirements)}</textarea></label>
    <div class="sect"><h3>Minimum setup</h3>
      <div class="grid3">
        <label class="f">Download speed (Mbps)<input class="in" name="min_download" type="number" min="0" value="${esc(r.min_download)}"></label>
        <label class="f">RAM (GB)<input class="in" name="min_ram" type="number" min="0" value="${esc(r.min_ram)}"></label>
        <label class="chk" style="align-self:end;padding-bottom:10px"><input type="checkbox" name="need_backup" ${r.need_backup ? "checked" : ""}>Backups required</label>
      </div>
      <p class="muted small" style="margin:8px 0 0">Backups means a backup device, backup internet and backup power. Candidates who fall short are flagged during screening.</p></div>
    <div class="sect"><h3>Screening questions</h3><p class="muted small" style="margin:-4px 0 10px">Only recruiters see these.</p><div class="qlist" id="qlist"></div>
      <div class="row" style="margin-top:8px"><input class="in" id="newq" placeholder="Add a question recruiters ask on the call" style="flex:1"><button type="button" class="btn sm" id="addq">${ICON.plus}Add</button></div></div>
    <div class="sect"><h3>Visibility</h3>
      <select class="in" name="status">${[["draft", "Draft: only recruiters can see it"], ["public", "Public: listed on the careers page"], ["internal", "Internal: only signed-in HighCall VA team members"], ["archived", "Archived: closed and hidden"]].map(([k, l]) => `<option value="${k}" ${r.status === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div class="qerr hidden" id="ferr"></div>
    <div class="row mfoot" style="justify-content:flex-end">${role ? `<button type="button" class="btn danger" id="delrole" style="margin-right:auto">Delete role</button>` : ""}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">${role ? "Save role" : "Create role"}</button></div>
  </form>`);
  const drawQs = () => {
    $("#qlist", m).innerHTML = qs.length ? qs.map((x, i) => `<div class="qi"><input class="in" data-qi="${i}" value="${esc(x.text)}"><button type="button" class="btn ghost sm" data-qdel="${i}" aria-label="Remove question">${ICON.x}</button></div>`).join("") : `<div class="muted small">No questions yet.</div>`;
    $$("[data-qi]", m).forEach((inp) => (inp.oninput = () => { qs[+inp.dataset.qi].text = inp.value; }));
    $$("[data-qdel]", m).forEach((b) => (b.onclick = () => { qs.splice(+b.dataset.qdel, 1); drawQs(); }));
  };
  drawQs();
  const addQ = () => { const t = $("#newq", m).value.trim(); if (!t) return; qs.push({ id: uid(), text: t }); $("#newq", m).value = ""; drawQs(); $("#newq", m).focus(); };
  $("#addq", m).onclick = addQ; $("#newq", m).onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); addQ(); } };
  $$("[data-close]", m).forEach((b) => (b.onclick = closeLayer));
  const del = $("#delrole", m); let armed = false;
  if (del) del.onclick = async () => {
    if (!armed) { armed = true; del.textContent = "Delete role and its pipeline"; return; }
    try { await q(sb.from("ats_roles").delete().eq("id", role.id)); closeLayer(); toast("Role deleted"); go("roles"); await reload(); } catch (e) { writeErr(e); }
  };
  m.onsubmit = async (e) => {
    e.preventDefault();
    const g = (n) => m.elements[n].value.trim();
    if (!g("title")) { const er = $("#ferr", m); er.textContent = "Add a role title to continue."; er.classList.remove("hidden"); return; }
    const status = g("status"), published = status === "public" || status === "internal";
    const body = {
      title: g("title"), department: g("department") || null, employment_type: g("employment_type"), location: g("location") || null, schedule: g("schedule") || null,
      compensation: g("compensation") || null, description: m.elements.description.value.trim() || null, requirements: m.elements.requirements.value.trim() || null,
      min_download: num(g("min_download")), min_ram: num(g("min_ram")), need_backup: m.elements.need_backup.checked, status,
      posted_at: published ? role?.posted_at || nowIso() : role?.posted_at || null,
      archived_at: status === "archived" ? (role?.status === "archived" ? role.archived_at : nowIso()) : null,
    };
    const btn = $("button[type=submit]", m); btn.disabled = true;
    try {
      const saved = role ? (await q(sb.from("ats_roles").update(body).eq("id", role.id).select().single())) : (await q(sb.from("ats_roles").insert(body).select().single()));
      await saveQuestions(saved.id, qs.filter((x) => x.text.trim()).map((x) => ({ id: x.id, text: x.text.trim() })));
      closeLayer(); toast(role ? "Role saved" : "Role created");
      await reload(); if (!role) go("role-" + saved.id);
    } catch (ex) { btn.disabled = false; writeErr(ex); }
  };
}
async function setRoleStatus(role, status) {
  const body = { status };
  if ((status === "public" || status === "internal") && !role.posted_at) body.posted_at = nowIso();
  body.archived_at = status === "archived" ? nowIso() : null;
  try { await q(sb.from("ats_roles").update(body).eq("id", role.id)); toast(status === "archived" ? "Role archived" : status === "draft" ? "Moved to drafts" : "Published " + (status === "public" ? "publicly" : "internally")); await reload(); }
  catch (e) { writeErr(e); }
}
async function saveQuestions(roleId, questions) {
  const ex = S.templates.find((t) => (t.role_id || null) === (roleId || null));
  const row = ex ? await q(sb.from("ats_screening_templates").update({ questions }).eq("id", ex.id).select().single())
                 : await q(sb.from("ats_screening_templates").insert({ role_id: roleId || null, questions }).select().single());
  S.templates = [...S.templates.filter((t) => t.id !== row.id), row];
}

/* ---------- role detail ---------- */
function viewRole(v, id) {
  const role = roleById(id);
  if (!role) { v.innerHTML = `<div class="panel empty"><h3>This role isn’t available</h3><p>It may have been deleted.</p><a class="btn" href="#roles">Go to roles</a></div>`; delete v.dataset.v; return; }
  if (v.dataset.v !== "role-" + id) {
    v.dataset.v = "role-" + id;
    v.innerHTML = `<div id="rhead"></div><div class="pipeline" id="pstrip"></div>
      <div class="search"><input class="in" id="rq" type="search" placeholder="Search this role’s candidates" value="${esc(S.ui.roleQ)}" aria-label="Search candidates in this role"></div>
      <div id="rqerr"></div><div class="panel table-wrap" id="rlist" style="margin-top:14px"></div>`;
    $("#rq", v).oninput = (e) => { S.ui.roleQ = e.target.value; drawRoleList(v, id); };
  }
  const es = roleEntries(id);
  $("#rhead", v).innerHTML = `<div class="pagehead">
    <div><a href="#roles" class="backlink">${ICON.back}All roles</a>
      <p class="eyebrow">${esc(role.department || "Role pipeline")}</p>
      <div class="row" style="gap:14px"><h1>${esc(role.title)}</h1><span class="badge ${role.status}"><span class="dot"></span>${STATUS_LABEL[role.status]}</span></div>
      <div class="sub">${[role.employment_type, role.location, role.schedule].filter(Boolean).map(esc).join(", ")}</div></div>
    <div class="actions">
      <select class="in" id="vis" style="width:auto;padding:11px 12px" aria-label="Visibility">${[["draft", "Draft"], ["public", "Published publicly"], ["internal", "Published internally"], ["archived", "Archived"]].map(([k, l]) => `<option value="${k}" ${role.status === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <button class="btn" id="edit">Edit role</button>
      <button class="btn" id="addcand">${ICON.plus}Add candidate</button>
      <button class="btn primary" id="frompool">Copy from talent pool</button>
    </div></div>`;
  $("#vis", v).onchange = (e) => setRoleStatus(role, e.target.value);
  $("#edit", v).onclick = () => openRoleEditor(role);
  $("#addcand", v).onclick = () => openAddCand(role.id);
  $("#frompool", v).onclick = () => { S.ui.targetRole = role.id; go("pool"); };
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0])); es.forEach((e) => (counts[e.stage] = (counts[e.stage] || 0) + 1));
  $("#pstrip", v).innerHTML = [["all", "All", es.length], ...STAGES.map((s) => [s, s, counts[s]])].map(([k, l, n]) => `<button data-st="${k}" class="${S.ui.stage === k ? "on" : ""}"><div class="k">${l}</div><div class="v">${n}</div></button>`).join("");
  $$("#pstrip button", v).forEach((b) => (b.onclick = () => { S.ui.stage = b.dataset.st; viewRole(v, id); }));
  drawRoleList(v, id);
}
function drawRoleList(v, id) {
  const role = roleById(id); if (!role) return;
  let es = roleEntries(id);
  if (S.ui.stage !== "all") es = es.filter((e) => e.stage === S.ui.stage);
  const { err, list } = searchList(es, S.ui.roleQ, titlesFor);
  $("#rqerr", v).innerHTML = err ? `<div class="qerr">Search syntax: ${esc(err)}. Showing a simple keyword match instead.</div>` : "";
  list.sort((a, b) => ts(b.appliedAt) - ts(a.appliedAt));
  $("#rlist", v).innerHTML = list.length ? `<table class="t"><thead><tr><th>Candidate</th><th>Stage</th><th>Setup</th><th>Rating</th><th>Source</th><th>Added</th></tr></thead><tbody>
    ${list.map((e) => { const c = e.cand, rd = readiness(c, role), rt = e.pipe.rating || 0;
      return `<tr data-c="${esc(c.id)}"><td class="who"><b>${esc(c.name || "Unnamed")}</b><span>${esc(c.headline || c.email || "")}</span></td>
      <td><span class="badge ${e.stage === "Hired" ? "ok" : e.stage === "Rejected" ? "bad" : e.stage === "Withdrawn" ? "draft" : ""}">${e.stage}</span>${e.stage === "Hired" ? (c.va_person_id ? ` <span class="muted small">In DeviceCare</span>` : ` <span class="muted small">Not in DeviceCare yet</span>`) : ""}</td>
      <td><span class="badge ${rd.cls}">${esc(rd.label)}</span></td>
      <td>${rt ? `<span style="color:#E2B007">${"★".repeat(rt)}</span><span style="color:var(--line)">${"★".repeat(5 - rt)}</span>` : `<span class="muted">Not rated</span>`}</td>
      <td class="muted">${e.pipe.source === "applied" ? "Applied" : e.pipe.source === "sourced" ? "From pool" : "Added by recruiter"}</td><td class="muted">${ago(e.appliedAt)}</td></tr>`; }).join("")}</tbody></table>`
    : `<div class="empty">${roleEntries(id).length ? `<h3>No matches</h3><p>Try a different stage or search.</p>` : `<h3>No candidates yet</h3><p>${role.status === "public" ? "Applications from the careers page land here." : role.status === "internal" ? "Team members who apply internally land here." : "Publish the role so candidates can apply, or copy people in from the talent pool."}</p><button class="btn primary" data-fp>Copy from talent pool</button>`}</div>`;
  $$("tr[data-c]", v).forEach((tr) => (tr.onclick = () => openDrawer(tr.dataset.c, id)));
  const fp = $("[data-fp]", v); if (fp) fp.onclick = () => { S.ui.targetRole = id; go("pool"); };
}

/* ---------- talent pool ---------- */
function viewPool(v) {
  if (v.dataset.v !== "pool") {
    v.dataset.v = "pool"; const f = S.ui.f;
    v.innerHTML = `${pageHead("Every candidate, one place", "Talent pool", "Everyone who applied or joined the pool. Search, filter, and copy people into a role.", `<button class="btn primary" id="addc">${ICON.plus}Add candidate</button>`)}
      <div class="search"><input class="in" id="pq" type="search" value="${esc(S.ui.poolQ)}" placeholder='(“cold calling” OR appointment*) AND skill:gohighlevel NOT location:manila' aria-label="Boolean search"></div>
      <div class="help">Use <code>AND</code> <code>OR</code> <code>NOT</code>, brackets, <code>"exact phrase"</code>, <code>admin*</code> for word starts, and fields like <code>skill:</code> <code>location:</code> <code>name:</code> <code>role:</code> <code>cv:</code> <code>os:</code>. Searches CV text too.</div>
      <div id="pqerr"></div>
      <div class="panel" style="margin-top:16px">
        <div class="filters">
          <label class="f">Location<input class="in" data-f="loc" value="${esc(f.loc)}" placeholder="Any"></label>
          <label class="f">Availability<select class="in" data-f="avail">${["", "Full-time", "Part-time", "Project-based"].map((o) => `<option value="${o}" ${f.avail === o ? "selected" : ""}>${o || "Any"}</option>`).join("")}</select></label>
          <label class="f">Min. years<input class="in" type="number" min="0" data-f="years" value="${esc(f.years)}" style="width:100px"></label>
          <label class="f">Min. download Mbps<input class="in" type="number" min="0" data-f="down" value="${esc(f.down)}" style="width:120px"></label>
          <label class="f">Roles<select class="in" data-f="inrole" id="inrole"></select></label>
          <div class="row" style="gap:6px 14px;padding-bottom:8px">${[["cv", "Has CV"], ["bd", "Backup device"], ["bn", "Backup internet"], ["bp", "Backup power"]].map(([k, l]) => `<label class="chk"><input type="checkbox" data-f="${k}" ${f[k] ? "checked" : ""}>${l}</label>`).join("")}</div>
          <button class="btn ghost sm" id="clr" style="margin-bottom:6px">Clear filters</button>
        </div>
        <div class="table-wrap" id="plist"></div>
      </div><div id="bulk"></div>`;
    $("#pq", v).oninput = (e) => { S.ui.poolQ = e.target.value; drawPool(v); };
    $$("[data-f]", v).forEach((el) => { el.oninput = el.onchange = () => { S.ui.f[el.dataset.f] = el.type === "checkbox" ? el.checked : el.value; drawPool(v); }; });
    $("#clr", v).onclick = () => { S.ui.f = {}; S.ui.poolQ = ""; delete v.dataset.v; viewPool(v); };
    $("#addc", v).onclick = () => openAddCand(null);
  }
  const cur = S.ui.f.inrole || "";
  $("#inrole", v).innerHTML = [["", "Any"], ["none", "Not in any role"], ...S.roles.filter((r) => r.status !== "archived").map((r) => [r.id, "In: " + r.title])].map(([k, l]) => `<option value="${esc(k)}" ${cur === k ? "selected" : ""}>${esc(l)}</option>`).join("");
  drawPool(v);
}
function drawPool(v) {
  const f = S.ui.f;
  const items = S.cands.map((c) => ({ cand: c })).filter(({ cand: c }) => {
    const d = c.device || {}, rs = candRoles(c);
    if (f.loc && !String(c.location || "").toLowerCase().includes(f.loc.toLowerCase())) return false;
    if (f.avail && c.availability !== f.avail) return false;
    if (num(f.years) != null && (num(c.years) ?? 0) < num(f.years)) return false;
    if (num(f.down) != null && (num(d.down) ?? 0) < num(f.down)) return false;
    if (f.cv && !c.cv_path) return false;
    if (f.bd && d.backupDevice !== "yes") return false;
    if (f.bn && d.backupNet !== "yes") return false;
    if (f.bp && d.backupPower !== "yes") return false;
    if (f.inrole === "none" && rs.length) return false;
    if (f.inrole && f.inrole !== "none" && !rs.includes(f.inrole)) return false;
    return true;
  });
  const { err, list } = searchList(items, S.ui.poolQ, titlesFor);
  $("#pqerr", v).innerHTML = err ? `<div class="qerr">Search syntax: ${esc(err)}. Showing a simple keyword match instead.</div>` : "";
  for (const s of [...S.ui.sel]) if (!candById(s)) S.ui.sel.delete(s);
  const allOn = list.length && list.every((x) => S.ui.sel.has(x.cand.id));
  $("#plist", v).innerHTML = list.length ? `<table class="t"><thead><tr><th class="cb"><input type="checkbox" id="all" ${allOn ? "checked" : ""} aria-label="Select all shown"></th><th>Candidate</th><th>Location</th><th>Skills</th><th>Setup</th><th>Roles</th><th>Added</th></tr></thead><tbody>
    ${list.map(({ cand: c }) => { const d = c.device || {}, b = ["backupDevice", "backupNet", "backupPower"].filter((k) => d[k] === "yes").length, rs = candRoles(c);
      return `<tr data-c="${esc(c.id)}"><td class="cb"><input type="checkbox" data-sel="${esc(c.id)}" ${S.ui.sel.has(c.id) ? "checked" : ""} aria-label="Select ${esc(c.name)}"></td>
      <td class="who"><b>${esc(c.name || "Unnamed")}</b><span>${esc(c.headline || c.email || "")}</span></td>
      <td>${esc(c.location || "")}</td>
      <td>${(c.skills || []).slice(0, 3).map((s) => `<span class="chip">${esc(s)}</span>`).join("")}${(c.skills || []).length > 3 ? `<span class="muted small">+${c.skills.length - 3}</span>` : ""}</td>
      <td>${d.checkedAt ? `<span class="small">${d.down ? esc(d.down) + " Mbps" : "Speed not set"}</span><br><span class="muted small">${b} of 3 backups</span>` : `<span class="muted small">Not checked</span>`}</td>
      <td>${rs.length ? rs.slice(0, 2).map((r) => `<span class="chip">${esc(roleTitle(r))}</span>`).join("") + (rs.length > 2 ? `<span class="muted small">+${rs.length - 2}</span>` : "") : `<span class="muted small">Pool only</span>`}</td>
      <td class="muted">${ago(c.created_at)}</td></tr>`; }).join("")}</tbody></table>`
    : `<div class="empty">${S.cands.length ? `<h3>No candidates match</h3><p>Loosen a filter or simplify the search.</p>` : `<h3>The talent pool is empty</h3><p>Candidates who apply on the careers page, or join the pool without a role, appear here. You can also add someone yourself.</p>`}</div>`;
  $$("tr[data-c]", v).forEach((tr) => (tr.onclick = (e) => { if (e.target.closest("input")) return; openDrawer(tr.dataset.c, null); }));
  $$("[data-sel]", v).forEach((cb) => (cb.onchange = () => { cb.checked ? S.ui.sel.add(cb.dataset.sel) : S.ui.sel.delete(cb.dataset.sel); drawBulk(v); }));
  const all = $("#all", v); if (all) all.onchange = () => { list.forEach((x) => (all.checked ? S.ui.sel.add(x.cand.id) : S.ui.sel.delete(x.cand.id))); drawPool(v); };
  drawBulk(v);
}
async function copyToRole(candIds, roleId) {
  const existing = new Set(roleEntries(roleId).map((e) => e.cand.id));
  const rows = candIds.filter((id) => !existing.has(id)).map((id) => ({ candidate_id: id, role_id: roleId, stage: "Sourced", source: "sourced" }));
  if (rows.length) await q(sb.from("ats_pipeline").upsert(rows, { onConflict: "candidate_id,role_id", ignoreDuplicates: true }));
  return { added: rows.length, skipped: candIds.length - rows.length };
}
function drawBulk(v) {
  const n = S.ui.sel.size, b = $("#bulk", v);
  if (!n) { b.innerHTML = S.ui.targetRole && roleById(S.ui.targetRole) ? `<div class="note" style="margin-top:14px">Select candidates, then copy them into <b>${esc(roleTitle(S.ui.targetRole))}</b>.</div>` : ""; return; }
  const roles = S.roles.filter((r) => r.status !== "archived");
  b.innerHTML = `<div class="bulk"><b>${n} selected</b>
    <select id="tgt" aria-label="Role to copy into">${roles.length ? roles.map((r) => `<option value="${esc(r.id)}" ${S.ui.targetRole === r.id ? "selected" : ""}>${esc(r.title)} (${STATUS_LABEL[r.status]})</option>`).join("") : `<option value="">Create a role first</option>`}</select>
    <button class="btn go sm" id="copy" ${roles.length ? "" : "disabled"}>Copy to role</button>
    <button class="btn ghost sm" id="unsel" style="color:inherit">Clear</button>
    <button class="btn sm" id="bulkdel" style="margin-left:auto;background:transparent;color:#FFB4AA;border-color:#5A3A38">${ICON.trash}Delete</button></div>`;
  $("#unsel", b).onclick = () => { S.ui.sel.clear(); drawPool(v); };
  $("#bulkdel", b).onclick = () => confirmDelete([...S.ui.sel]);
  $("#copy", b).onclick = async () => {
    const roleId = $("#tgt", b).value; if (!roleId) return; $("#copy", b).disabled = true;
    try { const { added, skipped } = await copyToRole([...S.ui.sel], roleId); S.ui.sel.clear(); toast(`Copied ${added} to ${roleTitle(roleId)}${skipped ? `, ${skipped} already there` : ""}`); await reload(); }
    catch (e) { writeErr(e); $("#copy", b).disabled = false; }
  };
}

/* ---------- add candidate (recruiter) ---------- */
const findByEmail = (email) => { const e = String(email || "").trim().toLowerCase(); return e ? S.cands.find((c) => (c.email || "").toLowerCase() === e) : null; };
// Merge new details into an existing candidate: filled-in fields replace old ones, blanks keep what's there,
// and a new CV becomes current while the old one is kept as a previous version.
function mergePatch(ex, vals, cv) {
  const patch = {};
  for (const [k, v] of Object.entries(vals)) {
    if (k === "email") continue;
    if (Array.isArray(v) ? v.length : v !== null && v !== undefined && v !== "") patch[k] = v;
  }
  if (cv.cv_path) {
    Object.assign(patch, cv);
    if (ex.cv_path && ex.cv_path !== cv.cv_path) patch.cv_history = [{ path: ex.cv_path, name: ex.cv_name, replaced_at: nowIso() }, ...(ex.cv_history || [])].slice(0, 10);
  }
  return patch;
}
function openAddCand(roleId) {
  const roles = S.roles.filter((r) => r.status !== "archived");
  const m = openLayer(`<form class="modal" novalidate>
    <div class="dhead"><h2>Add a candidate</h2><button type="button" class="btn ghost x" data-close aria-label="Close">${ICON.x}</button></div>
    ${candFields({}, { recruiter: true })}
    <div id="dupe"></div>
    <label class="f">Add to role<select class="in" name="role"><option value="">Talent pool only</option>${roles.map((r) => `<option value="${esc(r.id)}" ${roleId === r.id ? "selected" : ""}>${esc(r.title)}</option>`).join("")}</select></label>
    <div class="qerr hidden" id="ferr"></div>
    <div class="row mfoot" style="justify-content:flex-end"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit" id="addbtn">Add candidate</button></div></form>`);
  bindDrop(m); $$("[data-close]", m).forEach((b) => (b.onclick = closeLayer));
  const checkDupe = () => {
    const ex = findByEmail(m.elements.email.value);
    $("#dupe", m).innerHTML = ex ? `<div class="note"><b>${esc(ex.name)}</b> is already in the talent pool with this email. Saving updates their record: filled-in fields replace the old ones, and a new CV becomes current while the old one is kept. <button type="button" class="link" id="viewdupe">View their profile</button></div>` : "";
    $("#addbtn", m).textContent = ex ? "Update candidate" : "Add candidate";
    const vd = $("#viewdupe", m); if (vd) vd.onclick = () => { closeLayer(); openDrawer(ex.id, null, "profile"); };
  };
  m.elements.email.addEventListener("input", checkDupe); m.elements.email.addEventListener("blur", checkDupe);
  m.onsubmit = async (e) => {
    e.preventDefault(); const vals = readForm(m), err = $("#ferr", m);
    if (!vals.name) { err.textContent = "Add the candidate’s name to continue."; err.classList.remove("hidden"); return; }
    if (vals.email) vals.email = vals.email.trim().toLowerCase();
    const btn = $("#addbtn", m), label = btn.textContent; btn.disabled = true; btn.textContent = "Saving…";
    try {
      const f = m.elements.cv.files[0]; const cv = f ? await uploadCv(f, "recruiter") : {};
      let ex = findByEmail(vals.email), cand;
      if (!ex) {
        const ins = await sb.from("ats_candidates").insert({ ...vals, ...cv, source: "recruiter" }).select().single();
        if (ins.error && ins.error.code === "23505" && vals.email) ex = (await q(sb.from("ats_candidates").select("*").eq("email", vals.email).maybeSingle())) || null; // added by someone else meanwhile
        else if (ins.error) throw ins.error;
        else cand = ins.data;
      }
      if (ex) cand = await q(sb.from("ats_candidates").update(mergePatch(ex, vals, cv)).eq("id", ex.id).select().single());
      const r = m.elements.role.value;
      if (r) await q(sb.from("ats_pipeline").upsert({ candidate_id: cand.id, role_id: r, stage: "Applied", source: "recruiter" }, { onConflict: "candidate_id,role_id", ignoreDuplicates: true }));
      layerDirty = false; closeLayer(); toast(ex ? `${cand.name} was already in the talent pool. Their record was updated.` : "Candidate added"); await reload();
    } catch (ex) { btn.disabled = false; btn.textContent = label; writeErr(ex); }
  };
}

/* ---------- delete candidates ---------- */
function confirmDelete(ids, after) {
  const list = ids.map(candById).filter(Boolean); if (!list.length) return;
  const one = list.length === 1, linked = list.filter((c) => c.va_person_id).length;
  const m = openLayer(`<div class="modal" role="alertdialog" aria-labelledby="dtitle">
    <div class="dhead"><div><h2 id="dtitle">Delete ${one ? esc(list[0].name) : `${list.length} candidates`}?</h2><div class="muted small" style="margin-top:4px">This can’t be undone.</div></div><button type="button" class="btn ghost x" data-close aria-label="Close">${ICON.x}</button></div>
    ${one ? "" : `<ul style="margin:0;padding-left:20px;color:var(--ink)">${list.slice(0, 6).map((c) => `<li>${esc(c.name)}${c.email ? ` <span class="muted small">${esc(c.email)}</span>` : ""}</li>`).join("")}${list.length > 6 ? `<li class="muted">and ${list.length - 6} more</li>` : ""}</ul>`}
    <p style="margin:0">This permanently removes ${one ? "their" : "these candidates’"} profile, CVs (including previous versions), screening answers, notes and place in every role.</p>
    <p class="muted small" style="margin:0">Dashboard totals for past months stay the same.${linked ? ` ${linked === 1 && one ? "Their" : `${linked} of these`} DeviceCare record${linked === 1 ? " is" : "s are"} not affected.` : ""}</p>
    <div class="qerr hidden" id="derr"></div>
    <div class="row mfoot" style="justify-content:flex-end"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn danger primary" id="dodelete">${ICON.trash}Delete permanently</button></div>
  </div>`);
  $$("[data-close]", m).forEach((b) => (b.onclick = closeLayer));
  $("#dodelete", m).onclick = async () => {
    const b = $("#dodelete", m); b.disabled = true; b.textContent = "Deleting…";
    try {
      const paths = list.flatMap((c) => [c.cv_path, ...(c.cv_history || []).map((h) => h.path)]).filter(Boolean);
      for (let i = 0; i < paths.length; i += 100) { const { error } = await sb.storage.from("ats-cvs").remove(paths.slice(i, i + 100)); if (error) console.warn("CV cleanup", error); }
      await q(sb.from("ats_candidates").delete().in("id", list.map((c) => c.id)));
      list.forEach((c) => S.ui.sel.delete(c.id));
      closeLayer(); toast(one ? `${list[0].name} was deleted` : `${list.length} candidates deleted`); await reload(); if (after) after();
    } catch (e) { b.disabled = false; b.innerHTML = `${ICON.trash}Delete permanently`; const er = $("#derr", m); er.textContent = e?.message ? "Couldn’t delete: " + e.message : "Couldn’t delete. Check your connection and try again."; er.classList.remove("hidden"); }
  };
}

/* ---------- DeviceCare handover ---------- */
const isHired = (c) => S.pipes.some((p) => p.candidate_id === c.id && p.stage === "Hired");
function dcSection(c) {
  if (c.va_person_id) return `<div class="sect"><h3>DeviceCare</h3><span class="badge ok"><span class="dot"></span>Added to DeviceCare</span><p class="muted small" style="margin:8px 0 0">IT can now register this person’s devices in DeviceCare.</p></div>`;
  if (!isHired(c)) return "";
  return `<div class="sect"><h3>DeviceCare</h3><p class="muted small" style="margin:0 0 10px">Hired. Add them to DeviceCare so IT can register their devices and schedule inspections. If DeviceCare already has someone with this email, they’re linked instead of duplicated.</p><button class="btn go sm" id="todc">Add to DeviceCare</button></div>`;
}

/* ---------- candidate drawer & screening ---------- */
async function savePipe(cid, roleId, patch) {
  const ex = pipeFor(cid, roleId);
  const row = ex ? await q(sb.from("ats_pipeline").update(patch).eq("id", ex.id).select().single())
                 : await q(sb.from("ats_pipeline").insert({ candidate_id: cid, role_id: roleId || null, stage: roleId ? "Applied" : null, source: "recruiter", ...patch }).select().single());
  S.pipes = [...S.pipes.filter((p) => p.id !== row.id), row];
  return row;
}
async function openCv(c) {
  const w = window.open("", "_blank");
  try { const { signedUrl } = await q(sb.storage.from("ats-cvs").createSignedUrl(c.cv_path, 300)); if (w) w.location = signedUrl; else location.href = signedUrl; }
  catch (e) { if (w) w.close(); writeErr(e); }
}
function openDrawer(cid, roleId, tab = "screen") {
  const c = candById(cid); if (!c) return;
  roleId = roleId || null;
  const role = roleId ? roleById(roleId) : null;
  const p = pipeFor(cid, roleId) || {};
  const stage = roleId ? p.stage || "Applied" : null;
  const dev = { ...(c.device || {}) };
  let qs = questionsFor(roleId).map((x) => ({ ...x })), rating = p.rating || 0;
  const others = candRoles(c).filter((r) => r !== roleId);
  const ctxOpts = [roleId, ...others, ...(roleId ? [null] : [])];
  const d = openLayer(`<div class="drawer" role="dialog" aria-label="${esc(c.name)}">
    <div class="dhead"><div class="avatar">${esc(initials(c.name))}</div><div style="min-width:0"><h2>${esc(c.name || "Unnamed")}</h2><div class="muted">${esc([c.headline, c.location].filter(Boolean).join(", "))}</div></div>
      <div class="x" style="display:flex;gap:4px"><button class="btn ghost sm danger" id="delhead" title="Delete candidate">${ICON.trash}Delete</button><button class="btn ghost" data-close aria-label="Close">${ICON.x}</button></div></div>
    <div class="panel" style="padding:12px 14px;display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center">
      <div><div class="muted small">Screening for</div><select class="in" id="ctx" data-nodirty style="padding:5px 8px;font-weight:700;width:auto">${ctxOpts.map((r) => `<option value="${esc(r || "")}" ${r === roleId ? "selected" : ""}>${esc(roleTitle(r))}</option>`).join("")}</select></div>
      ${stage ? `<div><div class="muted small">Stage</div><select class="in" id="stage" data-nodirty style="padding:5px 8px;width:auto">${STAGES.map((s) => `<option value="${s}" ${s === stage ? "selected" : ""}>${STAGE_LABEL[s] || s}</option>`).join("")}</select></div>` : ""}
      <div><div class="muted small">Rating</div><div class="stars" id="stars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-r="${n}" class="${n <= rating ? "on" : ""}" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`).join("")}</div></div>
    </div>
    <div class="tabs" style="margin-bottom:0">${[["screen", "Screening"], ["profile", "Profile"], ["cv", "CV"]].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div id="tscreen" class="${tab === "screen" ? "" : "hidden"}">
      <div class="sect"><h3>Screening questions</h3><div class="stack" id="qs"></div>
        <div class="row" style="margin-top:10px"><input class="in" id="newq" placeholder="Add a question to ${roleId ? "this role" : "talent pool screening"}" style="flex:1"><button class="btn sm" id="addq" type="button">${ICON.plus}Add</button></div></div>
      <div class="sect"><div class="row" style="justify-content:space-between;margin-bottom:10px"><h3 style="margin:0">Device and connectivity</h3><span id="ready"></span></div>
        <div class="grid3">
          <label class="f">Main device<select class="in" data-d="type">${["", "Laptop", "Desktop", "Other"].map((o) => `<option value="${o}" ${dev.type === o ? "selected" : ""}>${o || "Choose"}</option>`).join("")}</select></label>
          <label class="f">Operating system<input class="in" data-d="os" value="${esc(dev.os)}" placeholder="Windows 11"></label>
          <label class="f">Processor<input class="in" data-d="cpu" value="${esc(dev.cpu)}" placeholder="Intel Core i5 11th gen"></label>
          <label class="f">RAM (GB)<input class="in" type="number" min="0" data-d="ram" value="${esc(dev.ram)}"></label>
          <label class="f">Headset<select class="in" data-d="headset">${["", "Noise-cancelling USB", "Standard headset", "None"].map((o) => `<option value="${o}" ${dev.headset === o ? "selected" : ""}>${o || "Choose"}</option>`).join("")}</select></label>
          <label class="f">Internet provider<input class="in" data-d="isp" value="${esc(dev.isp)}" placeholder="PLDT Fiber"></label>
          <label class="f">Download (Mbps)<input class="in" type="number" min="0" data-d="down" value="${esc(dev.down)}"></label>
          <label class="f">Upload (Mbps)<input class="in" type="number" min="0" data-d="up" value="${esc(dev.up)}"></label>
          <label class="f">Ping (ms)<input class="in" type="number" min="0" data-d="ping" value="${esc(dev.ping)}"></label>
        </div>
        <label class="f" style="margin-top:14px">Speed test result link<input class="in" data-d="speedUrl" value="${esc(dev.speedUrl)}" placeholder="https://www.speedtest.net/result/…"></label>
        <div class="stack" style="margin-top:16px">
          ${[["backupDevice", "Backup device", "Second laptop, desktop or tablet"], ["backupNet", "Backup internet", "Pocket Wi-Fi, mobile data, second ISP"], ["backupPower", "Backup power supply", "UPS, generator, power station"]].map(([k, l, ph]) => `<div class="specrow"><b class="small">${l}</b>
            <div class="yn" data-yn="${k}"><button type="button" data-v="yes" class="${dev[k] === "yes" ? "on" : ""}">Yes</button><button type="button" data-v="no" class="${dev[k] === "no" ? "on" : ""}">No</button></div>
            <input class="in" data-d="${k}Note" value="${esc(dev[k + "Note"])}" placeholder="${ph}"></div>`).join("")}
        </div></div>
      <div class="sect"><h3>Recruiter notes</h3><textarea class="in" id="notes" placeholder="Communication, accent, typing test, red flags">${esc(p.notes)}</textarea></div>
      <div class="row" style="position:sticky;bottom:0;background:var(--surface);padding:12px 0 0;border-top:1px solid var(--line)"><span class="muted small" id="savedat">${p.updated_at ? "Last saved " + ago(p.updated_at) : ""}</span><button class="btn primary" id="save" style="margin-left:auto">Save screening</button></div>
    </div>
    <div id="tprofile" class="${tab === "profile" ? "" : "hidden"}">
      <div class="sect"><dl class="kv">
        <dt>Email</dt><dd>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : "—"}</dd>
        <dt>Mobile</dt><dd>${esc(c.phone) || "—"}</dd>
        <dt>Location</dt><dd>${esc(c.location) || "—"}</dd>
        <dt>Experience</dt><dd>${c.years != null ? esc(c.years) + " years" : "—"}</dd>
        <dt>Availability</dt><dd>${esc(c.availability) || "—"}</dd>
        <dt>Expected rate</dt><dd>${esc(c.rate) || "—"}</dd>
        <dt>Link</dt><dd>${safeUrl(c.link) ? `<a href="${esc(safeUrl(c.link))}" target="_blank" rel="noopener noreferrer">${esc(c.link)}</a>` : "—"}</dd>
        <dt>Source</dt><dd>${c.source === "self" ? "Applied through the careers page" : "Added by a recruiter"}, ${fmtDate(c.created_at)}</dd>
        ${c.last_applied_at && ts(c.last_applied_at) - ts(c.created_at) > 60000 ? `<dt>Last applied</dt><dd>${fmtDate(c.last_applied_at)} <span class="badge">Updated their profile</span></dd>` : ""}
      </dl></div>
      ${(c.skills || []).length ? `<div class="sect"><h3>Skills</h3>${c.skills.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div>` : ""}
      ${c.note ? `<div class="sect"><h3>Why HighCall VA</h3><p style="margin:0;white-space:pre-line">${esc(c.note)}</p></div>` : ""}
      <div class="sect"><h3>Roles</h3>${candRoles(c).length ? `<div class="stack" style="gap:6px">${candRoles(c).map((r) => `<div class="row"><span style="flex:1">${esc(roleTitle(r))}</span><span class="badge">${esc(pipeFor(c.id, r)?.stage || "Applied")}</span></div>`).join("")}</div>` : `<p class="muted" style="margin:0">Talent pool only</p>`}
        <div class="row" style="margin-top:12px"><select class="in" id="cpy" data-nodirty style="flex:1;width:auto">${S.roles.filter((r) => r.status !== "archived" && !candRoles(c).includes(r.id)).map((r) => `<option value="${esc(r.id)}">${esc(r.title)}</option>`).join("") || `<option value="">No other roles</option>`}</select><button class="btn sm" id="cpybtn">Copy to role</button></div></div>
      ${dcSection(c)}
      <div class="sect"><button class="btn danger sm" id="del">${ICON.trash}Delete candidate</button></div>
    </div>
    <div id="tcv" class="${tab === "cv" ? "" : "hidden"}">
      ${c.cv_path ? `<div class="row" style="margin-bottom:12px"><button class="btn" id="opencv">Open ${esc(c.cv_name || "CV")}</button><span class="muted small">Opens a private link that expires in 5 minutes.</span></div>
        ${(c.cv_history || []).length ? `<div class="sect" style="margin:6px 0 16px"><h3>Previous CVs</h3><div class="stack" style="gap:8px">${c.cv_history.map((h, i) => `<div class="row" style="justify-content:space-between;border:1px solid var(--line);border-radius:var(--r);padding:10px 12px"><span><b style="color:var(--ink)">${esc(h.name || "CV")}</b> <span class="muted small">replaced ${fmtDate(h.replaced_at)}</span></span><button type="button" class="btn sm" data-oldcv="${i}">Open</button></div>`).join("")}</div></div>` : ""}
        ${c.cv_text ? `<details><summary class="small muted" style="cursor:pointer">Searchable text from this CV</summary><pre style="white-space:pre-wrap;font:inherit;font-size:13px;background:var(--sunk);padding:14px;border-radius:var(--r);margin-top:8px">${esc(c.cv_text)}</pre></details>` : ""}`
        : `<div class="empty"><h3>No CV on file</h3><p>Ask the candidate to apply again with a PDF.</p></div>`}
    </div>
  </div>`, { center: false });
  $$("[data-close]", d).forEach((b) => (b.onclick = closeLayer));
  $$("[data-t]", d).forEach((b) => (b.onclick = () => { $$("[data-t]", d).forEach((x) => x.classList.toggle("on", x === b)); ["screen", "profile", "cv"].forEach((k) => $("#t" + k, d).classList.toggle("hidden", k !== b.dataset.t)); }));
  $("#ctx", d).onchange = (e) => openDrawer(cid, e.target.value || null);
  const oc = $("#opencv", d); if (oc) oc.onclick = () => openCv(c);
  const answers = { ...(p.answers || {}) };
  const drawQ = () => {
    $("#qs", d).innerHTML = qs.length ? qs.map((x) => `<div class="q"><div class="qt"><span>${esc(x.text)}</span><button type="button" class="btn ghost sm" data-qdel="${esc(x.id)}" aria-label="Remove question">${ICON.x}</button></div><textarea class="in" data-a="${esc(x.id)}" style="min-height:64px" placeholder="Candidate’s answer">${esc(answers[x.id])}</textarea></div>`).join("") : `<p class="muted" style="margin:0">No questions yet. Add one below.</p>`;
    $$("[data-a]", d).forEach((t) => (t.oninput = () => { answers[t.dataset.a] = t.value; }));
    $$("[data-qdel]", d).forEach((b) => (b.onclick = async () => { qs = qs.filter((x) => x.id !== b.dataset.qdel); drawQ(); try { await saveQuestions(roleId, qs); } catch (e) { writeErr(e); } }));
  };
  drawQ();
  const addQ = async () => { const t = $("#newq", d).value.trim(); if (!t) return; qs.push({ id: uid(), text: t }); $("#newq", d).value = ""; drawQ(); try { await saveQuestions(roleId, qs); } catch (e) { writeErr(e); } };
  $("#addq", d).onclick = addQ; $("#newq", d).onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); addQ(); } };
  const drawReady = () => { const rd = readiness({ device: { ...dev, checkedAt: 1 } }, role); $("#ready", d).innerHTML = role ? `<span class="badge ${rd.cls}">${esc(rd.label)}</span>` : ""; };
  $$("[data-d]", d).forEach((el) => (el.oninput = el.onchange = () => { dev[el.dataset.d] = el.value; drawReady(); }));
  $$("[data-yn]", d).forEach((g) => $$("button", g).forEach((b) => (b.onclick = () => { const k = g.dataset.yn; dev[k] = dev[k] === b.dataset.v ? "" : b.dataset.v; $$("button", g).forEach((x) => x.classList.toggle("on", dev[k] === x.dataset.v)); drawReady(); })));
  drawReady();
  const st = $("#stage", d); if (st) st.onchange = async () => { try { await savePipe(cid, roleId, { stage: st.value }); toast("Moved to " + st.value); refresh(); } catch (e) { writeErr(e); } };
  $$("#stars button", d).forEach((b) => (b.onclick = async () => { const n = +b.dataset.r; rating = rating === n ? 0 : n; $$("#stars button", d).forEach((x) => x.classList.toggle("on", +x.dataset.r <= rating)); try { await savePipe(cid, roleId, { rating }); refresh(); } catch (e) { writeErr(e); } }));
  $("#save", d).onclick = async () => {
    const b = $("#save", d); b.disabled = true; b.textContent = "Saving…";
    try {
      const device = { ...dev, down: num(dev.down), up: num(dev.up), ping: num(dev.ping), ram: num(dev.ram), speedUrl: safeUrl(dev.speedUrl || "") || "", checkedAt: Date.now() };
      await savePipe(cid, roleId, { answers, notes: $("#notes", d).value });
      const row = await q(sb.from("ats_candidates").update({ device }).eq("id", cid).select().single());
      S.cands = S.cands.map((x) => (x.id === cid ? row : x));
      layerDirty = false; $("#savedat", d).textContent = "Saved just now"; toast("Screening saved"); refresh();
    } catch (e) { writeErr(e); }
    b.disabled = false; b.textContent = "Save screening";
  };
  $("#cpybtn", d).onclick = async () => { const r = $("#cpy", d).value; if (!r) return; try { await copyToRole([cid], r); toast("Copied to " + roleTitle(r)); await reload(); openDrawer(cid, roleId, "profile"); } catch (e) { writeErr(e); } };
  const todc = $("#todc", d);
  if (todc) todc.onclick = async () => {
    todc.disabled = true; todc.textContent = "Adding…";
    try { await q(sb.rpc("ats_send_to_devicecare", { p_candidate_id: cid })); toast("Added to DeviceCare"); await reload(); openDrawer(cid, roleId, "profile"); }
    catch (e) { todc.disabled = false; todc.textContent = "Add to DeviceCare"; writeErr(e); }
  };
  const askDelete = () => { if (layerDirty && !window.confirm("Discard your unsaved screening notes?")) return; confirmDelete([cid]); };
  $("#del", d).onclick = askDelete; $("#delhead", d).onclick = askDelete;
  $$("[data-oldcv]", d).forEach((b) => (b.onclick = () => openCv({ cv_path: c.cv_history[+b.dataset.oldcv].path })));
}

/* ---------- settings ---------- */
function viewSettings(v) {
  let qs = questionsFor(null).map((x) => ({ ...x }));
  v.innerHTML = `${pageHead("Admin", "Settings", "Careers page details, talent pool screening and your team.")}
  <div class="stack" style="max-width:760px">
    <form class="card stack" id="site"><h3 style="font-size:17px">Careers page</h3>
      <label class="f">Careers page intro<textarea class="in" name="intro">${esc(S.settings.careers_intro)}</textarea></label>
      <div><button class="btn primary">Save careers page</button></div></form>
    <div class="card stack"><h3 style="font-size:17px">Talent pool screening questions</h3><p class="muted small" style="margin:0">Asked when you screen someone who isn’t tied to a role yet.</p>
      <div class="qlist" id="pqs"></div>
      <div class="row"><input class="in" id="pnq" placeholder="Add a question" style="flex:1"><button class="btn sm" id="padd">${ICON.plus}Add</button></div>
      <div><button class="btn primary" id="psave">Save questions</button></div></div>
    <div class="card"><h3 style="font-size:17px;margin-bottom:12px">Team</h3>
      <div class="table-wrap"><table class="t"><thead><tr><th>Name</th><th>Email</th><th>Access</th><th></th></tr></thead><tbody>
      ${S.team.map((t) => `<tr style="cursor:default"><td>${esc(t.name || "—")}</td><td>${esc(t.email)}</td><td>${S.isAdmin && t.user_id !== S.session.user.id ? `<select class="in" data-acc="${esc(t.user_id)}" style="padding:5px 8px;width:auto">${["admin", "recruiter", "member"].map((r) => `<option value="${r}" ${t.role === r ? "selected" : ""}>${r[0].toUpperCase() + r.slice(1)}</option>`).join("")}</select>` : esc(t.role[0].toUpperCase() + t.role.slice(1))}</td>
        <td>${S.isAdmin && t.user_id !== S.session.user.id ? `<button class="btn ghost sm danger" data-rm="${esc(t.user_id)}">Remove</button>` : t.user_id === S.session.user.id ? `<span class="muted small">You</span>` : ""}</td></tr>`).join("")}
      </tbody></table></div>
      ${S.isAdmin ? `<form id="addstaff" class="stack" style="margin-top:16px;gap:10px" novalidate>
        <div class="grid3"><label class="f">Email<input class="in" name="email" type="email" required></label><label class="f">Name<input class="in" name="name"></label>
        <label class="f">Access<select class="in" name="role"><option value="recruiter">Recruiter</option><option value="member">Member</option><option value="admin">Admin</option></select></label></div>
        <div class="row"><button class="btn primary">Add to team</button><span class="muted small">They need an HCVA login first. DeviceCare logins work.</span></div></form>
        <p class="muted small" style="margin:14px 0 0">Admins manage the team. Recruiters manage roles, the talent pool and screening. Members see internal roles on the careers page and can apply.</p>` : `<p class="muted small" style="margin:12px 0 0">Ask an admin to add or change team members.</p>`}
    </div>
  </div>`;
  const draw = () => {
    $("#pqs", v).innerHTML = qs.map((x, i) => `<div class="qi"><input class="in" data-qi="${i}" value="${esc(x.text)}"><button class="btn ghost sm" data-qd="${i}" aria-label="Remove">${ICON.x}</button></div>`).join("") || `<div class="muted small">No questions.</div>`;
    $$("[data-qi]", v).forEach((i) => (i.oninput = () => (qs[+i.dataset.qi].text = i.value)));
    $$("[data-qd]", v).forEach((b) => (b.onclick = () => { qs.splice(+b.dataset.qd, 1); draw(); }));
  };
  draw();
  const add = () => { const t = $("#pnq", v).value.trim(); if (!t) return; qs.push({ id: uid(), text: t }); $("#pnq", v).value = ""; draw(); };
  $("#padd", v).onclick = add; $("#pnq", v).onkeydown = (e) => { if (e.key === "Enter") add(); };
  $("#psave", v).onclick = async () => { try { await saveQuestions(null, qs.filter((x) => x.text.trim())); toast("Questions saved"); } catch (e) { writeErr(e); } };
  $("#site", v).onsubmit = async (e) => {
    e.preventDefault();
    try { await q(sb.from("ats_settings").upsert({ key: "careers_intro", value: e.target.intro.value.trim(), is_public: true })); toast("Careers page saved"); await reload(); } catch (ex) { writeErr(ex); }
  };
  const as = $("#addstaff", v);
  if (as) as.onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    try { await q(sb.rpc("ats_add_staff", { p_email: f.email.value.trim(), p_role: f.role.value, p_name: f.name.value.trim() || null })); toast("Added to team"); await reload(); }
    catch (ex) { toast(ex?.message || "Couldn’t add that person."); }
  };
  $$("[data-acc]", v).forEach((s) => (s.onchange = async () => { try { await q(sb.from("ats_staff").update({ role: s.value }).eq("user_id", s.dataset.acc)); toast("Access updated"); await reload(); } catch (e) { writeErr(e); } }));
  $$("[data-rm]", v).forEach((b) => (b.onclick = async () => { try { await q(sb.from("ats_staff").delete().eq("user_id", b.dataset.rm)); toast("Removed from team"); await reload(); } catch (e) { writeErr(e); } }));
}

/* ---------- start ---------- */
async function start() {
  if (!configured) {
    $("#root").innerHTML = `<div style="max-width:560px;margin:10vh auto;padding:0 16px"><img src="${LOGO}" alt="" style="width:90px;margin-bottom:20px"><h1 style="font-size:26px;font-weight:800;margin-bottom:8px">Connect Supabase to finish setup</h1><p class="muted">Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> from the HCVA project to your <code>.env</code> file locally, or to Environment Variables in Vercel, then redeploy.</p></div>`;
    return;
  }
  let booted = false;
  sb.auth.onAuthStateChange((event, s) => {
    if (event === "PASSWORD_RECOVERY") { S.recovery = true; if (booted) setTimeout(() => { S.session = s; mounted = null; route(); }, 0); return; }
    if (!booted || (event !== "SIGNED_IN" && event !== "SIGNED_OUT")) return;
    if ((s?.user?.id || null) === (S.session?.user?.id || null)) return;
    setTimeout(async () => { S.ready = false; mounted = null; refresh(); await setSession(s); await loadAll(); mounted = null; route(); }, 0);
  });
  const { data: { session } } = await sb.auth.getSession();
  const params = new URLSearchParams(location.search);
  if (params.has("recovery")) { if (session) S.recovery = true; history.replaceState(null, "", location.pathname + location.hash); }
  await setSession(session); await loadAll();
  booted = true; route();
}
start();
