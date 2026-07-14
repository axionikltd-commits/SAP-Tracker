# SAP Consultant Log

**Status: frozen requirements, ready to deploy.**

A team activity tracker for SAP consultants: date, consultant, project, expertise
(Technical/Functional), SAP module, BoD/EoD, hours, task, result (Completed / Partial / both),
billable flag, and comments — with real login, an admin role, a submit-for-approval workflow,
project-wise Excel/PDF reports, a holiday-aware utilization calculation, weekly digest emails,
and a shared live-updating log backed by Supabase Postgres.

- Consultants log entries as **drafts**, edit them freely, then **select and submit** them for review.
- Once submitted, an entry is **locked** — the consultant can no longer edit or delete it.
- Admins get an **Approvals** tab: a pending queue (approve/reject, single or bulk) and an
  **approval matrix** summarizing every consultant's draft/pending/approved/rejected counts and
  approved hours.
- Rejected entries unlock automatically so the consultant can fix and resubmit them.
- Every entry belongs to a **project** — pick an existing one or type a new project name inline,
  since the same consultant can be logging time against several projects in parallel.
- Every entry is flagged **Billable** or **Non-billable**, rolled up separately in Reports.
- The **Reports** tab (everyone gets their own view; admins can look at anyone) generates a
  project-wise utilization report — weekly, monthly, for a project's full duration, or a custom
  range — with **Excel and PDF export**, downloaded straight from the browser. Working-day counts
  automatically exclude weekends and any dates in the holiday calendar.
- The **Settings** tab (admin-only) manages project client/start/end dates and the holiday
  calendar directly in the app — no more editing Supabase's table editor by hand.
- An optional **weekly digest email** can notify admins every Monday if anything's sitting in the
  approval queue.
- Admins can also edit/delete any entry regardless of status, and promote/revoke other admins
  from the **Team** tab.
- Everything syncs live across everyone's screen (Supabase Realtime).

---

## How the approval workflow works

Every entry has a `status`: **Draft → Submitted → Approved / Rejected**.

| Status | Who can edit/delete | What happens next |
|---|---|---|
| **Draft** | Owner (or admin) | Owner selects it and clicks "Submit for approval" |
| **Submitted** | Nobody except an admin | Sits in the admin's Approvals queue until reviewed |
| **Approved** | Nobody except an admin | Final — counted in approved hours / matrix / reports |
| **Rejected** | Owner (or admin) | Owner edits it (auto-reverts to Draft) and resubmits |

This isn't just enforced in the UI — it's backed by a Postgres trigger and row-level security
policy, so a submitted or approved entry genuinely cannot be altered by its owner even if they
tried to call the API directly.

**To submit entries:** in the Activity Log, tick the checkbox next to any of your own draft or
rejected entries (the checkbox only appears when a row is eligible), then click **Submit for
approval** in the bar that appears above the table. You can select and submit several at once.

**To approve/reject (admin):** go to the **Approvals** tab. Approve or reject individual rows
inline, or tick several and use the bulk actions. Rejecting asks for a short reason, which the
consultant sees on that row back in the Activity Log.

---

## Projects & assignments

Projects are admin-managed, not created ad hoc from the entry form. In **Settings → Projects**,
an admin creates each project (name, client, start/end date, billable flag) and then clicks the
**people icon** on that row to pick which consultants can log time against it.

A consultant's **Add Entry** project dropdown only ever shows projects they've been assigned to —
this is enforced by row-level security, not just hidden in the UI, so it can't be bypassed by
calling the API directly. Admins aren't restricted by assignments and can log against any project.
This is how the same consultant ends up able to work multiple projects simultaneously: they just
need to be assigned to more than one.

If a consultant has no projects assigned yet, Add Entry tells them so and points them to ask
their admin, instead of silently failing.

Setting a project's start/end dates is also what enables the "Project duration" report period in
Reports.

---

## Billable / non-billable

This is set **once per project** (in Settings → Projects), not per entry — a project is either a
billable client engagement or it isn't, and every entry logged against it inherits that
automatically. Reports splits approved hours into Billable vs Non-billable per consultant, and the
Activity Log can be filtered by it, so you can see utilization against billable client work versus
internal/bench time at a glance.

---

## Reports

Every user has a **Reports** tab. Consultants see their own utilization; admins get a consultant
picker to look at anyone (or everyone).

**Filters:** project, consultant (admins only), and a period —
- **Weekly** — pick any date, the report covers that Monday–Sunday
- **Monthly** — pick a month
- **Project duration** — uses the selected project's start/end date (set in Settings → Projects)
- **Custom range** — any from/to dates

**What it shows:**
- A **utilization summary** per consultant: entries, approved hours, billable hours, non-billable
  hours, distinct days worked, working days in the period, and utilization % (days worked ÷
  working days).
- An **entry detail** table with every matching entry, all statuses included, for context.

Working days = weekdays in the period, minus any dates in the **holiday calendar** (Settings tab).
Utilization numbers are deliberately based on **approved** entries only — drafts, pending, and
rejected rows don't count as confirmed utilized time.

**Exporting:** the **Export Excel** and **Export PDF** buttons generate the file entirely in the
browser (via SheetJS and jsPDF) from whatever's currently filtered, and download it immediately —
no server round-trip. Excel exports include both the summary and detail as separate sheets; PDF
exports include both as sections in one document.

---

## Settings (admin)

Two sections, both admin-only:

- **Projects** — add a project (name, client, start/end date, billable flag), edit any of that
  inline, or click the people icon to assign/unassign consultants. Deleting a project that already
  has entries logged against it will fail with a clear error (the database protects that link) —
  remove or reassign those entries first if you really need to delete it.
- **Holiday calendar** — add/remove specific dates (e.g. public holidays). Anything listed here is
  excluded from "working days" in Reports, on top of weekends.

---

## Weekly digest emails (optional)

If enabled, every admin gets an email each Monday listing everything currently sitting in
"submitted" status, with a link back into the app. This is optional — the app works fully without
it — and takes a bit more setup than the rest since it's a scheduled server-side job rather than
something the browser can do.

**What you need:** a free [Resend](https://resend.com) account (or swap in any transactional email
API — the function is short and easy to adapt) and the [Supabase CLI](https://supabase.com/docs/guides/cli) installed locally.

**Setup:**
1. `supabase login`
2. `supabase link --project-ref <your-project-ref>` (run from the `sap-tracker` folder)
3. Set secrets:
   ```bash
   supabase secrets set RESEND_API_KEY=re_your_key_here
   supabase secrets set DIGEST_FROM="SAP Log <log@yourdomain.com>"
   supabase secrets set APP_URL=https://your-app.vercel.app
   ```
   (`DIGEST_FROM` must be a sender address verified in your Resend account.)
4. Deploy the function:
   ```bash
   supabase functions deploy weekly-digest
   ```
5. Open [`supabase/schedule_weekly_digest.sql`](./supabase/schedule_weekly_digest.sql), fill in
   your project ref and anon key where marked, and run it once in the SQL Editor. This enables
   `pg_cron`/`pg_net` and schedules the function for every Monday 08:00 UTC (edit the cron
   expression in that file to change the day/time).

To test it immediately without waiting for Monday, you can invoke it manually:
```bash
supabase functions invoke weekly-digest
```
It silently does nothing (no email sent) if there's nothing pending or no admins exist yet, so
it's safe to trigger repeatedly while testing.

---

## 1. Set up Supabase (free tier is enough)

**New project (first-time setup):**
1. Go to [supabase.com](https://supabase.com) → **New project**. Save the DB password somewhere safe.
2. Open **SQL Editor → New query**, paste the entire contents of
   [`supabase/schema.sql`](./supabase/schema.sql), and run it. This creates every table (`profiles`,
   `projects`, `entries`, `holidays`), all triggers, and all row-level security policies in one shot.
3. Go to **Project Settings → API**. You'll need:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY`
4. (Optional but recommended for an internal tool) Go to **Authentication → Providers → Email**
   and turn **off** "Confirm email" so teammates can sign up and log in immediately.
5. (Optional) Set up weekly digest emails — see the section above.

**Upgrading an existing deployment?** Run these once, in order, in the SQL Editor — skip any
you've already applied:
1. [`supabase/migration_approval_workflow.sql`](./supabase/migration_approval_workflow.sql) — adds
   the draft/submitted/approved/rejected workflow.
2. [`supabase/migration_projects_and_reports.sql`](./supabase/migration_projects_and_reports.sql) —
   adds the `projects` table and links entries to it.
3. [`supabase/migration_billable_and_holidays.sql`](./supabase/migration_billable_and_holidays.sql) —
   adds the (now-superseded, see next) per-entry billable flag and the `holidays` table.
4. [`supabase/migration_project_billable_and_assignments.sql`](./supabase/migration_project_billable_and_assignments.sql) —
   moves Billable to the project level, restricts project creation to admins, and adds the
   `project_assignments` table. As a one-time convenience it also assigns every existing consultant
   to every existing project, so nobody suddenly loses access to something they were already
   logging time against — trim those down afterward in Settings → Projects.

None of these touch existing rows destructively — old entries just get sensible defaults
(`draft` status, `billable = true`, no project until edited).

### Make yourself admin
1. Sign up in the app with your own email — you'll come in as a regular `consultant` by default.
2. Back in Supabase **SQL Editor**, run:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@yourcompany.com';
   ```
3. Refresh the app — you'll now see the **Approvals**, **Team**, and **Settings** tabs.

---

## 2. Run it locally

```bash
npm install
cp .env.example .env
# edit .env and paste your Supabase URL + anon key
npm run dev
```

Open the printed localhost URL.

---

## 3. Distribute to your team

No separate "invite" step — send teammates the deployed URL and have them **Sign up** with their
work email. They land as `consultant`s automatically; promote anyone to `admin` from the Team tab.

---

## 4. Deploy

### Vercel (recommended for this project)
This is a static Vite/React app talking directly to Supabase — no server to run — which is
exactly what Vercel is built for.

1. Push this folder to a GitHub repo.
2. In Vercel: **Add New → Project → Import** your repo. Vercel auto-detects Vite.
3. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Deploy. You get a shareable `*.vercel.app` URL (or attach your own domain).

> The repo ships with a `package-lock.json` and `vite` pinned to an exact version — keep it that
> way (don't loosen the version range) so installs stay deterministic on Vercel's build servers.

### Render (also works)
1. Push to GitHub as above.
2. In Render: **New → Static Site**, connect the repo.
3. Build command: `npm run build`  ·  Publish directory: `dist`
4. Add the same two environment variables under **Environment**.
5. Deploy.

Either platform redeploys automatically on every push to `main`. The weekly-digest Edge Function
is deployed separately via the Supabase CLI (see above) — it isn't part of the Vercel/Render build.

---

## Project structure

```
sap-tracker/
├─ supabase/
│  ├─ schema.sql                            # run once in Supabase SQL Editor for a NEW project
│  ├─ migration_approval_workflow.sql       # upgrade: draft/submit/approve/reject workflow
│  ├─ migration_projects_and_reports.sql    # upgrade: projects table + entry linkage
│  ├─ migration_billable_and_holidays.sql   # upgrade: billable flag + holiday calendar
│  ├─ migration_project_billable_and_assignments.sql  # upgrade: billable→project, assignments
│  ├─ schedule_weekly_digest.sql            # optional: schedules the digest via pg_cron
│  └─ functions/
│     └─ weekly-digest/index.ts             # optional: Edge Function that sends the digest email
├─ src/
│  ├─ App.jsx            # activity log, auth, entry form, nav shell
│  ├─ ReportsPanel.jsx    # utilization report + Excel/PDF export
│  ├─ SettingsPanel.jsx   # admin: project dates + holiday calendar
│  ├─ reportUtils.js      # date range math, utilization calc, export builders
│  ├─ supabaseClient.js  # Supabase client (reads env vars)
│  ├─ main.jsx
│  └─ index.css
├─ index.html
├─ package.json
├─ vite.config.js
└─ .env.example
```

---

## How things are enforced (security notes)

- Passwords and auth are fully handled by Supabase Auth (not something we roll ourselves).
- Row-level security + Postgres triggers enforce the approval workflow and the admin-only role
  changes **server-side**, not just in the UI — this holds even against a modified frontend or
  direct API calls.
- Only admins can insert/edit/delete projects' dates, add/remove holidays, or approve/reject
  entries — all backed by RLS policies, not just hidden buttons.
- To remove someone's access entirely, delete their user from **Supabase → Authentication → Users**
  (deleting only their `profiles` row is not enough — see the note below).
- The `xlsx` (SheetJS) package has a couple of known advisories with no npm-side fix yet
  (prototype pollution / ReDoS in its *parsing* code path). This app only ever **writes** exports
  from data already in the database — it never parses user-uploaded spreadsheets — so the
  practical exposure is low, but worth knowing if you later add spreadsheet *import*.

## Common gotchas

- **"User already registered" when signing someone up again after removing them**: deleting a row
  from `public.profiles` in the Table Editor does *not* delete the underlying login. Delete the
  user from **Authentication → Users** instead; the profile is recreated automatically next time
  they sign up (or was never really gone).
- **A role update from the SQL Editor "succeeds" but doesn't stick**: this was a bug in an earlier
  version's trigger (already fixed in `schema.sql`) — the trigger blocked role changes whenever
  `auth.uid()` was `NULL`, which is always true for direct SQL Editor queries. If you're running
  on that older schema, re-run the fixed `create or replace function public.prevent_role_escalation()`
  block near the top of `schema.sql`.
- **Vercel build fails with an ERESOLVE/vite version conflict**: make sure `package.json` and
  `package-lock.json` both match what's in this zip — `vite` is deliberately pinned to `5.4.11` to
  stay compatible with `@vitejs/plugin-react`.
- **"Export failed: i.autoTable is not a function"**: fixed — this happened because
  `jspdf-autotable`'s plugin patching doesn't reliably attach to `jsPDF` when both are loaded via
  a dynamic/code-split `import()`, which is what the Reports tab does to keep them out of the main
  bundle. `reportUtils.js` now calls `jspdf-autotable`'s functional API (`autoTable(doc, options)`)
  instead of the patched `doc.autoTable(options)`, which works reliably under code splitting.
- **Login page shows a previously-used email pre-filled**: that's the browser's own saved-credential
  autofill (Chrome especially), not the app defaulting anything — the login/signup fields now carry
  a randomized `name` attribute and `autoComplete="off"` specifically to stop browsers from
  recognizing and autofilling them.

## Possible future ideas (not built, not required)

Everything from the original "extend" list is now implemented. If you want to keep going later:
Slack/Teams notifications instead of (or alongside) email, CSV import for bulk-loading historical
entries, per-region holiday calendars if the team spans countries, SSO/SAML login, or a mobile-
friendly quick-entry view. None of these are needed to deploy today.
