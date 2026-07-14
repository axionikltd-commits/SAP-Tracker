import { useState } from "react";
import { Pencil, Trash2, Check, X, Plus, CalendarDays, Briefcase } from "lucide-react";

export default function SettingsPanel({ projects, holidays, entries, onCreateProject, onUpdateProject, onDeleteProject, onAddHoliday, onDeleteHoliday }) {
  return (
    <>
      <p className="section-title"><Briefcase size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Projects</p>
      <ProjectsSection projects={projects} entries={entries} onCreate={onCreateProject} onUpdate={onUpdateProject} onDelete={onDeleteProject} />

      <p className="section-title" style={{ marginTop: 28 }}><CalendarDays size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Holiday calendar</p>
      <p className="hint-text" style={{ textAlign: "left", margin: "0 0 12px" }}>
        Dates listed here are excluded from "working days" in the Reports tab, on top of weekends.
      </p>
      <HolidaysSection holidays={holidays} onAdd={onAddHoliday} onDelete={onDeleteHoliday} />
    </>
  );
}

function ProjectsSection({ projects, entries, onCreate, onUpdate, onDelete }) {
  const [newProject, setNewProject] = useState({ name: "", client_name: "", start_date: "", end_date: "" });
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [creating, setCreating] = useState(false);

  const entryCount = (projectId) => entries.filter(e => e.project_id === projectId).length;

  function startEdit(p) {
    setEditingId(p.id);
    setEditValues({ client_name: p.client_name || "", start_date: p.start_date || "", end_date: p.end_date || "" });
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
    });
    setCreating(false);
    setNewProject({ name: "", client_name: "", start_date: "", end_date: "" });
  }

  return (
    <>
      <form onSubmit={handleCreate} className="toolbar" style={{ marginBottom: 14 }}>
        <input className="input" style={{ width: 200 }} placeholder="New project name" value={newProject.name} onChange={e => setNewProject(f => ({ ...f, name: e.target.value }))} />
        <input className="input" style={{ width: 170 }} placeholder="Client (optional)" value={newProject.client_name} onChange={e => setNewProject(f => ({ ...f, client_name: e.target.value }))} />
        <input type="date" className="input" style={{ width: 150 }} value={newProject.start_date} onChange={e => setNewProject(f => ({ ...f, start_date: e.target.value }))} title="Start date" />
        <input type="date" className="input" style={{ width: 150 }} value={newProject.end_date} onChange={e => setNewProject(f => ({ ...f, end_date: e.target.value }))} title="End date" />
        <button type="submit" className="btn" disabled={creating || !newProject.name.trim()}><Plus size={15} /> Add project</button>
      </form>

      <div className="table-wrap" style={{ marginBottom: 22 }}>
        {projects.length === 0 ? (
          <div className="empty-state">No projects yet — add one above, or create one from the entry form.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Project</th><th>Client</th><th>Start date</th><th>End date</th><th>Entries</th><th></th></tr>
            </thead>
            <tbody>
              {projects.map(p => {
                const editing = editingId === p.id;
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>
                      {editing ? (
                        <input className="input" style={{ width: 150 }} value={editValues.client_name} onChange={e => setEditValues(v => ({ ...v, client_name: e.target.value }))} />
                      ) : (p.client_name || "—")}
                    </td>
                    <td>
                      {editing ? (
                        <input type="date" className="input" style={{ width: 150 }} value={editValues.start_date} onChange={e => setEditValues(v => ({ ...v, start_date: e.target.value }))} />
                      ) : <span className="mono">{p.start_date || "—"}</span>}
                    </td>
                    <td>
                      {editing ? (
                        <input type="date" className="input" style={{ width: 150 }} value={editValues.end_date} onChange={e => setEditValues(v => ({ ...v, end_date: e.target.value }))} />
                      ) : <span className="mono">{p.end_date || "—"}</span>}
                    </td>
                    <td className="mono">{entryCount(p.id)}</td>
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
    </>
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
