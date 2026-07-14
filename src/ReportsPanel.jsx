import { useState, useMemo } from "react";
import { FileSpreadsheet, FileText, Info } from "lucide-react";
import { getWeekRange, getMonthRange, buildReport, exportExcel, exportPDF, toISODate } from "./reportUtils";

const todayStr = () => toISODate(new Date());

export default function ReportsPanel({ entries, profiles, projects, holidays, isAdmin, currentUserId }) {
  const [projectId, setProjectId] = useState("All");
  const [consultantId, setConsultantId] = useState(isAdmin ? "All" : currentUserId);
  const [periodType, setPeriodType] = useState("monthly"); // weekly | monthly | project | custom
  const [weekAnchor, setWeekAnchor] = useState(todayStr());
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [customStart, setCustomStart] = useState(todayStr().slice(0, 8) + "01");
  const [customEnd, setCustomEnd] = useState(todayStr());
  const [exporting, setExporting] = useState(false);

  const selectedProject = projects.find(p => p.id === projectId);

  const { start, end, rangeLabel } = useMemo(() => {
    if (periodType === "weekly") {
      const r = getWeekRange(weekAnchor);
      return { ...r, rangeLabel: `Week of ${r.start} – ${r.end}` };
    }
    if (periodType === "monthly") {
      const r = getMonthRange(month);
      return { ...r, rangeLabel: `${r.start} – ${r.end}` };
    }
    if (periodType === "project") {
      if (!selectedProject) return { start: null, end: null, rangeLabel: "Pick a specific project above to use its duration" };
      const s = selectedProject.start_date;
      const en = selectedProject.end_date || todayStr();
      if (!s) return { start: null, end: null, rangeLabel: "This project has no start date set (edit it in Settings → Projects) — or use Custom range instead" };
      return { start: s, end: en, rangeLabel: `Project duration: ${s} – ${en}` };
    }
    return { start: customStart, end: customEnd, rangeLabel: `${customStart} – ${customEnd}` };
  }, [periodType, weekAnchor, month, customStart, customEnd, selectedProject]);

  const report = useMemo(() => {
    if (!start || !end) return { summaryRows: [], detailRows: [], workingDays: 0, entryCount: 0, holidaysExcluded: 0 };
    const scopedConsultant = isAdmin ? consultantId : currentUserId;
    return buildReport({ entries, profiles, projectId, consultantId: scopedConsultant, start, end, holidays });
  }, [entries, profiles, projectId, consultantId, start, end, isAdmin, currentUserId, holidays]);

  const title = `Utilization Report${selectedProject ? " — " + selectedProject.name : ""}`;
  const subtitle = `${rangeLabel}${projectId !== "All" && selectedProject ? "" : ""}`;

  async function handleExport(fmt) {
    setExporting(true);
    try {
      const payload = { summaryRows: report.summaryRows, detailRows: report.detailRows, title, subtitle };
      if (fmt === "excel") await exportExcel(payload);
      else await exportPDF(payload);
    } catch (err) {
      alert("Export failed: " + err.message);
    }
    setExporting(false);
  }

  return (
    <>
      <div className="toolbar">
        <select className="select" style={{ width: 200 }} value={projectId} onChange={e => setProjectId(e.target.value)}>
          <option value="All">All projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {isAdmin && (
          <select className="select" style={{ width: 180 }} value={consultantId} onChange={e => setConsultantId(e.target.value)}>
            <option value="All">All consultants</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        )}

        <select className="select" style={{ width: 160 }} value={periodType} onChange={e => setPeriodType(e.target.value)}>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="project">Project duration</option>
          <option value="custom">Custom range</option>
        </select>

        {periodType === "weekly" && (
          <input type="date" className="input" style={{ width: 160 }} value={weekAnchor} onChange={e => setWeekAnchor(e.target.value)} />
        )}
        {periodType === "monthly" && (
          <input type="month" className="input" style={{ width: 160 }} value={month} onChange={e => setMonth(e.target.value)} />
        )}
        {periodType === "custom" && (
          <>
            <input type="date" className="input" style={{ width: 150 }} value={customStart} onChange={e => setCustomStart(e.target.value)} />
            <span style={{ color: "var(--dim)" }}>to</span>
            <input type="date" className="input" style={{ width: 150 }} value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
          </>
        )}

        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost" disabled={exporting || report.detailRows.length === 0} onClick={() => handleExport("excel")}>
          <FileSpreadsheet size={15} /> Export Excel
        </button>
        <button className="btn btn-ghost" disabled={exporting || report.detailRows.length === 0} onClick={() => handleExport("pdf")}>
          <FileText size={15} /> Export PDF
        </button>
      </div>

      <p className="hint-text" style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 6, margin: "0 0 16px" }}>
        <Info size={13} /> {rangeLabel} · working days exclude weekends{report.holidaysExcluded > 0 ? ` and ${report.holidaysExcluded} holiday${report.holidaysExcluded > 1 ? "s" : ""}` : ""} · utilization counts only <strong style={{ color: "var(--ok)" }}>&nbsp;approved&nbsp;</strong> entries.
      </p>

      <div className="stats">
        <div className="stat"><div className="stat-val mono">{report.entryCount}</div><div className="stat-label">Entries in range</div></div>
        <div className="stat"><div className="stat-val mono">{report.workingDays}</div><div className="stat-label">Working days in period</div></div>
        <div className="stat"><div className="stat-val mono">{report.summaryRows.reduce((s, r) => s + r.approvedHrs, 0).toFixed(2)}</div><div className="stat-label">Total approved hrs</div></div>
        <div className="stat"><div className="stat-val mono">{report.summaryRows.reduce((s, r) => s + r.billableHrs, 0).toFixed(2)}</div><div className="stat-label">Billable hrs</div></div>
      </div>

      <p className="section-title">Utilization summary</p>
      <div className="table-wrap" style={{ marginBottom: 22 }}>
        {report.summaryRows.length === 0 ? (
          <div className="empty-state">No entries match these filters.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Consultant</th><th>Entries</th><th>Approved hrs</th><th>Billable</th><th>Non-billable</th><th>Days worked</th><th>Working days</th><th>Utilization</th></tr>
            </thead>
            <tbody>
              {report.summaryRows.map(r => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="mono">{r.entries}</td>
                  <td className="mono">{r.approvedHrs}</td>
                  <td className="mono">{r.billableHrs}</td>
                  <td className="mono">{r.nonBillableHrs}</td>
                  <td className="mono">{r.daysWorked}</td>
                  <td className="mono">{r.workingDays}</td>
                  <td className="mono">{r.utilizationPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="section-title">Entry detail</p>
      <div className="table-wrap">
        {report.detailRows.length === 0 ? (
          <div className="empty-state">No entries match these filters.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Date</th><th>Consultant</th><th>Project</th><th>Expertise</th><th>Module</th><th>Hrs</th><th>Billable</th><th>Status</th><th>Task</th><th>Result</th></tr>
            </thead>
            <tbody>
              {report.detailRows.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r.date}</td>
                  <td>{r.consultant}</td>
                  <td>{r.project}</td>
                  <td>{r.expertise}</td>
                  <td>{r.module}</td>
                  <td className="mono">{r.hrs}</td>
                  <td>{r.billable}</td>
                  <td>{r.status}</td>
                  <td style={{ maxWidth: 220 }}>{r.task}</td>
                  <td>{r.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
