// Supabase Edge Function: weekly-digest
//
// Emails every admin a summary of entries sitting in "submitted" status
// (i.e. waiting on their review). Intended to run on a weekly cron
// schedule — see supabase/schedule_weekly_digest.sql for how to wire
// that up, and the "Weekly digest emails" section in the main README
// for full setup instructions.
//
// Required secrets (set via `supabase secrets set ...`):
//   RESEND_API_KEY   - API key from https://resend.com
//   DIGEST_FROM      - verified sender address, e.g. "SAP Log <log@yourdomain.com>"
//   APP_URL          - your deployed app URL, used in the email's link
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically
// by the Edge Functions runtime — no need to set those yourself.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

Deno.serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("DIGEST_FROM");
    const appUrl = Deno.env.get("APP_URL") || "";

    if (!supabaseUrl || !serviceKey || !resendKey || !from) {
      return new Response(
        JSON.stringify({ error: "Missing one or more required secrets (RESEND_API_KEY, DIGEST_FROM, or built-in Supabase envs)." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: pending, error: entriesErr } = await supabase
      .from("entries")
      .select("consultant_name, project_name, date, hrs, task")
      .eq("status", "submitted")
      .order("date", { ascending: true });
    if (entriesErr) throw entriesErr;

    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "no pending entries" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: admins, error: adminsErr } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("role", "admin");
    if (adminsErr) throw adminsErr;
    if (!admins || admins.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "no admins found" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const totalHrs = pending.reduce((s, e) => s + (parseFloat(e.hrs) || 0), 0).toFixed(2);

    const rows = pending
      .map(e => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${e.date}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(e.consultant_name)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(e.project_name || "—")}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${e.hrs ?? "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(e.task || "")}</td>
      </tr>`)
      .join("");

    const html = `
      <div style="font-family:sans-serif;max-width:640px;margin:0 auto;">
        <h2 style="margin-bottom:4px;">Weekly approval digest</h2>
        <p style="color:#555;margin-top:0;">
          ${pending.length} ${pending.length === 1 ? "entry is" : "entries are"} waiting on review
          (${totalHrs} hrs total).
        </p>
        <table style="border-collapse:collapse;width:100%;font-size:13px;">
          <thead>
            <tr style="background:#f4f4f4;text-align:left;">
              <th style="padding:6px 10px;">Date</th>
              <th style="padding:6px 10px;">Consultant</th>
              <th style="padding:6px 10px;">Project</th>
              <th style="padding:6px 10px;">Hrs</th>
              <th style="padding:6px 10px;">Task</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${appUrl ? `<p style="margin-top:20px;"><a href="${appUrl}" style="background:#5B8DEF;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Open the Approvals queue</a></p>` : ""}
      </div>
    `;

    const results = [];
    for (const admin of admins) {
      if (!admin.email) continue;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: admin.email,
          subject: `${pending.length} entr${pending.length === 1 ? "y" : "ies"} pending your approval`,
          html,
        }),
      });
      results.push({ to: admin.email, ok: res.ok, status: res.status });
    }

    return new Response(JSON.stringify({ sent: results }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
