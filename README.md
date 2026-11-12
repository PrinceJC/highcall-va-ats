# HighCall VA Applicant Tracking System

The careers page and recruiting workspace for HighCall VA. It runs on the **same Supabase project as DeviceCare** (HCVA, ref `skeyghmyvfsfeqvsjdyl`), so both systems share one database and one set of logins.

**Candidates** browse roles and apply with a PDF CV, or join the talent pool. They don't need an account.

**Recruiters** sign in with their HCVA login to:

- see a hiring dashboard: applied, shortlisted, hired, added by recruiters, a hiring funnel, a six-month trend and recruiter activity, for this month, last month, the last 30 days, this year or all time

- publish roles publicly or internally
- Boolean-search the talent pool, including CV text
- copy candidates into roles
- screen them on questions, device specs, internet speed and backups
- hand hired people over to DeviceCare

**Stack:** Vite (plain JavaScript), Supabase (shared with DeviceCare), Vercel, GitHub.

---

## How it shares the database with DeviceCare

- **It only adds; it changes nothing in DeviceCare.** All ATS tables and functions start with `ats_`. Private helpers live in a new `ats_private` schema, and CVs go in a new private bucket, `ats-cvs`. No DeviceCare table, function, policy, grant, trigger or edge function is altered.
- **One login, separate permissions.** Everyone signs in with the same HCVA email and password in both apps.
  - DeviceCare access still comes from `devicecare_private.admins`.
  - ATS access comes from `public.ats_staff`.
  - Being admin in one app gives nothing in the other.
  - DeviceCare VA accounts see nothing in the ATS.
- **One controlled link between the systems.** On a **Hired** candidate, a recruiter can click **Add to DeviceCare**. This adds one row to `va_people`, as stage `active`, so IT can register their devices. If DeviceCare already has someone with that email, they're linked instead of duplicated. ATS recruiters still can't read or edit DeviceCare data, and deleting a candidate in the ATS never touches DeviceCare.

---

## Database update for the dashboard (if you already ran the first ATS migration)

The dashboard needs one more additive file: `for-devicecare-repo/supabase/migrations/20261112130000_ats_dashboard.sql`. It adds:

- the **Shortlisted** stage
- a stage history log (`ats_pipeline_events`), so monthly counts are accurate
- the `ats_dashboard()` function

Run it the same way you ran the first one:

1. In Supabase, open **SQL Editor → New query**, paste the whole file and click **Run**. You should see "Success. No rows returned."
2. Copy the file into the DeviceCare repo's `supabase/migrations/` folder and commit it.
3. Before your next `supabase db push` from DeviceCare, mark both ATS files as applied:
   ```powershell
   npx supabase migration repair --status applied 20261112120000 20261112130000 20261112140000 20261112150000 20261112160000
   ```

**Then the offers and outcomes update:** run `for-devicecare-repo/supabase/migrations/20261112140000_ats_outcomes.sql` the same way. It adds:

- the **Withdrawn** stage, for when a candidate declines or pulls out (their choice); **Rejected** stays for when HighCall VA decides not to continue
- dashboard counts for offers accepted and declined, offer acceptance rate, failed screening, failed interview, and the other exits

**Then the candidate update file:** run `for-devicecare-repo/supabase/migrations/20261112150000_ats_candidate_updates.sql` the same way. Candidates who apply again with the same email update their existing record instead of creating a duplicate. A new CV becomes current, and the old one is kept as a previous version (latest 10).

When you repair the migration history later, include all four versions:
```powershell
npx supabase migration repair --status applied 20261112120000 20261112130000 20261112140000 20261112150000 20261112160000
```

Stage history starts from the moment this runs. Anything already in a pipeline is back-filled with the best available dates.


## Candidate emails (templates, red/green tracking)

Recruiters email candidates from the ATS using branded templates. Candidates who moved to Shortlisted, Screening, Interview, Offer, Hired or Rejected show **red "Email needed"** until they're emailed for that stage, then **green**. Emails are sent by a small server function through your existing **Resend** account; DeviceCare's email function isn't touched.

**1. Database:** run `for-devicecare-repo/supabase/migrations/20261112160000_ats_emails.sql` in the SQL Editor, then copy it into the DeviceCare repo's `supabase/migrations/`.

**2. Email function:** from your **DeviceCare** folder:

1. Copy the folder `for-devicecare-repo/supabase/functions/ats-send-email` into DeviceCare's `supabase/functions/`.
2. Add these lines to the end of DeviceCare's `supabase/config.toml`:
   ```toml
   [functions.ats-send-email]
   verify_jwt = false
   ```
3. Check that the Resend key is already there (DeviceCare uses it):
   ```powershell
   npx supabase secrets list
   ```
   You should see `RESEND_API_KEY`.
4. Tell the function which website may use it. Use your ATS Vercel URL; this doesn't change DeviceCare's `APP_ORIGIN`:
   ```powershell
   npx supabase secrets set ATS_APP_ORIGIN=https://YOUR-ATS.vercel.app ATS_ALLOW_LOCALHOST=true
   ```
5. Deploy it:
   ```powershell
   npx supabase functions deploy ats-send-email --no-verify-jwt
   ```

**3. Sender:** in the ATS, go to **Settings → Email sender** and set the sender email. It must be on a domain verified in Resend, such as the one DeviceCare already sends from. Then click **Send me a test** on any template.

The logo in emails loads from `https://YOUR-ATS.vercel.app/email-logo.png`, so it appears once the ATS is deployed. Set `ATS_ALLOW_LOCALHOST=false` once you no longer test locally.

## 1. Add the database changes through the DeviceCare repo

The HCVA project's migrations live in your **DeviceCare** repo. Keep it that way. If two repos push migrations to one project, the Supabase CLI refuses to push from either.

1. Copy `for-devicecare-repo/supabase/migrations/20261112120000_highcall_ats.sql` into the DeviceCare repo's `supabase/migrations/` folder, next to `20261112000100_action_plans_and_emails.sql`.
2. From the DeviceCare repo (already linked to HCVA), run:
   ```bash
   supabase db push
   ```
   The CLI lists only `20261112120000_highcall_ats.sql` as new. Confirm it.
3. Commit the file to the DeviceCare repo.

> **Prefer the SQL Editor?** Paste the file there and run it. Then still copy it into the DeviceCare repo and run `supabase migration repair --status applied 20261112120000`, so the CLI knows it's already applied.

## 2. Make yourself the ATS admin

Open `for-devicecare-repo/ats-bootstrap-admin.sql` and put your login email in it. Your DeviceCare login works. Run it in the HCVA project's SQL Editor.

## 3. Auth settings (add only, don't replace)

In Supabase, go to **Authentication → URL Configuration**:

- **Leave Site URL as DeviceCare's URL.** Changing it would break DeviceCare's emails.
- Under **Redirect URLs**, add:
  - `https://YOUR-ATS-DOMAIN/**` (your ATS Vercel URL, once you have it)
  - `http://localhost:5173/**`

The ATS only sends one kind of email itself: password resets, when someone clicks "Forgot your password?".

**Optional: email limits.** Supabase's built-in email sender only allows a few emails per hour across the whole project, and DeviceCare shares that limit. You already have Resend, so you can add it under **Authentication → Emails → SMTP Settings** to lift the limit for both apps.

**Optional: reset email wording.** If you customized the reset-password email template to mention DeviceCare, consider making it say "HCVA", since both apps use it.

## 4. GitHub and Vercel

Create a **new** GitHub repo and a **new** Vercel project for the ATS. The DeviceCare repo and Vercel project stay as they are.

```bash
cd highcall-va-ats
git init && git add . && git commit -m "HighCall VA ATS"
git branch -M main
git remote add origin https://github.com/YOUR-ORG/highcall-va-ats.git
git push -u origin main
```

In Vercel, click **Add New → Project** and import the repo (Vite is detected automatically). Then add these environment variables:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://skeyghmyvfsfeqvsjdyl.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the HCVA **publishable** key (`sb_publishable_…`), the same one DeviceCare's frontend uses |

Never put the `sb_secret_` key in this app or its Vercel project.

After the first deploy, add the Vercel URL to Redirect URLs (step 3).

`for-devicecare-repo/` is only a hand-off folder. You can delete it from the ATS repo once you've copied the files over.

## 5. Run locally

```bash
cp .env.example .env    # add the publishable key
npm install
npm run dev             # http://localhost:5173
```

---

## Adding teammates

- **They already have a DeviceCare login:** in the ATS, go to **Settings → Team**, enter their email and choose an access level.
- **They're new:** in Supabase, go to **Authentication → Users → Add user → Create new user**. Enter their email and a temporary password, and tick **Auto Confirm User**. Then add them in **Settings → Team**. They can change their password with "Forgot your password?".

| Access | What they can do |
|---|---|
| Admin | Everything, plus manage the ATS team |
| Recruiter | Roles, talent pool, search, screening, CVs, DeviceCare handover |
| Member | See and apply to internal roles |

The ATS never creates logins on its own. Whether public sign-ups are enabled stays DeviceCare's decision. Even if sign-ups are on, a new account gets no ATS access until an admin adds it.

## Using the ATS

**Role visibility:**

- **Draft:** recruiters only.
- **Public:** on the careers page.
- **Internal:** signed-in ATS team members only.
- **Archived:** closed and hidden; candidates stay in the pool.

**Search syntax:**

- Operators: `AND`, `OR`, `NOT` (or `-word`).
- Brackets for grouping, `"exact phrases"` in quotes, and `assist*` for word starts.
- Field filters: `name:`, `skill:`, `location:`, `headline:`, `role:`, `cv:`, `os:`, `note:`.

Example: `("cold calling" OR appointment*) AND skill:gohighlevel NOT location:manila`

**Applications:** candidates submit through one database function, `ats_submit_application`, which:

- validates the details
- only accepts open roles
- checks the CV upload exists

Repeat applications with the same email update the existing profile. CVs are private, and recruiters open them through links that expire after 5 minutes.

**Storage:** CVs count toward the HCVA project's storage quota, shared with DeviceCare. Check it under **Project Settings → Usage** as applications grow.

## What's in the database

| Object | Purpose |
|---|---|
| `ats_staff` | Who can use the ATS, and their access level |
| `ats_roles` | Job openings |
| `ats_screening_templates` | Screening questions per role, plus the talent pool's |
| `ats_candidates` | Talent pool; `va_person_id` links to DeviceCare after handover |
| `ats_pipeline` | Candidate in a role: stage, rating, answers, notes |
| `ats_settings` | Careers page intro |
| `ats_pipeline_events` | Stage history (who moved whom, when). Keeps no personal data, so counts survive candidate deletion |
| `ats_dashboard()` | Dashboard numbers, calculated in Manila time |
| `ats_submit_application()` | Public application endpoint |
| `ats_add_staff()` | Admins add existing HCVA logins |
| `ats_send_to_devicecare()` | Hired candidate → `va_people` |
| `ats-cvs` bucket | Private PDF CVs |

**Undoing it:** drop the `ats_` objects and the `ats-cvs` bucket, and DeviceCare is exactly as it was.
