import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import {
  Plus, Trash2, Pencil, LogOut, Search, X, Check, Clock,
  LogIn, UserPlus, ShieldCheck, Users, ClipboardList,
} from "lucide-react";

const MODULES = ["SD","MM","FI","CO","PP","QM","PM","WM","EWM","HR/HCM","ABAP","BASIS","BW/BI","Fiori/UI5","PI/PO","TM","Ariba","SuccessFactors","Other"];

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

  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [signupNotice, setSignupNotice] = useState("");

  const [tab, setTab] = useState("log"); // 'log' | 'team'
  const [entries, setEntries] = useState([]);
  const [profiles, setProfiles] = useState([]);

  const [form, setForm] = useState(emptyForm);
  const [customModule, setCustomModule] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filterConsultant, setFilterConsultant] = useState("All");
  const [filterExpertise, setFilterExpertise] = useState("All");
  const [filterResult, setFilterResult] = useState("All");

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

    const channel = supabase
      .channel("entries-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, () => loadEntries())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => loadProfiles())
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
      date: entry.date, expertise: entry.expertise, module: entry.module,
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
    const payload = {
      date: form.date,
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
      const { error } = await supabase.from("entries").update(payload).eq("id", editingId);
      if (error) alert(error.message);
    } else {
      const { error } = await supabase.from("entries").insert({
        ...payload,
        consultant_id: session.user.id,
        consultant_name: profile.full_name,
        created_by: session.user.id,
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

  // ---- derived data ----
  const consultantNames = useMemo(() => {
    const set = new Set(entries.map(e => e.consultant_name).filter(Boolean));
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    return entries
      .filter(e => filterConsultant === "All" || e.consultant_name === filterConsultant)
      .filter(e => filterExpertise === "All" || e.expertise === filterExpertise)
      .filter(e => filterResult === "All" || (e.result || []).includes(filterResult))
      .filter(e => {
        if (!search.trim()) return true;
        const s = search.toLowerCase();
        return [e.consultant_name, e.module, e.task, e.comments].some(v => (v || "").toLowerCase().includes(s));
      });
  }, [entries, filterConsultant, filterExpertise, filterResult, search]);

  const totalHrs = useMemo(() => filtered.reduce((sum, e) => sum + (parseFloat(e.hrs) || 0), 0), [filtered]);

  const canEdit = (e) => isAdmin || e.created_by === session?.user?.id;

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

          <form onSubmit={handleAuthSubmit}>
            {authMode === "signup" && (
              <div className="field">
                <label className="label">Full name</label>
                <input className="input" value={authForm.name} onChange={e => setAuthForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Priya Nair" />
              </div>
            )}
            <div className="field">
              <label className="label">Work email</label>
              <input type="email" className="input" value={authForm.email} onChange={e => setAuthForm(f => ({ ...f, email: e.target.value }))} placeholder="you@company.com" />
            </div>
            <div className="field">
              <label className="label">Password</label>
              <input type="password" className="input" value={authForm.password} onChange={e => setAuthForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
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

      {isAdmin && (
        <div className="nav-tabs">
          <div className={`nav-tab ${tab === "log" ? "active" : ""}`} onClick={() => setTab("log")}>
            <ClipboardList size={13} style={{ verticalAlign: -2, marginRight: 5 }} /> Activity log
          </div>
          <div className={`nav-tab ${tab === "team" ? "active" : ""}`} onClick={() => setTab("team")}>
            <Users size={13} style={{ verticalAlign: -2, marginRight: 5 }} /> Team ({profiles.length})
          </div>
        </div>
      )}

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
              <select className="select" style={{ width: 140 }} value={filterExpertise} onChange={e => setFilterExpertise(e.target.value)}>
                <option>All</option><option>Technical</option><option>Functional</option>
              </select>
              <select className="select" style={{ width: 140 }} value={filterResult} onChange={e => setFilterResult(e.target.value)}>
                <option>All</option><option>Completed</option><option>Partial</option>
              </select>
              <button className="btn" onClick={openNewEntry}><Plus size={16} /> New entry</button>
            </div>

            <div className="table-wrap">
              {filtered.length === 0 ? (
                <div className="empty-state">No entries yet. Click "New entry" to log the first task.</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sno</th><th>Date</th><th>Consultant</th><th>Expertise</th><th>Module</th>
                      <th>BoD</th><th>EoD</th><th>Hrs</th><th>Task</th><th>Result</th><th>Comments</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e, i) => (
                      <tr key={e.id}>
                        <td className="sno-cell mono">{filtered.length - i}</td>
                        <td className="mono">{e.date}</td>
                        <td>{e.consultant_name}</td>
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
                        <td style={{ maxWidth: 200, color: "var(--dim)" }}>{e.comments}</td>
                        <td>
                          <div className="row-actions">
                            <button className="icon-btn" onClick={() => openEditEntry(e)} disabled={!canEdit(e)} title={canEdit(e) ? "Edit" : "Only the owner or an admin can edit"}><Pencil size={14} /></button>
                            <button className="icon-btn" onClick={() => deleteEntry(e.id)} disabled={!canEdit(e)} title={canEdit(e) ? "Delete" : "Only the owner or an admin can delete"}><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          <TeamPanel profiles={profiles} entries={entries} currentUserId={session.user.id} onSetRole={setRole} />
        )}
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
                <button type="submit" className="btn" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Add entry"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TeamPanel({ profiles, entries, currentUserId, onSetRole }) {
  const hrsByUser = useMemo(() => {
    const map = {};
    entries.forEach(e => { map[e.consultant_id] = (map[e.consultant_id] || 0) + (parseFloat(e.hrs) || 0); });
    return map;
  }, [entries]);

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Entries</th><th>Hrs logged</th><th>Joined</th><th></th></tr>
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
