# SAP Consultant Log

A team activity tracker for SAP consultants: date, consultant, expertise (Technical/Functional),
SAP module, BoD/EoD, hours, task, result (Completed / Partial / both), and comments — with
real login, an admin role, and a shared live-updating log backed by Supabase Postgres.

- Consultants can log their own entries and edit/delete only their own rows.
- Admins see everything, can edit/delete any entry, and can promote/revoke other admins from the **Team** tab.
- Changes sync live across everyone's screen (Supabase Realtime).

---

## 1. Set up Supabase (free tier is enough)

1. Go to [supabase.com](https://supabase.com) → **New project**. Save the DB password somewhere safe.
2. Once it's ready, open **SQL Editor → New query**, paste the entire contents of
   [`supabase/schema.sql`](./supabase/schema.sql), and run it. This creates the `profiles` and
   `entries` tables, the auto-profile trigger, and all row-level security policies.
3. Go to **Project Settings → API**. You'll need:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY`
4. (Optional but recommended for an internal tool) Go to **Authentication → Providers → Email**
   and turn **off** "Confirm email" so teammates can sign up and log in immediately without
   verifying an email address. Leave it on if you'd rather require verification.

### Make yourself admin
1. Run the app (or deploy it) and sign up with your own email — you'll come in as a regular
   `consultant` by default.
2. Back in Supabase **SQL Editor**, run:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@yourcompany.com';
   ```
3. Refresh the app — you'll now see the **Team** tab, where you can promote/revoke admin
   access for anyone else who signs up, no SQL needed after this point.

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

There's no separate "invite" step needed — send teammates the deployed URL and have them
**Sign up** with their work email. They land as `consultant`s automatically; promote anyone
to `admin` from the Team tab whenever you like.

---

## 4. Deploy

### Vercel (recommended for this project)
This is a static Vite/React app talking directly to Supabase — no server to run — which is
exactly what Vercel is built for.

1. Push this folder to a GitHub repo.
2. In Vercel: **Add New → Project → Import** your repo. Vercel auto-detects Vite.
3. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. Done — you get a shareable `*.vercel.app` URL (or attach your own domain).

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
├─ supabase/schema.sql   # run once in Supabase SQL Editor
├─ src/
│  ├─ App.jsx            # all UI + logic
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
- Row-level security enforces the "own entries only" rule server-side, not just in the UI —
  even a modified frontend couldn't edit someone else's row unless it's an admin account.
- To remove someone's access entirely, delete their user from **Supabase → Authentication → Users**.
- If you want CSV export, per-consultant monthly reports, or a "billable/non-billable" flag,
  those are straightforward additions to `entries` — just say the word.
