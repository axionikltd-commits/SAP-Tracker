import { useState } from "react";
import { Pencil, Trash2, Check, X, Plus, CalendarDays, Briefcase, Users, DollarSign } from "lucide-react";

export default function SettingsPanel({
  projects, holidays, entries, profiles, assignments,
  onCreateProject, onUpdateProject, onDeleteProject,
  onAddHoliday, onDeleteHoliday,
  onAssignConsultant, onUnassignConsultant,
}) {
  return (
    <>
      <p className="section-title"><Briefcase size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Projects</p>
      <p className="hint-text" style={{ textAlign: "left", margin: "0 0 12px" }}>
        Billable/Non-billable is set here, once per project — every entry logged against a project
        inherits it automatically. Use "Assign" to control which consultants see this project in
        their Add Entry dropdown.
      </p>
      <ProjectsSection
        projects={projects}
        entries={entries}
        profiles={profiles}
        assignments={assignments}
        onCreate={onCreateProject}
        onUpdate={onUpdateProject}
        onDelete={onDeleteProject}
        onAssign={onAssignConsultant}
        onUnassign={onUnassignConsultant}
      />

      <p className="section-title" style={{ marginTop: 28 }}><CalendarDays size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Holiday calendar</p>
      <p className="hint-text" style={{ textAlign: "left", margin: "0 0 12px" }}>
        Dates listed here are excluded from "working days" in the Reports tab, on top of weekends.
      </p>
      <HolidaysSection holidays={holidays} onAdd={onAddHoliday} onDelete={onDeleteHoliday} />
    </>
  );
}

function ProjectsSection({ projects, entries, profiles, assignments, onCreate, onUpdate, onDelete, onAssign, onUnassign }) {
  const [newProject, setNewProject] = useState({ name: "", client_name: "", start_date: "", end_date: "", billable: true });
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [creating, setCreating] = useState(false);
  const [assigningId, setAssigningId] = useState(null);

  const consultants = profiles.filter(p => p.role === "consultant");
  const entryCount = (projectId) => entries.filter(e => e.project_id === projectId).length;
  const assignedTo = (projectId) => new Set(assignments.filter(a => a.project_id === projectId).map(a => a.consultant_id));

  function startEdit(p) {
    setEditingId(p.id);
    setEditValues({ client_name: p.client_name || "", start_date: p.start_date || "", end_date: p.end_date || "", billable: p.billable !== false });
  }

  async function saveEdit(id) {
    await onUpdate(id, editValues);
    setEditingId(null);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newProject.name.trim()) return;
    setCreating(true);
    await onCreate({
      name: newProject.name.trim(),
      client_name: newProject.client_name.trim() || null,
      start_date: newProject.start_date || null,
      end_date: newProject.end_date || null,
      billable: newProject.billable,
    });
    setCreating(false);
    setNewProject({ name: "", client_name: "", start_date: "", end_date: "", billable: true });
  }

  return (
    <>
      <form onSubmit={handleCreate} className="toolbar" style={{ marginBottom: 14 }}>
        <input className="input" style={{ width: 180 }} placeholder="New project name" value={newProject.name} onChange={e => setNewProject(f => ({ ...f, name: e.target.value }))} />
        <input className="input" style={{ width: 150 }} placeholder="Client (optional)" value={newProject.client_name} onChange={e => setNewProject(f => ({ ...f, client_name: e.target.value }))} />
        <input type="date" className="input" style={{ width: 150 }} value={newProject.start_date} onChange={e => setNewProject(f => ({ ...f, start_date: e.target.value }))} title="Start date" />
        <input type="date" className="input" style={{ width: 150 }} value={newProject.end_date} onChange={e => setNewProject(f => ({ ...f, end_date: e.target.value }))} title="End date" />
        <div
          className={`chip ${newProject.billable ? "on" : ""}`}
          onClick={() => setNewProject(f => ({ ...f, billable: !f.billable }))}
          title="Toggle billable / non-billable"
        >
          <DollarSign size={13} /> {newProject.billable ? "Billable" : "Non-billable"}
        </div>
        <button type="submit" className="btn" disabled={creating || !newProject.name.trim()}><Plus size={15} /> Add project</button>
      </form>

      <div className="table-wrap" style={{ marginBottom: 22 }}>
        {projects.length === 0 ? (
          <div className="empty-state">No projects yet — add one above.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Project</th><th>Client</th><th>Start date</th><th>End date</th><th>Billable</th><th>Entries</th><th>Assigned</th><th></th></tr>
            </thead>
            <tbody>
              {projects.map(p => {
                const editing = editingId === p.id;
                const assignedSet = assignedTo(p.id);
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>
                      {editing ? (
                        <input className="input" style={{ width: 140 }} value={editValues.client_name} onChange={e => setEditValues(v => ({ ...v, client_name: e.target.value }))} />
                      ) : (p.client_name || "—")}
                    </td>
                    <td>
                      {editing ? (
                        <input type="date" className="input" style={{ width: 145 }} value={editValues.start_date} onChange={e => setEditValues(v => ({ ...v, start_date: e.target.value }))} />
                      ) : <span className="mono">{p.start_date || "—"}</span>}
                    </td>
                    <td>
                      {editing ? (
                        <input type="date" className="input" style={{ width: 145 }} value={editValues.end_date} onChange={e => setEditValues(v => ({ ...v, end_date: e.target.value }))} />
                      ) : <span className="mono">{p.end_date || "—"}</span>}
                    </td>
                    <td>
                      {editing ? (
                        <div
                          className={`chip ${editValues.billable ? "on" : ""}`}
                          onClick={() => setEditValues(v => ({ ...v, billable: !v.billable }))}
                        >
                          <DollarSign size={12} /> {editValues.billable ? "Billable" : "Non-billable"}
                        </div>
                      ) : (
                        <span className={`badge ${p.billable === false ? "badge-consultant" : "badge-ok"}`}>{p.billable === false ? "Non-billable" : "Billable"}</span>
                      )}
                    </td>
                    <td className="mono">{entryCount(p.id)}</td>
                    <td className="mono">{assignedSet.size} / {consultants.length}</td>
                    <td>
                      <div className="row-actions">
                        {editing ? (
                          <>
                            <button className="icon-btn" onClick={() => saveEdit(p.id)} title="Save"><Check size={14} /></button>
                            <button className="icon-btn" onClick={() => setEditingId(null)} title="Cancel"><X size={14} /></button>
                          </>
                        ) : (
                          <>
                            <button className="icon-btn" onClick={() => startEdit(p)} title="Edit"><Pencil size={14} /></button>
                            <button className="icon-btn" onClick={() => setAssigningId(assigningId === p.id ? null : p.id)} title="Assign consultants"><Users size={14} /></button>
                            <button className="icon-btn" onClick={() => onDelete(p.id)} title="Delete"><Trash2 size={14} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {assigningId && (
        <AssignPanel
          project={projects.find(p => p.id === assigningId)}
          consultants={consultants}
          assignedSet={assignedTo(assigningId)}
          onToggle={(consultantId, isAssigned) =>
            isAssigned ? onUnassign(assigningId, consultantId) : onAssign(assigningId, consultantId)
          }
          onClose={() => setAssigningId(null)}
        />
      )}
    </>
  );
}

function AssignPanel({ project, consultants, assignedSet, onToggle, onClose }) {
  if (!project) return null;
  return (
    <div className="table-wrap" style={{ marginBottom: 22, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <strong style={{ fontSize: 13 }}>Assigned to "{project.name}"</strong>
        <button className="icon-btn" onClick={onClose}><X size={14} /></button>
      </div>
      {consultants.length === 0 ? (
        <p className="hint-text" style={{ textAlign: "left" }}>No consultant accounts yet — they'll show up here once they sign up.</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {consultants.map(c => {
            const on = assignedSet.has(c.id);
            return (
              <div key={c.id} className={`chip ${on ? "on" : ""}`} onClick={() => onToggle(c.id, on)}>
                {on && <Check size={13} />} {c.full_name}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HolidaysSection({ holidays, onAdd, onDelete }) {
  const [form, setForm] = useState({ date: "", name: "" });
  const [adding, setAdding] = useState(false);

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.date || !form.name.trim()) return;
    setAdding(true);
    await onAdd({ date: form.date, name: form.name.trim() });
    setAdding(false);
    setForm({ date: "", name: "" });
  }

  const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <form onSubmit={handleAdd} className="toolbar" style={{ marginBottom: 14 }}>
        <input type="date" className="input" style={{ width: 160 }} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        <input className="input" style={{ width: 220 }} placeholder="Holiday name, e.g. Diwali" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <button type="submit" className="btn" disabled={adding || !form.date || !form.name.trim()}><Plus size={15} /> Add holiday</button>
      </form>

      <div className="table-wrap">
        {sorted.length === 0 ? (
          <div className="empty-state">No holidays added yet — working-day counts only exclude weekends.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Date</th><th>Name</th><th></th></tr></thead>
            <tbody>
              {sorted.map(h => (
                <tr key={h.id}>
                  <td className="mono">{h.date}</td>
                  <td>{h.name}</td>
                  <td>
                    <button className="icon-btn" onClick={() => onDelete(h.id)} title="Remove"><Trash2 size={14} /></button>
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
