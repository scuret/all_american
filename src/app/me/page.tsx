import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/db";
import { rosterEntries, games, rsvps, goalieAssignments, refAssignments } from "@/db/schema";
import { and, asc, eq, gte, inArray, or, desc } from "drizzle-orm";
import { PageHeader, Card, Empty, Badge, StatusBadge } from "@/components/ui";
import { fmtDate, fmtTime, fmtDateLong } from "@/lib/format";
import { setRsvp } from "./actions";
import { SubmitButton } from "@/components/submit-button";

export default async function MyGames() {
  const me = await requireUser();
  const now = new Date();
  const myRoster = await db.query.rosterEntries.findMany({ where: eq(rosterEntries.userId, me.id), with: { team: { with: { season: { with: { league: true } } } } } });
  const teamIds = myRoster.map((r) => r.teamId);
  const upcoming = teamIds.length ? await db.query.games.findMany({ where: and(gte(games.startsAt, new Date(now.getTime() - 3 * 3600000)), or(inArray(games.homeTeamId, teamIds), inArray(games.awayTeamId, teamIds))), orderBy: [asc(games.startsAt)], limit: 12, with: { homeTeam: true, awayTeam: true, season: { with: { league: true } }, goalies: { with: { user: true } } } }) : [];
  const recent = teamIds.length ? await db.query.games.findMany({ where: and(eq(games.status, "FINAL"), or(inArray(games.homeTeamId, teamIds), inArray(games.awayTeamId, teamIds))), orderBy: [desc(games.startsAt)], limit: 5, with: { homeTeam: true, awayTeam: true } }) : [];
  const myRsvps = upcoming.length ? await db.query.rsvps.findMany({ where: and(eq(rsvps.userId, me.id), inArray(rsvps.gameId, upcoming.map((g) => g.id))) }) : [];
  const rsvpMap = new Map(myRsvps.map((r) => [r.gameId, r.status]));
  const pendingG = await db.select({ id: goalieAssignments.id }).from(goalieAssignments).where(and(eq(goalieAssignments.userId, me.id), eq(goalieAssignments.status, "INVITED")));
  const pendingR = await db.select({ id: refAssignments.id }).from(refAssignments).where(and(eq(refAssignments.userId, me.id), eq(refAssignments.status, "INVITED")));
  const pending = pendingG.length + pendingR.length;
  const first = me.name.split(" ")[0];

  return (
    <>
      <PageHeader kicker={fmtDateLong(now)} title={`Hey ${first}`} />
      {pending > 0 && <Link href="/me/assignments" className="mb-4 flex items-center justify-between rounded-md bg-red px-4 py-3 text-sm font-bold text-white stripe"><span>You have {pending} assignment{pending > 1 ? "s" : ""} waiting on your answer</span><span>→</span></Link>}
      {myRoster.length === 0 && pending === 0 && (me.roles.includes("GOALIE") || me.roles.includes("REFEREE")) && <Card><p className="text-sm">You&apos;re in the rink&apos;s {me.roles.includes("GOALIE") ? "goalie" : "referee"} pool. Invites show up under <Link href="/me/assignments" className="font-bold text-red">Assignments</Link> and by text.</p></Card>}
      {myRoster.length === 0 && !me.roles.includes("GOALIE") && !me.roles.includes("REFEREE") && <Empty>You&apos;re not on a roster yet. Ask your captain or the rink office to add you.</Empty>}

      {upcoming.length > 0 && (
        <Card title="Upcoming games">
          <div className="space-y-3">
            {upcoming.map((g) => {
              const mine = teamIds.includes(g.homeTeamId!) ? g.homeTeam : g.awayTeam;
              const opp = mine?.id === g.homeTeamId ? g.awayTeam : g.homeTeam;
              const r = rsvpMap.get(g.id);
              const myGoalie = g.goalies.find((x) => x.teamId === mine?.id);
              const isPast = g.startsAt < now;
              return (
                <div key={g.id} className="rounded-md border hairline p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-red">{fmtDate(g.startsAt)} · {fmtTime(g.startsAt)}</div>
                      <div className="mt-0.5 text-base font-extrabold">{mine?.name} <span className="font-normal text-ink-3">vs</span> {opp?.name}</div>
                      <div className="text-xs text-ink-3">{g.season?.league.name}{g.week ? ` · Week ${g.week}` : ""}{g.status !== "SCHEDULED" && <> · <StatusBadge status={g.status} /></>}</div>
                      {myGoalie && <div className="mt-1 text-xs">Goalie: {myGoalie.status === "CONFIRMED" ? <span className="font-semibold text-ok">{myGoalie.user?.name} confirmed</span> : myGoalie.status === "INVITED" ? <span className="text-warn">waiting on {myGoalie.user?.name}</span> : <span className="text-red">rink is finding one</span>}</div>}
                    </div>
                    {r && <StatusBadge status={r} />}
                  </div>
                  {!isPast && g.status === "SCHEDULED" && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <form action={setRsvp.bind(null, g.id, "IN")}><SubmitButton className={r === "IN" ? "btn-ok w-full" : "btn-secondary w-full"} pendingText="…">I&apos;m in</SubmitButton></form>
                      <form action={setRsvp.bind(null, g.id, "MAYBE")}><SubmitButton className={r === "MAYBE" ? "btn-primary w-full" : "btn-secondary w-full"} pendingText="…">Maybe</SubmitButton></form>
                      <form action={setRsvp.bind(null, g.id, "OUT")}><SubmitButton className={r === "OUT" ? "btn-danger w-full" : "btn-secondary w-full"} pendingText="…">Out</SubmitButton></form>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {recent.length > 0 && (
        <Card title="Recent results" className="mt-5">
          <ul className="divide-y hairline text-sm">
            {recent.map((g) => {
              const mine = teamIds.includes(g.homeTeamId!) ? "home" : "away";
              const my = mine === "home" ? g.homeScore! : g.awayScore!;
              const their = mine === "home" ? g.awayScore! : g.homeScore!;
              const res = my > their ? "W" : my < their ? "L" : "T";
              return <li key={g.id} className="flex items-center justify-between py-2"><span><Badge tone={res === "W" ? "ok" : res === "L" ? "red" : "gray"}>{res}</Badge> <span className="ml-2 font-semibold">{my}-{their}</span> <span className="text-ink-3">vs {mine === "home" ? g.awayTeam?.name : g.homeTeam?.name}</span></span><span className="text-xs text-ink-3">{fmtDate(g.startsAt)}</span></li>;
            })}
          </ul>
        </Card>
      )}

      {myRoster.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">{myRoster.map((r) => <Link key={r.id} href={`/schedule/${r.team.seasonId}`} className="btn btn-secondary btn-sm">{r.team.season.league.name} schedule & standings</Link>)}</div>
      )}
    </>
  );
}
