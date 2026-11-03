import Link from "next/link";
import { PageHeader, Card, Stat, Empty } from "@/components/ui";
import { GameRow } from "@/components/game-row";
import { loadGames, toRow, dashboardCounts } from "@/lib/queries";
import { db } from "@/db";
import { inboundMessages, maintenanceTasks } from "@/db/schema";
import { and, desc, eq, lt } from "drizzle-orm";
import { fmtDateLong, fmtDate } from "@/lib/format";
import { startOfDay, endOfDay, addDays } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export default async function AdminHome() {
  const now = new Date();
  const local = toZonedTime(now, "America/Chicago");
  const dayStart = fromZonedTime(startOfDay(local), "America/Chicago");
  const dayEnd = fromZonedTime(endOfDay(local), "America/Chicago");
  const [today, upcoming, counts, inbound, overdue] = await Promise.all([
    loadGames({ from: dayStart, to: dayEnd }),
    loadGames({ from: dayEnd, to: addDays(now, 7), statuses: ["SCHEDULED"], limit: 12 }),
    dashboardCounts(),
    db.query.inboundMessages.findMany({ where: eq(inboundMessages.handled, false), orderBy: [desc(inboundMessages.createdAt)], limit: 5, with: { user: true } }),
    db.query.maintenanceTasks.findMany({ where: and(eq(maintenanceTasks.active, true), lt(maintenanceTasks.nextDueAt, now)), with: { assignee: true }, limit: 5 }),
  ]);
  const gapGames = upcoming.map(toRow).filter((r) => (r.goalieNeeded ?? 0) + (r.refNeeded ?? 0) > 0);

  return (
    <>
      <PageHeader kicker={fmtDateLong(now)} title="Today at the Rink" actions={<Link href="/admin/messages/new" className="btn btn-primary">✉ Send a message</Link>} />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Games, next 7 days" value={counts.gamesThisWeek} />
        <Stat label="Goalie gaps" value={counts.goalieGaps} tone={counts.goalieGaps ? "red" : "ok"} hint="next 7 days" />
        <Stat label="Ref gaps" value={counts.refGaps} tone={counts.refGaps ? "red" : "ok"} hint="next 7 days" />
        <Stat label="Teams owing fees" value={counts.unpaid} tone={counts.unpaid ? "warn" : "ok"} />
        <Stat label="Overdue rink tasks" value={counts.overdue} tone={counts.overdue ? "warn" : "ok"} />
        <Stat label="Open repair tickets" value={counts.openTickets} tone={counts.openTickets ? "warn" : "ok"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card title={`Today's games (${today.length})`} actions={<Link href="/admin/schedule" className="text-xs font-bold uppercase text-red">Full calendar →</Link>}>
            {today.length === 0 ? <Empty>No games on the schedule today.</Empty> : today.map((g) => <GameRow key={g.id} g={toRow(g)} href={`/admin/games/${g.id}`} />)}
          </Card>
          <Card title="Needs attention this week" actions={<Link href="/admin/goalies" className="text-xs font-bold uppercase text-red">Goalie board →</Link>}>
            {gapGames.length === 0 ? <Empty>Every game in the next 7 days has a goalie and a ref lined up.</Empty> : gapGames.map((r) => <GameRow key={r.id} g={r} href={`/admin/games/${r.id}`} showDate />)}
          </Card>
        </div>
        <div className="space-y-5">
          <Card title="Unhandled replies" actions={<Link href="/admin/messages/inbox" className="text-xs font-bold uppercase text-red">Inbox →</Link>}>
            {inbound.length === 0 ? <Empty>Inbox is clear.</Empty> : (
              <ul className="space-y-3 text-sm">
                {inbound.map((m) => (
                  <li key={m.id} className="border-b hairline pb-2 last:border-0">
                    <div className="font-bold">{m.user?.name ?? m.from}</div>
                    <div className="text-ink-2">“{m.body}”</div>
                    <div className="text-[11px] text-ink-3">{fmtDate(m.createdAt)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Overdue rink tasks" actions={<Link href="/admin/maintenance" className="text-xs font-bold uppercase text-red">Rink ops →</Link>}>
            {overdue.length === 0 ? <Empty>Nothing overdue.</Empty> : (
              <ul className="space-y-2 text-sm">
                {overdue.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <Link href={`/admin/maintenance/tasks/${t.id}`} className="font-semibold hover:text-red">{t.title}</Link>
                    <span className="text-xs text-ink-3">{t.assignee?.name.split(" ")[0] ?? "Unassigned"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
