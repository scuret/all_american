import { requireUser } from "@/lib/auth";
import { db } from "@/db";
import { goalieAssignments, refAssignments } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { PageHeader, Card, Empty, StatusBadge } from "@/components/ui";
import { fmtDate, fmtTime } from "@/lib/format";
import { respondGoalieAction, respondRefAction } from "../actions";
import { SubmitButton } from "@/components/submit-button";

export default async function AssignmentsPage() {
  const me = await requireUser();
  const now = new Date(Date.now() - 3 * 3600000);
  const withGame = { game: { with: { homeTeam: true, awayTeam: true, homeTTeam: true, awayTTeam: true, season: { with: { league: true } }, tournament: true } } } as const;
  const [g, r] = await Promise.all([
    db.query.goalieAssignments.findMany({ where: and(eq(goalieAssignments.userId, me.id), inArray(goalieAssignments.status, ["INVITED", "CONFIRMED", "NEEDED"])), with: { ...withGame, team: true, tournamentTeam: true } }),
    db.query.refAssignments.findMany({ where: and(eq(refAssignments.userId, me.id), inArray(refAssignments.status, ["INVITED", "CONFIRMED"])), with: withGame }),
  ]);
  type Item = { id: string; kind: "GOALIE" | "REF"; status: string; game: (typeof g)[number]["game"]; teamName?: string };
  const items: Item[] = [
    ...g.map((x) => ({ id: x.id, kind: "GOALIE" as const, status: x.status, game: x.game, teamName: x.team?.name ?? x.tournamentTeam?.name })),
    ...r.map((x) => ({ id: x.id, kind: "REF" as const, status: x.status, game: x.game })),
  ].filter((x) => x.game.startsAt > now && x.game.status === "SCHEDULED").sort((a, b) => a.game.startsAt.getTime() - b.game.startsAt.getTime());
  const pending = items.filter((x) => x.status === "INVITED" || x.status === "NEEDED");
  const confirmed = items.filter((x) => x.status === "CONFIRMED");
  const label = (x: Item) => `${x.game.awayTeam?.name ?? x.game.awayTTeam?.name ?? x.game.awayLabel ?? "TBD"} @ ${x.game.homeTeam?.name ?? x.game.homeTTeam?.name ?? x.game.homeLabel ?? "TBD"}`;

  const Row = (x: Item) => (
    <div key={x.id} className="rounded-md border hairline p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-red">{fmtDate(x.game.startsAt)} · {fmtTime(x.game.startsAt)}</div>
          <div className="mt-0.5 font-extrabold">{x.kind === "GOALIE" ? `Goalie for ${x.teamName}` : "Referee"}</div>
          <div className="text-xs text-ink-3">{label(x)} · {x.game.season?.league.name ?? x.game.tournament?.name}</div>
        </div>
        <StatusBadge status={x.status === "NEEDED" ? "INVITED" : x.status} />
      </div>
      {x.status !== "CONFIRMED" && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <form action={(x.kind === "GOALIE" ? respondGoalieAction : respondRefAction).bind(null, x.id, true)}><SubmitButton className="btn-ok w-full" pendingText="…">Yes, I&apos;m in</SubmitButton></form>
          <form action={(x.kind === "GOALIE" ? respondGoalieAction : respondRefAction).bind(null, x.id, false)}><SubmitButton className="btn-danger w-full" pendingText="…">Can&apos;t make it</SubmitButton></form>
        </div>
      )}
      {x.status === "CONFIRMED" && <form action={(x.kind === "GOALIE" ? respondGoalieAction : respondRefAction).bind(null, x.id, false)} className="mt-3"><SubmitButton className="btn-ghost btn-sm" confirm="Back out of this game? The rink will look for a replacement.">I can no longer make it</SubmitButton></form>}
    </div>
  );

  return (
    <>
      <PageHeader title="Assignments" kicker="Goalie and referee" />
      {!me.roles.includes("GOALIE") && !me.roles.includes("REFEREE") && items.length === 0 ? <Empty>You&apos;re not in the goalie or referee pool. Ask the rink office if you&apos;d like to be.</Empty> : (
        <div className="space-y-5">
          <Card title={`Needs your answer (${pending.length})`}>{pending.length === 0 ? <Empty>Nothing waiting on you.</Empty> : <div className="space-y-3">{pending.map(Row)}</div>}</Card>
          <Card title={`Confirmed (${confirmed.length})`}>{confirmed.length === 0 ? <Empty>No confirmed games coming up.</Empty> : <div className="space-y-3">{confirmed.map(Row)}</div>}</Card>
        </div>
      )}
    </>
  );
}
