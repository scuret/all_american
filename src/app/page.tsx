import Link from "next/link";
import { PublicShell } from "@/components/shell";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { leagues, tournaments, seasons } from "@/db/schema";
import { asc, eq, gte, and } from "drizzle-orm";
import { loadGames, toRow } from "@/lib/queries";
import { GameRow } from "@/components/game-row";
import { Card, Empty } from "@/components/ui";
import { DAY_NAMES } from "@/lib/schedule";
import { fmtDate, money } from "@/lib/format";

export default async function Home() {
  const user = await getCurrentUser();
  const [lgs, tourneys, upcoming] = await Promise.all([
    db.query.leagues.findMany({ where: eq(leagues.active, true), orderBy: [asc(leagues.sortOrder)], with: { seasons: { where: eq(seasons.status, "ACTIVE") } } }),
    db.query.tournaments.findMany({ where: and(gte(tournaments.endDate, new Date())), orderBy: [asc(tournaments.startDate)] }),
    loadGames({ from: new Date(), statuses: ["SCHEDULED"], limit: 8 }),
  ]);
  return (
    <PublicShell user={user}>
      <section className="mb-8 rounded-lg bg-red p-6 text-white stripe md:p-10">
        <div className="text-xs font-bold uppercase tracking-[.25em] text-white/70">St. Louis, Missouri</div>
        <h1 className="mt-1 text-3xl text-white md:text-5xl">Leagues. Schedules. Game day.</h1>
        <p className="mt-3 max-w-xl text-sm text-white/90 md:text-base">Adult and youth inline hockey at All American. Check your schedule, confirm you&apos;re in, and get texts when it matters.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={user ? "/me" : "/login"} className="btn bg-white text-red hover:bg-paper-2">{user ? "Go to my games" : "Player sign in"}</Link>
          <Link href="/schedule" className="btn border border-white/40 text-white hover:bg-white/10">View schedules</Link>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-3">
        <Card title="Leagues" className="md:col-span-1">
          <ul className="divide-y hairline text-sm">
            {lgs.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2">
                <div>
                  <Link href={l.seasons[0] ? `/schedule/${l.seasons[0].id}` : "/schedule"} className="font-bold hover:text-red">{l.name}</Link>
                  <div className="text-xs text-ink-3">{DAY_NAMES[l.dayOfWeek]}s · {l.skillLevel}</div>
                </div>
                <span className="badge badge-gray">{l.type}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Upcoming games" className="md:col-span-1">
          {upcoming.length === 0 ? <Empty>No games scheduled.</Empty> : upcoming.map((g) => <GameRow key={g.id} g={toRow(g)} href={`/schedule/${g.seasonId ?? ""}`} showDate compact />)}
        </Card>
        <Card title="Tournaments" className="md:col-span-1">
          {tourneys.length === 0 ? <Empty>No upcoming tournaments.</Empty> : (
            <ul className="space-y-3 text-sm">
              {tourneys.map((t) => (
                <li key={t.id}>
                  <Link href={`/tournaments/${t.id}`} className="font-bold hover:text-red">{t.name}</Link>
                  <div className="text-xs text-ink-3">{t.division} · {fmtDate(t.startDate)} to {fmtDate(t.endDate)} · {money(t.entryFeeCents)}/team</div>
                  {t.registrationOpen && <Link href={`/tournaments/${t.id}/register`} className="btn btn-primary btn-sm mt-2">Register a team</Link>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PublicShell>
  );
}
