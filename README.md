# SAP Consultant Log

A team activity tracker for SAP consultants: date, consultant, expertise (Technical/Functional),
SAP module, BoD/EoD, hours, task, result (Completed / Partial / both), and comments — with real
login, an admin role, a submit-for-approval workflow, and a shared live-updating log backed by
Supabase Postgres.

- Consultants log entries as **drafts**, edit them freely, then **select and submit** them for review.
- Once submitted, an entry is **locked** — the consultant can no longer edit or delete it.
- Admins get an **Approvals** tab: a pending queue (approve/reject, single or bulk) and an
  **approval matrix** summarizing every consultant's draft/pending/approved/rejected counts and
  approved hours.
- Rejected entries unlock automatically so the consultant can fix and resubmit them.
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
| **Approved** | Nobody except an admin | Final — counted in approved hours / matrix |
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

## 1. Set up Supabase (free tier is enough)

**New project (first-time setup):**
1. Go to [supabase.com](https://supabase.com) → **New project**. Save the DB password somewhere safe.
2. Open **SQL Editor → New query**, paste the entire contents of
   [`supabase/schema.sql`](./supabase/schema.sql), and run it. This creates the `profiles` and
   `entries` tables (including the approval-workflow columns), the auto-profile trigger, the
   workflow guardrail trigger, and all row-level security policies.
3. Go to **Project Settings → API**. You'll need:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY`
4. (Optional but recommended for an internal tool) Go to **Authentication → Providers → Email**
   and turn **off** "Confirm email" so teammates can sign up and log in immediately.

**Already had the app running before this update?** Don't re-run `schema.sql` — instead run
[`supabase/migration_approval_workflow.sql`](./supabase/migration_approval_workflow.sql) once in
the SQL Editor. It adds the new columns/trigger to your existing tables without touching your
existing data (every existing entry becomes a `draft`).

### Make yourself admin
1. Sign up in the app with your own email — you'll come in as a regular `consultant` by default.
2. Back in Supabase **SQL Editor**, run:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@yourcompany.com';
   ```
3. Refresh the app — you'll now see the **Approvals** and **Team** tabs.

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

Either platform redeploys automatically on every push to `main`.

---

## Project structure

```
sap-tracker/
├─ supabase/
│  ├─ schema.sql                       # run once in Supabase SQL Editor for a NEW project
│  └─ migration_approval_workflow.sql  # run once if upgrading an EXISTING project
├─ src/
│  ├─ App.jsx            # all UI + logic (activity log, approvals, team)
│  ├─ supabaseClient.js  # Supabase client (reads env vars)
│  ├─ main.jsx
│  └─ index.css
├─ index.html
├─ package.json
├─ vite.config.js
└─ .env.example
```

## Notes / things you may want to extend
- Passwords and auth are fully handled by Supabase Auth (not something we roll ourselves).
- Row-level security + a Postgres trigger enforce the whole workflow server-side, not just in
  the UI — locked entries stay locked even against a modified frontend or direct API calls.
- To remove someone's access entirely, delete their user from **Supabase → Authentication → Users**.
- Natural next additions: CSV/Excel export of approved hours, weekly digest emails to admins when
  entries are pending, a "billable/non-billable" flag, or per-consultant monthly approval reports —
  straightforward additions to the `entries` table and Approvals tab. Just say the word.
