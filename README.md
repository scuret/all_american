# All American Inline Hockey · Rink Manager

Rink operations app for [All American Inline Hockey](https://allamericaninlinehockey.com) in St. Louis: leagues, seasons, round-robin scheduling, goalie and referee assignment with text-message confirmation, tournaments (pool play into a bracket, or round robin) with public team registration, rink maintenance, and two-way texting and email with players, captains, refs, goalies, and tournament contacts.

Built with Next.js 16 (App Router, server actions), TypeScript, Tailwind v4, Drizzle ORM on Postgres (Neon), Twilio for SMS, Resend for email. Deploys to Vercel.

## Who uses it

| Role | Signs in with | Sees |
|---|---|---|
| **Admin / Staff** | email link or text code | Rink Office: Today, Leagues, Calendar, Goalies, Refs, Tournaments, People, Messages, Rink Ops |
| **Captain** | text code | Player portal plus roster editing, team goalie, fee status for their team |
| **Player** | text code | Their upcoming games with YES / MAYBE / OUT, results, league standings |
| **Goalie** | text code | Assignments to accept or decline; texted invites |
| **Referee** | text code | Assignments to accept or decline; texted invites |
| **Tournament contact** | created on registration | Can sign in to see tournament details |

No passwords. Email gets a magic link, phone gets a 6-digit code (both expire in 15 minutes).

## How goalies work

Each team either **brings its own goalie** or has the **rink fill** the net.

- A team goalie gets a text before each game: *"Reply YES to confirm or NO to pass."*
- If they reply NO (or don't answer within 24 hours), the slot flips to the rink pool.
- Pool fills pick the goalie with the fewest upcoming games who isn't booked within 3 hours of that game and hasn't already declined it, text them, and escalate on NO.
- The **Goalie Board** (`/admin/goalies`) shows every open, pending, and confirmed slot for the next two weeks with one-click *Auto-invite*.

Referees work the same way (90-minute conflict window, even spread).

## Texting and email

- Outbound: `src/lib/messaging.ts`. If Twilio / Resend keys aren't set, nothing is sent; every message lands in **Delivery log** marked *Dev outbox* so you can test safely.
- Inbound: Twilio posts to `/api/webhooks/twilio`. Replies are parsed:
  - `YES` / `NO` → most recent pending goalie invite, then ref invite, then RSVP for the player's next game
  - `STOP` / `START` → opt out / in
  - anything else → **Inbox** for a human reply
- Compose at `/admin/messages/new`: pick an audience (everyone, a league, a season, a team, refs, goalie pool, a tournament's contacts), SMS or email, with templates.

## Scheduling

`src/lib/schedule.ts` builds a balanced round robin (exact games-per-team even with odd team counts, balanced home/away), then lays games onto league nights and time slots, skipping blackout dates and any **rink block** (maintenance, rental, closed) from Rink Ops. Regenerating keeps games already marked FINAL.

Tournaments (`src/lib/tournament.ts`): snake-seeded pools, pool round robin interleaved across slots, then a single-elimination bracket with placeholder seeds (`Pool A #1`, `Winner R1 G2`) that **Advance bracket** resolves from standings and scores.

## Daily automation

`/api/cron/daily` (Vercel Cron, 9am Central):
1. Invites team goalies and auto-fills pool goalies and refs for games in the next 7 days
2. Expires invites with no reply after 24 hours and moves to the next person
3. Texts every rostered player a reminder for tomorrow's games

## Local development

```bash
cp .env.example .env            # fill in DATABASE_URL (local Postgres is fine)
npm install
npm run db:push                 # create tables
npm run db:seed                 # demo data: leagues, teams, games, refs, goalies, a tournament
npm run dev
```

Sign in as `scuret@gmail.com` (admin). In dev mode the code or link shows on screen.

`npm run db:studio` opens Drizzle Studio to browse data.

## Deploying

See [DEPLOY.md](./DEPLOY.md).

## Phase 2: online payments

The data model already tracks fee status and amounts on teams and tournament teams (`feeStatus`, `feePaidCents`). Phase 2 adds Stripe Checkout for team fees, deposits, tournament entry, and Learn-to-Play registration, with a webhook that flips `feeStatus` to PAID.

## Project layout

```
src/app/            routes (admin/, me/, schedule/, tournaments/, login/, api/)
src/components/     shell, nav, UI primitives, game row, bracket
src/db/             schema.ts (Drizzle), index.ts (client), seed.ts
src/lib/            auth, messaging, assignments, schedule, tournament, audience, queries
drizzle.config.ts   migrations config (db:push)
vercel.json         cron schedule
```
