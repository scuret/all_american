import Link from "next/link";
import { db } from "@/db";
import { users, goalieAssignments } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { PageHeader, Card, StatusBadge, Empty, Stat } from "@/components/ui";
import { loadGames } from "@/lib/queries";
import { fmtDate, fmtTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { autoFillUpcoming } from "../games/actions";
import { SubmitButton } from "@/components/submit-button";
import { addDays } from "date-fns";

async function runAutoFill() { "use server"; await autoFillUpcoming(10); }

export default async function GoaliesPage() {
  const now = new Date();
  const games = await loadGames({ from: now, to: addDays(now, 14), statuses: ["SCHEDULED"] });
  const pool = await db.query.users.findMany({ where: and(sql`${users.roles} @> ARRAY['GOALIE']::role[]`, eq(users.active, true)), orderBy: (u, { asc }) => [asc(u.name)] });
  const upcomingCounts = await db.select({ userId: goalieAssignments.userId, c: sql<number>`count(*)::int` }).from(goalieAssignments).innerJoin(sql`games g`, sql`g.id = ${goalieAssignments.gameId}`).where(and(eq(goalieAssignments.status, "CONFIRMED"), gte(sql`g.starts_at`, now))).groupBy(goalieAssignments.userId);
  const countMap = new Map(upcomingCounts.map((c) => [c.userId, c.c]));
  const slots = games.flatMap((g) => g.goalies.map((a) => ({ a, g })));
  const needed = slots.filter((s) => s.a.status === "NEEDED" || s.a.status === "DECLINED");
  const invited = slots.filter((s) => s.a.status === "INVITED");
  const confirmed = slots.filter((s) => s.a.status === "CONFIRMED");
  const teamName = (s: typeof slots[number]) => (s.a.teamId === s.g.homeTeamId ? s.g.homeTeam?.name : s.a.teamId === s.g.awayTeamId ? s.g.awayTeam?.name : s.a.tournamentTeamId === s.g.homeTTeamId ? s.g.homeTTeam?.name : s.g.awayTTeam?.name) ?? "Team";
  const opp = (s: typeof slots[number]) => (s.g.homeTeamId === s.a.teamId ? s.g.awayTeam?.name : s.g.homeTeam?.name) ?? s.g.homeTTeam?.name ?? "";

  const row = (s: typeof slots[number]) => (
    <tr key={s.a.id}>
      <td className="whitespace-nowrap text-xs font-bold">{fmtDate(s.g.startsAt)}<br /><span className="text-ink-3">{fmtTime(s.g.startsAt)}</span></td>
      <td><Link href={`/admin/games/${s.g.id}`} className="font-bold hover:text-red">{teamName(s)}</Link><div className="text-xs text-ink-3">vs {opp(s)} · {s.g.season?.league.name ?? s.g.tournament?.name}</div></td>
      <td className="text-xs">{s.a.source === "TEAM" ? "Team goalie" : "Pool"}</td>
      <td>{s.a.user ? <><div className="font-semibold">{s.a.user.name}</div><div className="text-xs text-ink-3">{formatPhone(s.a.user.phone)}</div></> : <span className="text-ink-3">—</span>}</td>
      <td><StatusBadge status={s.a.status} /></td>
      <td className="text-right"><Link href={`/admin/games/${s.g.id}`} className="btn btn-secondary btn-sm">Manage</Link></td>
    </tr>
  );

  return (
    <>
      <PageHeader title="Goalie Board" kicker="Next 14 days" actions={<form action={runAutoFill}><SubmitButton pendingText="Sending invites…">⚡ Auto-invite for next 10 days</SubmitButton></form>} />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Open slots" value={needed.length} tone={needed.length ? "red" : "ok"} />
        <Stat label="Waiting on reply" value={invited.length} tone={invited.length ? "warn" : "ok"} />
        <Stat label="Confirmed" value={confirmed.length} tone="ok" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title={`Needs a goalie (${needed.length})`}>
            {needed.length === 0 ? <Empty>Every game in the next two weeks has a goalie lined up or invited.</Empty> : <table className="table"><thead><tr><th>When</th><th>Team</th><th>Source</th><th>Goalie</th><th>Status</th><th></th></tr></thead><tbody>{needed.map((s) => row(s))}</tbody></table>}
          </Card>
          <Card title={`Waiting on a reply (${invited.length})`}>
            {invited.length === 0 ? <Empty>No pending invites.</Empty> : <table className="table"><thead><tr><th>When</th><th>Team</th><th>Source</th><th>Goalie</th><th>Status</th><th></th></tr></thead><tbody>{invited.map((s) => row(s))}</tbody></table>}
          </Card>
          <Card title={`Confirmed (${confirmed.length})`}>
            {confirmed.length === 0 ? <Empty>Nothing confirmed yet.</Empty> : <table className="table"><thead><tr><th>When</th><th>Team</th><th>Source</th><th>Goalie</th><th>Status</th><th></th></tr></thead><tbody>{confirmed.map((s) => row(s))}</tbody></table>}
          </Card>
        </div>
        <Card title={`Goalie pool (${pool.length})`} actions={<Link href="/admin/people/new?role=GOALIE" className="text-xs font-bold uppercase text-red">+ Add</Link>}>
          <p className="mb-3 text-xs text-ink-3">Auto-fill invites the goalie with the fewest upcoming games who isn&apos;t already booked within 3 hours and hasn&apos;t declined that game.</p>
          <ul className="divide-y hairline text-sm">
            {pool.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-2">
                <div><Link href={`/admin/people/${u.id}`} className="font-semibold hover:text-red">{u.name}</Link><div className="text-xs text-ink-3">{formatPhone(u.phone)}{!u.smsOptIn && " · no SMS"}</div></div>
                <span className="text-xs text-ink-3">{countMap.get(u.id) ?? 0} upcoming</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
