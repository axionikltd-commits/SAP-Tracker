import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import {
  Plus, Trash2, Pencil, LogOut, Search, X, Check, Clock,
  LogIn, UserPlus, ShieldCheck, Users, ClipboardList, Send,
  CheckCircle2, XCircle, ClipboardCheck, BarChart3, Settings, DollarSign, Mail,
} from "lucide-react";
import ReportsPanel from "./ReportsPanel";
import SettingsPanel from "./SettingsPanel";

const MODULES = ["SD","MM","FI","CO","PP","QM","PM","WM","EWM","HR/HCM","ABAP","BASIS","BW/BI","Fiori/UI5","PI/PO","TM","Ariba","SuccessFactors","Other"];

const STATUS = {
  draft:     { label: "Draft",          badge: "badge-consultant" },
  submitted: { label: "Pending review", badge: "badge-partial" },
  approved:  { label: "Approved",       badge: "badge-ok" },
  rejected:  { label: "Rejected",       badge: "badge-admin" },
};

function calcHrs(bod, eod) {
  if (!bod || !eod) return "";
  const [bh, bm] = bod.split(":").map(Number);
  const [eh, em] = eod.split(":").map(Number);
  if ([bh, bm, eh, em].some(Number.isNaN)) return "";
  let diff = (eh * 60 + em) - (bh * 60 + bm);
  if (diff < 0) diff += 24 * 60;
  return (diff / 60).toFixed(2);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm = {
  date: todayStr(),
  project: "",
  expertise: "Technical",
  module: "SD",
  bod: "",
  eod: "",
  hrs: "",
  task: "",
  result: [],
  comments: "",
};

export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [autofillGuard] = useState(() => Math.random().toString(36).slice(2));

  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [signupNotice, setSignupNotice] = useState("");

  const [tab, setTab] = useState("log"); // 'log' | 'reports' | 'approvals' | 'team' | 'settings'
  const [entries, setEntries] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [projects, setProjects] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [assignments, setAssignments] = useState([]);

  const [form, setForm] = useState(emptyForm);
  const [customModule, setCustomModule] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filterConsultant, setFilterConsultant] = useState("All");
  const [filterProject, setFilterProject] = useState("All");
  const [filterExpertise, setFilterExpertise] = useState("All");
  const [filterResult, setFilterResult] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterBillable, setFilterBillable] = useState("All");

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [rejectTarget, setRejectTarget] = useState(null); // array of ids being rejected
  const [rejectComment, setRejectComment] = useState("");
  const [approvalSelected, setApprovalSelected] = useState(new Set());

  const isAdmin = profile?.role === "admin";

  // ---- auth bootstrap ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setBooting(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); return; }
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      setProfile(data || null);
    })();
  }, [session]);

  // ---- data loading + realtime ----
  useEffect(() => {
    if (!session) return;
    loadEntries();
    loadProfiles();
    loadProjects();
    loadHolidays();
    loadAssignments();

    const channel = supabase
      .channel("entries-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, () => loadEntries())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => loadProfiles())
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => loadProjects())
      .on("postgres_changes", { event: "*", schema: "public", table: "holidays" }, () => loadHolidays())
      .on("postgres_changes", { event: "*", schema: "public", table: "project_assignments" }, () => loadAssignments())
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function loadEntries() {
    const { data, error } = await supabase.from("entries").select("*").order("date", { ascending: false }).order("created_at", { ascending: false });
    if (!error) setEntries(data || []);
  }

  async function loadProfiles() {
    const { data, error } = await supabase.from("profiles").select("*").order("full_name");
    if (!error) setProfiles(data || []);
  }

  async function loadProjects() {
    const { data, error } = await supabase.from("projects").select("*").order("name");
    if (!error) setProjects(data || []);
  }

  async function loadHolidays() {
    const { data, error } = await supabase.from("holidays").select("*").order("date");
    if (!error) setHolidays(data || []);
  }

  async function loadAssignments() {
    const { data, error } = await supabase.from("project_assignments").select("*");
    if (!error) setAssignments(data || []);
  }

  // ---- admin: manage which consultants can log against which project ----
  async function assignConsultant(projectId, consultantId) {
    const { error } = await supabase.from("project_assignments").insert({ project_id: projectId, consultant_id: consultantId, created_by: session.user.id });
    if (error) alert(error.message);
    else loadAssignments();
  }

  async function unassignConsultant(projectId, consultantId) {
    const { error } = await supabase.from("project_assignments").delete().eq("project_id", projectId).eq("consultant_id", consultantId);
    if (error) alert(error.message);
    else loadAssignments();
  }

  // ---- admin: projects & holidays management ----
  async function createProject(fields) {
    const { error } = await supabase.from("projects").insert({ ...fields, created_by: session.user.id });
    if (error) alert(error.message);
    else loadProjects();
  }

  async function updateProject(id, fields) {
    const { error } = await supabase.from("projects").update(fields).eq("id", id);
    if (error) alert(error.message);
    else loadProjects();
  }

  async function deleteProject(id) {
    if (!confirm("Delete this project? Entries already logged against it will keep their project name but lose the link.")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) alert("Couldn't delete: " + error.message);
    else loadProjects();
  }

  async function addHoliday(fields) {
    const { error } = await supabase.from("holidays").insert({ ...fields, created_by: session.user.id });
    if (error) alert(error.message);
    else loadHolidays();
  }

  async function deleteHoliday(id) {
    const { error } = await supabase.from("holidays").delete().eq("id", id);
    if (error) alert(error.message);
    else loadHolidays();
  }

  // ---- auth actions ----
  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError("");
    setSignupNotice("");
    const email = authForm.email.trim();
    if (!email || !authForm.password) { setAuthError("Enter your email and password."); return; }
    setAuthBusy(true);
    if (authMode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password: authForm.password,
        options: { data: { full_name: authForm.name.trim() || email.split("@")[0] } },
      });
      setAuthBusy(false);
      if (error) { setAuthError(error.message); return; }
      setSignupNotice("Account created. If email confirmation is enabled for your project, check your inbox before logging in.");
      setAuthMode("login");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: authForm.password });
      setAuthBusy(false);
      if (error) { setAuthError(error.message); return; }
    }
    setAuthForm({ name: "", email: "", password: "" });
  }

  async function logout() {
    await supabase.auth.signOut();
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setTab("log");
    setSelectedIds(new Set());
    setApprovalSelected(new Set());
  }

  // ---- entry form ----
  function openNewEntry() {
    setForm(emptyForm);
    setCustomModule(false);
    setEditingId(null);
    setShowForm(true);
  }

  function openEditEntry(entry) {
    setForm({
      date: entry.date, project: entry.project_id || "", expertise: entry.expertise, module: entry.module,
      bod: entry.bod || "", eod: entry.eod || "", hrs: entry.hrs ?? "",
      task: entry.task, result: [...(entry.result || [])], comments: entry.comments || "",
    });
    setCustomModule(!MODULES.includes(entry.module));
    setEditingId(entry.id);
    setShowForm(true);
  }

  function toggleResult(val) {
    setForm(f => {
      const has = f.result.includes(val);
      return { ...f, result: has ? f.result.filter(r => r !== val) : [...f.result, val] };
    });
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const hrs = form.hrs === "" ? null : parseFloat(form.hrs);
    const project = projects.find(p => p.id === form.project);
    if (!project) {
      alert("Pick a project before saving.");
      setSaving(false);
      return;
    }
    const payload = {
      date: form.date,
      project_id: project.id,
      project_name: project.name,
      billable: project.billable !== false,
      expertise: form.expertise,
      module: form.module,
      bod: form.bod || null,
      eod: form.eod || null,
      hrs,
      task: form.task,
      result: form.result,
      comments: form.comments || null,
    };

    if (editingId) {
      // editing a rejected entry moves it back to draft so it goes through review again
      const current = entries.find(en => en.id === editingId);
      if (current?.status === "rejected") payload.status = "draft";
      const { error } = await supabase.from("entries").update(payload).eq("id", editingId);
      if (error) alert(error.message);
    } else {
      const { error } = await supabase.from("entries").insert({
        ...payload,
        consultant_id: session.user.id,
        consultant_name: profile.full_name,
        created_by: session.user.id,
        status: "draft",
      });
      if (error) alert(error.message);
    }
    setSaving(false);
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    loadEntries();
  }

  async function deleteEntry(id) {
    if (!confirm("Delete this entry?")) return;
    const { error } = await supabase.from("entries").delete().eq("id", id);
    if (error) alert(error.message);
    else loadEntries();
  }

  async function setRole(userId, role) {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
    if (error) alert(error.message);
    else loadProfiles();
  }

  // ---- submission workflow ----
  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function submitSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const { error } = await supabase.from("entries").update({ status: "submitted" }).in("id", ids);
    if (error) alert(error.message);
    setSelectedIds(new Set());
    loadEntries();
  }

  function toggleApprovalSelect(id) {
    setApprovalSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function approveIds(ids) {
    if (ids.length === 0) return;
    const { error } = await supabase.from("entries").update({ status: "approved" }).in("id", ids);
    if (error) alert(error.message);
    setApprovalSelected(new Set());
    loadEntries();
  }

  function openReject(ids) {
    setRejectTarget(ids);
    setRejectComment("");
  }

  async function confirmReject() {
    if (!rejectTarget || rejectTarget.length === 0) return;
    const { error } = await supabase.from("entries")
      .update({ status: "rejected", review_comment: rejectComment || null })
      .in("id", rejectTarget);
    if (error) alert(error.message);
    setRejectTarget(null);
    setRejectComment("");
    setApprovalSelected(new Set());
    loadEntries();
  }

  // ---- derived data ----
  const consultantNames = useMemo(() => {
    const set = new Set(entries.map(e => e.consultant_name).filter(Boolean));
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    return entries
      .filter(e => filterConsultant === "All" || e.consultant_name === filterConsultant)
      .filter(e => filterProject === "All" || e.project_name === filterProject)
      .filter(e => filterExpertise === "All" || e.expertise === filterExpertise)
      .filter(e => filterResult === "All" || (e.result || []).includes(filterResult))
      .filter(e => filterStatus === "All" || e.status === filterStatus)
      .filter(e => filterBillable === "All" || (filterBillable === "billable" ? e.billable !== false : e.billable === false))
      .filter(e => {
        if (!search.trim()) return true;
        const s = search.toLowerCase();
        return [e.consultant_name, e.project_name, e.module, e.task, e.comments].some(v => (v || "").toLowerCase().includes(s));
      });
  }, [entries, filterConsultant, filterProject, filterExpertise, filterResult, filterStatus, filterBillable, search]);

  const totalHrs = useMemo(() => filtered.reduce((sum, e) => sum + (parseFloat(e.hrs) || 0), 0), [filtered]);

  const canEdit = (e) => isAdmin || (e.created_by === session?.user?.id && ["draft", "rejected"].includes(e.status));
  const canSelect = (e) => e.created_by === session?.user?.id && ["draft", "rejected"].includes(e.status);

  const pendingEntries = useMemo(() => entries.filter(e => e.status === "submitted"), [entries]);

  // projects the CURRENT user can pick from in Add Entry: admins see everything,
  // consultants only see projects an admin has assigned them to
  const myProjects = useMemo(() => {
    if (isAdmin) return projects;
    const assignedIds = new Set(assignments.filter(a => a.consultant_id === session?.user?.id).map(a => a.project_id));
    return projects.filter(p => assignedIds.has(p.id));
  }, [projects, assignments, isAdmin, session]);

  // ---- render ----
  if (booting) {
    return <div className="loading-wrap">Loading…</div>;
  }

  if (!session || !profile) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <p className="auth-eyebrow mono">SAP · CONSULTANT LOG</p>
          <h1 className="auth-title display">{authMode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="auth-sub">{authMode === "login" ? "Sign in to log and review consultant activity." : "Sign up, then ask your admin to grant access."}</p>

          <div className="tabs">
            <div className={`tab ${authMode === "login" ? "active" : ""}`} onClick={() => { setAuthMode("login"); setAuthError(""); }}>
              <LogIn size={14} /> Log in
            </div>
            <div className={`tab ${authMode === "signup" ? "active" : ""}`} onClick={() => { setAuthMode("signup"); setAuthError(""); }}>
              <UserPlus size={14} /> Sign up
            </div>
          </div>

          <form onSubmit={handleAuthSubmit} autoComplete="off">
            {authMode === "signup" && (
              <div className="field">
                <label className="label">Full name</label>
                <input className="input" name={`fullname-${autofillGuard}`} autoComplete="off" value={authForm.name} onChange={e => setAuthForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Priya Nair" />
              </div>
            )}
            <div className="field">
              <label className="label">Work email</label>
              <input type="email" className="input" name={`email-${autofillGuard}`} autoComplete="off" value={authForm.email} onChange={e => setAuthForm(f => ({ ...f, email: e.target.value }))} placeholder="you@company.com" />
            </div>
            <div className="field">
              <label className="label">Password</label>
              <input type="password" className="input" name={`password-${autofillGuard}`} autoComplete="new-password" value={authForm.password} onChange={e => setAuthForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
            </div>
            {authError && <div className="error-text">{authError}</div>}
            {signupNotice && <div className="hint-text">{signupNotice}</div>}
            <button type="submit" className="btn" style={{ width: "100%", justifyContent: "center" }} disabled={authBusy}>
              {authBusy ? "Please wait…" : authMode === "login" ? "Log in" : "Create account"}
            </button>
          </form>
          {!booting && session && !profile && (
            <p className="hint-text">Signed in — setting up your profile…</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="app-header">
        <div>
          <h1 className="h-title display">SAP Consultant Log</h1>
          <p className="h-sub">Daily task &amp; effort tracking</p>
        </div>
        <div className="user-chip">
          <div className="avatar mono">{(profile.full_name || profile.email).slice(0, 1).toUpperCase()}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {profile.full_name}
              {isAdmin && <span className="role-pill">Admin</span>}
            </div>
            <div style={{ fontSize: 11, color: "var(--dim)" }}>{profile.email}</div>
          </div>
          <button className="icon-btn" onClick={logout} title="Log out"><LogOut size={16} /></button>
        </div>
      </div>

      <div className="nav-tabs">
        <div className={`nav-tab ${tab === "log" ? "active" : ""}`} onClick={() => setTab("log")}>
          <ClipboardList size={13} style={{ verticalAlign: -2, marginRight: 5 }} /> Activity log
        </div>
        <div className={`nav-tab ${tab === "reports" ? "active" : ""}`} onClick={() => setTab("reports")}>
          <BarChart3 size={13} style={{ verticalAlign: -2, marginRight: 5 }} /> Reports
        </div>
        {isAdmin && (
          <div className={`nav-tab ${tab === "approvals" ? "active" : ""}`} onClick={() => setTab("approvals")}>
            <ClipboardCheck size={13} style={{ verticalAlign: -2, marginRight: 5 }} /> Approvals
            {pendingEntries.length > 0 && <span className="role-pill" style={{ background: "rgba(226,185,58,.18)", color: "var(--partial)" }}>{pendingEntries.length}</span>}
          </div>
        )}
        {isAdmin && (
          <div className={`nav-tab ${tab === "team" ? "active" : ""}`} onClick={() => setTab("team")}>
            <Users size={13} style={{ verticalAlign: -2, marginRight: 5 }} /> Team ({profiles.length})
          </div>
        )}
        {isAdmin && (
          <div className={`nav-tab ${tab === "settings" ? "active" : ""}`} onClick={() => setTab("settings")}>
            <Settings size={13} style={{ verticalAlign: -2, marginRight: 5 }} /> Settings
          </div>
        )}
      </div>

      <div className="app-body">
        {tab === "log" ? (
          <>
            <div className="stats">
              <div className="stat"><div className="stat-val mono">{filtered.length}</div><div className="stat-label">Entries</div></div>
              <div className="stat"><div className="stat-val mono">{totalHrs.toFixed(2)}</div><div className="stat-label">Hours logged</div></div>
              <div className="stat"><div className="stat-val mono">{consultantNames.length}</div><div className="stat-label">Consultants</div></div>
            </div>

            <div className="toolbar">
              <div className="search-wrap">
                <Search size={15} />
                <input className="input" placeholder="Search task, module, comments…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select className="select" style={{ width: 170 }} value={filterConsultant} onChange={e => setFilterConsultant(e.target.value)}>
                <option>All</option>
                {consultantNames.map(n => <option key={n}>{n}</option>)}
              </select>
              <select className="select" style={{ width: 170 }} value={filterProject} onChange={e => setFilterProject(e.target.value)}>
                <option value="All">All projects</option>
                {projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
              <select className="select" style={{ width: 140 }} value={filterExpertise} onChange={e => setFilterExpertise(e.target.value)}>
                <option>All</option><option>Technical</option><option>Functional</option>
              </select>
              <select className="select" style={{ width: 140 }} value={filterResult} onChange={e => setFilterResult(e.target.value)}>
                <option>All</option><option>Completed</option><option>Partial</option>
              </select>
              <select className="select" style={{ width: 160 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="All">All statuses</option>
                <option value="draft">Draft</option>
                <option value="submitted">Pending review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              <select className="select" style={{ width: 150 }} value={filterBillable} onChange={e => setFilterBillable(e.target.value)}>
                <option value="All">Billable + non</option>
                <option value="billable">Billable only</option>
                <option value="nonbillable">Non-billable only</option>
              </select>
              <button className="btn" onClick={openNewEntry}><Plus size={16} /> New entry</button>
            </div>

            {selectedIds.size > 0 && (
              <div className="bulk-bar">
                <strong>{selectedIds.size}</strong> selected
                <button className="btn" style={{ padding: "7px 14px", fontSize: 13 }} onClick={submitSelected}>
                  <Send size={14} /> Submit for approval
                </button>
                <button className="btn btn-ghost" style={{ padding: "7px 14px", fontSize: 13 }} onClick={() => setSelectedIds(new Set())}>Clear</button>
              </div>
            )}

            <div className="table-wrap">
              {filtered.length === 0 ? (
                <div className="empty-state">No entries yet. Click "New entry" to log the first task.</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th></th><th>Sno</th><th>Date</th><th>Consultant</th><th>Project</th><th>Expertise</th><th>Module</th>
                      <th>BoD</th><th>EoD</th><th>Hrs</th><th>Task</th><th>Result</th><th>Billable</th><th>Status</th><th>Comments</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e, i) => (
                      <tr key={e.id}>
                        <td className="check-cell">
                          {canSelect(e) && (
                            <input type="checkbox" checked={selectedIds.has(e.id)} onChange={() => toggleSelect(e.id)} />
                          )}
                        </td>
                        <td className="sno-cell mono">{filtered.length - i}</td>
                        <td className="mono">{e.date}</td>
                        <td>{e.consultant_name}</td>
                        <td>{e.project_name || "—"}</td>
                        <td><span className={`badge ${e.expertise === "Technical" ? "badge-tech" : "badge-func"}`}>{e.expertise}</span></td>
                        <td>{e.module}</td>
                        <td className="mono">{e.bod || "—"}</td>
                        <td className="mono">{e.eod || "—"}</td>
                        <td className="mono">{e.hrs ?? "—"}</td>
                        <td style={{ maxWidth: 220 }}>{e.task}</td>
                        <td>
                          {(e.result || []).map(r => (
                            <span key={r} className={`badge ${r === "Completed" ? "badge-ok" : "badge-partial"}`} style={{ marginRight: 4 }}>{r}</span>
                          ))}
                        </td>
                        <td>
                          <span className={`badge ${e.billable === false ? "badge-consultant" : "badge-ok"}`}><DollarSign size={10} style={{ verticalAlign: -1 }} /> {e.billable === false ? "Non-billable" : "Billable"}</span>
                        </td>
                        <td>
                          <span className={`badge ${STATUS[e.status]?.badge || "badge-consultant"}`}>{STATUS[e.status]?.label || e.status}</span>
                          {e.status === "rejected" && e.review_comment && (
                            <div className="review-note">"{e.review_comment}"</div>
                          )}
                        </td>
                        <td style={{ maxWidth: 200, color: "var(--dim)" }}>{e.comments}</td>
                        <td>
                          <div className="row-actions">
                            <button className="icon-btn" onClick={() => openEditEntry(e)} disabled={!canEdit(e)} title={canEdit(e) ? "Edit" : "Locked — only drafts or rejected entries can be edited"}><Pencil size={14} /></button>
                            <button className="icon-btn" onClick={() => deleteEntry(e.id)} disabled={!canEdit(e)} title={canEdit(e) ? "Delete" : "Locked — only drafts or rejected entries can be deleted"}><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : tab === "reports" ? (
          <ReportsPanel
            entries={entries}
            profiles={profiles}
            projects={projects}
            holidays={holidays}
            isAdmin={isAdmin}
            currentUserId={session.user.id}
          />
        ) : tab === "approvals" ? (
          <ApprovalsPanel
            entries={entries}
            profiles={profiles}
            pendingEntries={pendingEntries}
            selected={approvalSelected}
            onToggle={toggleApprovalSelect}
            onSelectAll={(ids) => setApprovalSelected(new Set(ids))}
            onClear={() => setApprovalSelected(new Set())}
            onApprove={approveIds}
            onReject={openReject}
          />
        ) : tab === "team" ? (
          <TeamPanel profiles={profiles} entries={entries} currentUserId={session.user.id} onSetRole={setRole} />
        ) : tab === "settings" ? (
          <SettingsPanel
            projects={projects}
            holidays={holidays}
            entries={entries}
            profiles={profiles}
            assignments={assignments}
            onCreateProject={createProject}
            onUpdateProject={updateProject}
            onDeleteProject={deleteProject}
            onAddHoliday={addHoliday}
            onDeleteHoliday={deleteHoliday}
            onAssignConsultant={assignConsultant}
            onUnassignConsultant={unassignConsultant}
          />
        ) : null}
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="display" style={{ fontSize: 18, margin: 0 }}>{editingId ? "Edit entry" : "New entry"}</h2>
              <button className="icon-btn" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleFormSubmit}>
              <div className="grid2">
                <div className="field">
                  <label className="label">Date</label>
                  <input type="date" className="input" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
                </div>
                <div className="field">
                  <label className="label">Project</label>
                  <select
                    className="select"
                    required
                    value={form.project}
                    onChange={e => setForm(f => ({ ...f, project: e.target.value }))}
                  >
                    <option value="" disabled>Select a project…</option>
                    {myProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  {myProjects.length === 0 && (
                    <p className="hint-text" style={{ textAlign: "left", margin: "8px 0 0" }}>
                      No projects assigned to you yet — ask your admin to assign one from Settings → Projects.
                    </p>
                  )}
                  {form.project && (() => {
                    const p = projects.find(pr => pr.id === form.project);
                    if (!p) return null;
                    return (
                      <p className="hint-text" style={{ textAlign: "left", margin: "8px 0 0" }}>
                        <span className={`badge ${p.billable === false ? "badge-consultant" : "badge-ok"}`}>
                          <DollarSign size={10} style={{ verticalAlign: -1 }} /> {p.billable === false ? "Non-billable" : "Billable"}
                        </span>{" "}project — set once for the whole project in Settings.
                      </p>
                    );
                  })()}
                </div>
                <div className="field">
                  <label className="label">Expertise</label>
                  <select className="select" value={form.expertise} onChange={e => setForm(f => ({ ...f, expertise: e.target.value }))}>
                    <option>Technical</option><option>Functional</option>
                  </select>
                </div>
                <div className="field">
                  <label className="label">SAP module</label>
                  <select
                    className="select"
                    value={customModule ? "Other" : form.module}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === "Other") {
                        setCustomModule(true);
                        setForm(f => ({ ...f, module: "" }));
                      } else {
                        setCustomModule(false);
                        setForm(f => ({ ...f, module: val }));
                      }
                    }}
                  >
                    {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  {customModule && (
                    <input
                      className="input"
                      style={{ marginTop: 8 }}
                      placeholder="Enter module name"
                      value={form.module}
                      onChange={e => setForm(f => ({ ...f, module: e.target.value }))}
                      required
                      autoFocus
                    />
                  )}
                </div>
                <div className="field">
                  <label className="label"><Clock size={11} style={{ verticalAlign: -1 }} /> Hrs (auto, editable)</label>
                  <input className="input mono" value={form.hrs} onChange={e => setForm(f => ({ ...f, hrs: e.target.value }))} placeholder="e.g. 4.50" />
                </div>
                <div className="field">
                  <label className="label">BoD (start time)</label>
                  <input type="time" className="input" value={form.bod} onChange={e => setForm(f => ({ ...f, bod: e.target.value, hrs: calcHrs(e.target.value, f.eod) }))} />
                </div>
                <div className="field">
                  <label className="label">EoD (end time)</label>
                  <input type="time" className="input" value={form.eod} onChange={e => setForm(f => ({ ...f, eod: e.target.value, hrs: calcHrs(f.bod, e.target.value) }))} />
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label className="label">Result</label>
                  <div className="result-opts">
                    <div className={`chip ${form.result.includes("Completed") ? "on" : ""}`} onClick={() => toggleResult("Completed")}>
                      {form.result.includes("Completed") && <Check size={13} />} Completed
                    </div>
                    <div className={`chip ${form.result.includes("Partial") ? "on" : ""}`} onClick={() => toggleResult("Partial")}>
                      {form.result.includes("Partial") && <Check size={13} />} Partial
                    </div>
                  </div>
                </div>
              </div>
              <div className="field">
                <label className="label">Task</label>
                <textarea className="input" rows={2} value={form.task} onChange={e => setForm(f => ({ ...f, task: e.target.value }))} required />
              </div>
              <div className="field">
                <label className="label">Comments</label>
                <textarea className="input" rows={2} value={form.comments} onChange={e => setForm(f => ({ ...f, comments: e.target.value }))} />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Save as draft"}</button>
              </div>
              <p className="hint-text" style={{ textAlign: "left", marginTop: 10 }}>
                Saving keeps this as a draft. Select it in the table and use "Submit for approval" when you're ready to lock it in for review.
              </p>
            </form>
          </div>
        </div>
      )}

      {rejectTarget && (
        <div className="modal-backdrop" onClick={() => setRejectTarget(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="display" style={{ fontSize: 18, margin: 0 }}>Reject {rejectTarget.length > 1 ? `${rejectTarget.length} entries` : "entry"}</h2>
              <button className="icon-btn" onClick={() => setRejectTarget(null)}><X size={16} /></button>
            </div>
            <div className="field">
              <label className="label">Reason (visible to the consultant)</label>
              <textarea className="input" rows={3} value={rejectComment} onChange={e => setRejectComment(e.target.value)} placeholder="e.g. Please split hours across the two tasks worked on that day." autoFocus />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setRejectTarget(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmReject}><XCircle size={14} /> Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalsPanel({ entries, profiles, pendingEntries, selected, onToggle, onSelectAll, onClear, onApprove, onReject }) {
  const [sendingDigest, setSendingDigest] = useState(false);
  const approvedHrs = useMemo(() => entries.filter(e => e.status === "approved").reduce((s, e) => s + (parseFloat(e.hrs) || 0), 0), [entries]);
  const rejectedCount = useMemo(() => entries.filter(e => e.status === "rejected").length, [entries]);
  const approvedCount = useMemo(() => entries.filter(e => e.status === "approved").length, [entries]);

  async function sendDigestNow() {
    setSendingDigest(true);
    try {
      const { data, error } = await supabase.functions.invoke("weekly-digest");
      if (error) throw error;
      if (data?.skipped) alert("Nothing to send: " + data.reason);
      else alert(`Digest sent to ${data?.sent?.length ?? 0} admin(s).`);
    } catch (err) {
      alert("Couldn't send the digest — has the weekly-digest function been deployed? See README → Weekly digest emails.\n\n" + err.message);
    }
    setSendingDigest(false);
  }

  const matrix = useMemo(() => {
    const map = {};
    profiles.forEach(p => { map[p.id] = { name: p.full_name, draft: 0, submitted: 0, approved: 0, rejected: 0, approvedHrs: 0 }; });
    entries.forEach(e => {
      const row = map[e.consultant_id];
      if (!row) return;
      row[e.status] = (row[e.status] || 0) + 1;
      if (e.status === "approved") row.approvedHrs += parseFloat(e.hrs) || 0;
    });
    return Object.values(map).filter(r => r.draft + r.submitted + r.approved + r.rejected > 0);
  }, [entries, profiles]);

  const allPendingIds = pendingEntries.map(e => e.id);
  const allSelected = allPendingIds.length > 0 && allPendingIds.every(id => selected.has(id));

  return (
    <>
      <div className="stats">
        <div className="stat"><div className="stat-val mono">{pendingEntries.length}</div><div className="stat-label">Pending review</div></div>
        <div className="stat"><div className="stat-val mono">{approvedCount}</div><div className="stat-label">Approved</div></div>
        <div className="stat"><div className="stat-val mono">{rejectedCount}</div><div className="stat-label">Rejected</div></div>
        <div className="stat"><div className="stat-val mono">{approvedHrs.toFixed(2)}</div><div className="stat-label">Approved hours</div></div>
      </div>

      <div className="matrix-wrap">
        <p className="section-title">Approval matrix</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Consultant</th><th>Draft</th><th>Pending</th><th>Approved</th><th>Rejected</th><th>Approved hrs</th></tr>
            </thead>
            <tbody>
              {matrix.length === 0 ? (
                <tr><td colSpan={6} className="empty-state">No entries logged yet.</td></tr>
              ) : matrix.map(r => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="mono">{r.draft || 0}</td>
                  <td className="mono">{r.submitted || 0}</td>
                  <td className="mono">{r.approved || 0}</td>
                  <td className="mono">{r.rejected || 0}</td>
                  <td className="mono">{r.approvedHrs.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <p className="section-title" style={{ margin: 0 }}>Pending queue</p>
        <button className="btn btn-ghost" style={{ padding: "7px 14px", fontSize: 13 }} onClick={sendDigestNow} disabled={sendingDigest}>
          <Mail size={14} /> {sendingDigest ? "Sending…" : "Send digest now"}
        </button>
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <strong>{selected.size}</strong> selected
          <button className="btn" style={{ padding: "7px 14px", fontSize: 13 }} onClick={() => onApprove(Array.from(selected))}>
            <CheckCircle2 size={14} /> Approve selected
          </button>
          <button className="btn btn-danger" style={{ padding: "7px 14px", fontSize: 13 }} onClick={() => onReject(Array.from(selected))}>
            <XCircle size={14} /> Reject selected
          </button>
          <button className="btn btn-ghost" style={{ padding: "7px 14px", fontSize: 13 }} onClick={onClear}>Clear</button>
        </div>
      )}

      <div className="table-wrap">
        {pendingEntries.length === 0 ? (
          <div className="empty-state">Nothing waiting on review right now.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="check-cell">
                  <input type="checkbox" checked={allSelected} onChange={() => onSelectAll(allSelected ? [] : allPendingIds)} />
                </th>
                <th>Date</th><th>Consultant</th><th>Expertise</th><th>Module</th><th>Hrs</th><th>Task</th><th>Result</th><th>Submitted</th><th></th>
              </tr>
            </thead>
            <tbody>
              {pendingEntries.map(e => (
                <tr key={e.id}>
                  <td className="check-cell"><input type="checkbox" checked={selected.has(e.id)} onChange={() => onToggle(e.id)} /></td>
                  <td className="mono">{e.date}</td>
                  <td>{e.consultant_name}</td>
                  <td><span className={`badge ${e.expertise === "Technical" ? "badge-tech" : "badge-func"}`}>{e.expertise}</span></td>
                  <td>{e.module}</td>
                  <td className="mono">{e.hrs ?? "—"}</td>
                  <td style={{ maxWidth: 240 }}>{e.task}</td>
                  <td>{(e.result || []).map(r => <span key={r} className={`badge ${r === "Completed" ? "badge-ok" : "badge-partial"}`} style={{ marginRight: 4 }}>{r}</span>)}</td>
                  <td className="mono" style={{ color: "var(--dim)" }}>{e.submitted_at ? new Date(e.submitted_at).toLocaleDateString() : "—"}</td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" onClick={() => onApprove([e.id])} title="Approve"><CheckCircle2 size={14} /></button>
                      <button className="icon-btn" onClick={() => onReject([e.id])} title="Reject"><XCircle size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function TeamPanel({ profiles, entries, currentUserId, onSetRole }) {
  const hrsByUser = useMemo(() => {
    const map = {};
    entries.forEach(e => { if (e.status === "approved") map[e.consultant_id] = (map[e.consultant_id] || 0) + (parseFloat(e.hrs) || 0); });
    return map;
  }, [entries]);

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Entries</th><th>Approved hrs</th><th>Joined</th><th></th></tr>
        </thead>
        <tbody>
          {profiles.map(p => {
            const count = entries.filter(e => e.consultant_id === p.id).length;
            return (
              <tr key={p.id}>
                <td>{p.full_name}</td>
                <td style={{ color: "var(--dim)" }}>{p.email}</td>
                <td><span className={`badge ${p.role === "admin" ? "badge-admin" : "badge-consultant"}`}>{p.role}</span></td>
                <td className="mono">{count}</td>
                <td className="mono">{(hrsByUser[p.id] || 0).toFixed(2)}</td>
                <td className="mono">{new Date(p.created_at).toLocaleDateString()}</td>
                <td>
                  {p.id !== currentUserId && (
                    p.role === "admin" ? (
                      <button className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => onSetRole(p.id, "consultant")}>Revoke admin</button>
                    ) : (
                      <button className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => onSetRole(p.id, "admin")}>
                        <ShieldCheck size={13} /> Make admin
                      </button>
                    )
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
