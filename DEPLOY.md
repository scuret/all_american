# Deploying to Vercel

Target: push to `main` on `github.com/scuret/all_american` → Vercel builds and deploys automatically.

## 1. Vercel project

1. In Vercel: **Add New → Project → Import** `scuret/all_american`. Framework is auto-detected (Next.js). Keep the defaults.
2. Before the first deploy, add the environment variables below (Settings → Environment Variables), or let the first build fail and redeploy after adding them.

## 2. Database: Neon via Vercel Marketplace

1. Project → **Storage → Create Database → Neon** (free tier is plenty).
2. Vercel injects `DATABASE_URL` (pooled) automatically. Use that one.
3. Tables are created automatically: the build command is `drizzle-kit push --force && next build`, so every deploy syncs the schema to Neon.
   Optional demo data (this **wipes** the database; don't run it on real data):
   ```bash
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/admin/seed
   ```
4. Create your admin: either seed, or insert one row:
   ```sql
   insert into users (id, name, email, phone, roles, sms_opt_in) values ('admin1', 'Stephen Curet', 'scuret@gmail.com', '+19048601980', '{ADMIN}', true);
   ```

## 3. Environment variables

| Name | Value |
|---|---|
| `DATABASE_URL` | from Neon (set by the integration) |
| `AUTH_SECRET` | `openssl rand -hex 32` |
| `APP_URL` | `https://<your-project>.vercel.app` (or your custom domain). Used in magic links and texts. |
| `CRON_SECRET` | any long random string; Vercel sends it on cron calls |
| `TWILIO_ACCOUNT_SID` | Twilio Console → Account Info |
| `TWILIO_AUTH_TOKEN` | Twilio Console → Account Info |
| `TWILIO_FROM_NUMBER` | your Twilio number in E.164, e.g. `+13145550123` |
| `RESEND_API_KEY` | Resend → API Keys |
| `EMAIL_FROM` | `All American Inline Hockey <noreply@allamericaninlinehockey.com>` after domain verification |

Leave the Twilio / Resend values blank to run in dev-outbox mode (nothing sent, everything visible in Delivery log).

**`DEV_LOGIN=1`** shows sign-in codes/links on screen when no provider is configured. It is set on the prototype so you can sign in before Twilio/Resend exist. **Remove it as soon as either provider is configured**; with it set, anyone who knows a registered email or phone can sign in as that person.

## 4. Twilio (SMS)

1. Buy a local 314 number (Phone Numbers → Buy).
2. **A2P 10DLC registration** (required for US business texting; takes a few days):
   - Register the business brand (legal name, EIN, address).
   - Create a campaign. Use case: *Mixed* or *Customer Care*. Sample messages: the game reminder and goalie invite texts in `src/lib/assignments.ts`. Opt-in description: "Players, referees, and goalies provide their mobile number when registering with the rink and may reply STOP at any time."
   - Attach the number to the campaign.
3. Messaging → the number → **A message comes in** → Webhook, `POST`, `https://<APP_URL>/api/webhooks/twilio`.
4. Set the three `TWILIO_*` variables in Vercel and redeploy.

Until 10DLC is approved, Twilio will throttle or block texts to US numbers. Email keeps working in the meantime.

## 5. Resend (email)

1. Resend → Domains → add `allamericaninlinehockey.com` and add the DNS records it gives you (at the registrar / wherever the site's DNS lives).
2. API Keys → create one → `RESEND_API_KEY`.
3. Set `EMAIL_FROM` to a `noreply@` on that domain.

## 6. Cron

`vercel.json` schedules `/api/cron/daily` at 15:00 UTC (9am Central). Vercel calls it with `Authorization: Bearer $CRON_SECRET`. Nothing else to set up; you can hit the URL manually with that header to run it on demand.

## 7. Custom domain (optional)

Project → Domains → add `app.allamericaninlinehockey.com` (a CNAME to `cname.vercel-dns.com`). Then update `APP_URL`.

## 8. Checklist after first deploy

- [ ] `https://<app>/api/health` returns `{"ok":true,"db":"up"}`
- [ ] Sign in with your email; the link arrives (or shows on screen if Resend isn't set)
- [ ] People → add yourself a phone, sign out, sign in by text
- [ ] Leagues → create the real leagues and current season, add teams, generate the schedule
- [ ] Messages → send yourself a test text; reply `YES` and see it in Inbox
- [ ] Rink Ops → add the real maintenance tasks and any upcoming blocks

## Re-deploys

Every push to `main` deploys. Schema changes: edit `src/db/schema.ts`, then `DATABASE_URL=... npm run db:push` against Neon before (or right after) the push.
