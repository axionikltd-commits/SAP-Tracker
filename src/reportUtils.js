// Date + utilization helpers shared by the Reports tab.

export function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

export function parseISO(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Monday–Sunday range containing the given date string.
export function getWeekRange(dateStr) {
  const d = parseISO(dateStr);
  const day = d.getDay(); // 0 = Sun ... 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toISODate(monday), end: toISODate(sunday) };
}

// First–last day of month for "YYYY-MM".
export function getMonthRange(yearMonthStr) {
  const [y, m] = yearMonthStr.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  return { start: toISODate(first), end: toISODate(last) };
}

// Counts Mon–Fri days in the range, excluding any date present in holidaySet
// (a Set of "YYYY-MM-DD" strings).
export function countWeekdays(startStr, endStr, holidaySet = new Set()) {
  if (!startStr || !endStr) return 0;
  let count = 0;
  let cur = parseISO(startStr);
  const end = parseISO(endStr);
  while (cur <= end) {
    const day = cur.getDay();
    const iso = toISODate(cur);
    if (day !== 0 && day !== 6 && !holidaySet.has(iso)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export function inRange(dateStr, startStr, endStr) {
  if (startStr && dateStr < startStr) return false;
  if (endStr && dateStr > endStr) return false;
  return true;
}

// Builds the summary (per-consultant utilization) and detail rows for the
// currently selected filters. Utilization is computed off APPROVED entries
// only — drafts/pending/rejected don't count as confirmed utilized time,
// but they still show up in the detail table for visibility. Billable vs
// non-billable hours are also split out (approved entries only).
export function buildReport({ entries, profiles, projectId, consultantId, start, end, holidays = [] }) {
  const scoped = entries.filter(e => {
    if (projectId !== "All" && e.project_id !== projectId) return false;
    if (consultantId !== "All" && e.consultant_id !== consultantId) return false;
    if (!inRange(e.date, start, end)) return false;
    return true;
  });

  const holidaySet = new Set(holidays.filter(h => inRange(h.date, start, end)).map(h => h.date));
  const workingDays = countWeekdays(start, end, holidaySet);

  const byConsultant = {};
  profiles.forEach(p => {
    byConsultant[p.id] = {
      consultantId: p.id,
      name: p.full_name,
      entries: 0,
      approvedHrs: 0,
      billableHrs: 0,
      nonBillableHrs: 0,
      daysWorked: new Set(),
    };
  });

  scoped.forEach(e => {
    const row = byConsultant[e.consultant_id];
    if (!row) return;
    row.entries += 1;
    if (e.status === "approved") {
      const hrs = parseFloat(e.hrs) || 0;
      row.approvedHrs += hrs;
      if (e.billable === false) row.nonBillableHrs += hrs;
      else row.billableHrs += hrs;
      row.daysWorked.add(e.date);
    }
  });

  const summaryRows = Object.values(byConsultant)
    .filter(r => r.entries > 0)
    .map(r => ({
      name: r.name,
      entries: r.entries,
      approvedHrs: Number(r.approvedHrs.toFixed(2)),
      billableHrs: Number(r.billableHrs.toFixed(2)),
      nonBillableHrs: Number(r.nonBillableHrs.toFixed(2)),
      daysWorked: r.daysWorked.size,
      workingDays,
      utilizationPct: workingDays > 0 ? Number(((r.daysWorked.size / workingDays) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.approvedHrs - a.approvedHrs);

  const detailRows = scoped
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({
      date: e.date,
      consultant: e.consultant_name,
      project: e.project_name || "—",
      expertise: e.expertise,
      module: e.module,
      hrs: e.hrs ?? "",
      billable: e.billable === false ? "Non-billable" : "Billable",
      status: e.status,
      task: e.task,
      result: (e.result || []).join(", "),
    }));

  return { summaryRows, detailRows, workingDays, entryCount: scoped.length, holidaysExcluded: holidaySet.size };
}

export async function exportExcel({ summaryRows, detailRows, title, subtitle }) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.json_to_sheet(summaryRows.map(r => ({
    Consultant: r.name,
    Entries: r.entries,
    "Approved Hrs": r.approvedHrs,
    "Billable Hrs": r.billableHrs,
    "Non-billable Hrs": r.nonBillableHrs,
    "Days Worked": r.daysWorked,
    "Working Days in Period": r.workingDays,
    "Utilization %": r.utilizationPct,
  })));
  XLSX.utils.book_append_sheet(wb, summarySheet, "Utilization Summary");

  const detailSheet = XLSX.utils.json_to_sheet(detailRows.map(r => ({
    Date: r.date,
    Consultant: r.consultant,
    Project: r.project,
    Expertise: r.expertise,
    Module: r.module,
    Hrs: r.hrs,
    Billable: r.billable,
    Status: r.status,
    Task: r.task,
    Result: r.result,
  })));
  XLSX.utils.book_append_sheet(wb, detailSheet, "Entry Detail");

  const filename = `${title.replace(/[^a-z0-9]+/gi, "_")}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export async function exportPDF({ summaryRows, detailRows, title, subtitle }) {
  const { jsPDF } = await import("jspdf");
  await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(16);
  doc.text(title, 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(subtitle, 14, 23);

  doc.autoTable({
    startY: 30,
    head: [["Consultant", "Entries", "Approved Hrs", "Billable", "Non-billable", "Days Worked", "Working Days", "Utilization %"]],
    body: summaryRows.map(r => [r.name, r.entries, r.approvedHrs, r.billableHrs, r.nonBillableHrs, r.daysWorked, r.workingDays, `${r.utilizationPct}%`]),
    headStyles: { fillColor: [91, 141, 239] },
    styles: { fontSize: 9 },
  });

  const afterSummaryY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.setTextColor(30);
  doc.text("Entry detail", 14, afterSummaryY);

  doc.autoTable({
    startY: afterSummaryY + 4,
    head: [["Date", "Consultant", "Project", "Expertise", "Module", "Hrs", "Billable", "Status", "Task", "Result"]],
    body: detailRows.map(r => [r.date, r.consultant, r.project, r.expertise, r.module, r.hrs, r.billable, r.status, r.task, r.result]),
    headStyles: { fillColor: [91, 141, 239] },
    styles: { fontSize: 8, cellWidth: "wrap" },
    columnStyles: { 8: { cellWidth: 55 } },
  });

  const filename = `${title.replace(/[^a-z0-9]+/gi, "_")}.pdf`;
  doc.save(filename);
}
