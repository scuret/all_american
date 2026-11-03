import Link from "next/link";
import { db } from "@/db";
import { users, refAssignments } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { PageHeader, Card, StatusBadge, Empty, Stat } from "@/components/ui";
import { loadGames } from "@/lib/queries";
import { fmtDate, fmtTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { autoFillUpcoming } from "../games/actions";
import { SubmitButton } from "@/components/submit-button";
import { addDays } from "date-fns";

async function runAutoFill() { "use server"; await autoFillUpcoming(10); }

export default async function RefereesPage() {
  const now = new Date();
  const games = await loadGames({ from: now, to: addDays(now, 14), statuses: ["SCHEDULED"] });
  const refs = await db.query.users.findMany({ where: and(sql`${users.roles} @> ARRAY['REFEREE']::role[]`, eq(users.active, true)), orderBy: (u, { asc }) => [asc(u.name)] });
  const counts = await db.select({ userId: refAssignments.userId, c: sql<number>`count(*)::int` }).from(refAssignments).innerJoin(sql`games g`, sql`g.id = ${refAssignments.gameId}`).where(and(eq(refAssignments.status, "CONFIRMED"), gte(sql`g.starts_at`, now))).groupBy(refAssignments.userId);
  const countMap = new Map(counts.map((c) => [c.userId, c.c]));
  const slots = games.flatMap((g) => g.refs.filter((r) => r.status !== "DECLINED").map((r) => ({ r, g })));
  const needed = slots.filter((s) => s.r.status === "NEEDED");
  const invited = slots.filter((s) => s.r.status === "INVITED");
  const confirmed = slots.filter((s) => s.r.status === "CONFIRMED");
  const label = (g: typeof games[number]) => `${g.awayTeam?.name ?? g.awayTTeam?.name ?? g.awayLabel ?? "TBD"} @ ${g.homeTeam?.name ?? g.homeTTeam?.name ?? g.homeLabel ?? "TBD"}`;

  const table = (rows: typeof slots) => (
    <table className="table"><thead><tr><th>When</th><th>Game</th><th>Role</th><th>Referee</th><th>Status</th><th></th></tr></thead><tbody>
      {rows.map((s) => (
        <tr key={s.r.id}>
          <td className="whitespace-nowrap text-xs font-bold">{fmtDate(s.g.startsAt)}<br /><span className="text-ink-3">{fmtTime(s.g.startsAt)}</span></td>
          <td><Link href={`/admin/games/${s.g.id}`} className="font-bold hover:text-red">{label(s.g)}</Link><div className="text-xs text-ink-3">{s.g.season?.league.name ?? s.g.tournament?.name}</div></td>
          <td className="text-xs">{s.r.role === "HEAD" ? "Head" : "Asst"}</td>
          <td>{s.r.user ? <><div className="font-semibold">{s.r.user.name}</div><div className="text-xs text-ink-3">{formatPhone(s.r.user.phone)}</div></> : <span className="text-ink-3">—</span>}</td>
          <td><StatusBadge status={s.r.status} /></td>
          <td className="text-right"><Link href={`/admin/games/${s.g.id}`} className="btn btn-secondary btn-sm">Manage</Link></td>
        </tr>
      ))}
    </tbody></table>
  );

  return (
    <>
      <PageHeader title="Referee Board" kicker="Next 14 days" actions={<form action={runAutoFill}><SubmitButton pendingText="Sending invites…">⚡ Auto-assign for next 10 days</SubmitButton></form>} />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Open slots" value={needed.length} tone={needed.length ? "red" : "ok"} />
        <Stat label="Waiting on reply" value={invited.length} tone={invited.length ? "warn" : "ok"} />
        <Stat label="Confirmed" value={confirmed.length} tone="ok" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title={`Needs a ref (${needed.length})`}>{needed.length === 0 ? <Empty>Every game has a ref assigned or invited.</Empty> : table(needed)}</Card>
          <Card title={`Waiting on a reply (${invited.length})`}>{invited.length === 0 ? <Empty>No pending invites.</Empty> : table(invited)}</Card>
          <Card title={`Confirmed (${confirmed.length})`}>{confirmed.length === 0 ? <Empty>Nothing confirmed yet.</Empty> : table(confirmed)}</Card>
        </div>
        <Card title={`Referees (${refs.length})`} actions={<Link href="/admin/people/new?role=REFEREE" className="text-xs font-bold uppercase text-red">+ Add</Link>}>
          <p className="mb-3 text-xs text-ink-3">Auto-assign spreads games evenly and never books a ref within 90 minutes of another game.</p>
          <ul className="divide-y hairline text-sm">
            {refs.map((u) => (
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
