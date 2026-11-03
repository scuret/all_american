import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/shell";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { tournaments, pools } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { PageHeader, Card, Empty, StatusBadge } from "@/components/ui";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { loadGames } from "@/lib/queries";
import { Bracket } from "@/components/bracket";
import { computeStandings } from "@/lib/schedule";

export default async function TournamentPublic({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ registered?: string; closed?: string; full?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  const t = await db.query.tournaments.findFirst({ where: eq(tournaments.id, id), with: { teams: true, pools: { orderBy: [asc(pools.sortOrder)] } } });
  if (!t || t.status === "DRAFT") notFound();
  const games = await loadGames({ tournamentId: id });
  const approved = t.teams.filter((x) => x.approved);
  const name = (tid: string | null) => t.teams.find((x) => x.id === tid)?.name;
  const bracket = games.filter((g) => g.bracketRound).map((g) => ({ id: g.id, bracketRound: g.bracketRound!, bracketSlot: g.bracketSlot!, homeName: g.homeTTeam?.name ?? g.homeLabel ?? "TBD", awayName: g.awayTTeam?.name ?? g.awayLabel ?? "TBD", homeScore: g.homeScore, awayScore: g.awayScore, status: g.status, startsAt: g.startsAt }));
  return (
    <PublicShell user={user}>
      <PageHeader back={{ href: "/tournaments", label: "Tournaments" }} kicker={`${t.division ?? ""} · ${fmtDate(t.startDate)} to ${fmtDate(t.endDate)}`} title={t.name} actions={<StatusBadge status={t.status} />} />
      {sp.registered && <div className="mb-4 rounded-md bg-[#e3f4e8] p-4 text-sm font-semibold text-ok">Thanks! Your team is registered and pending approval. The rink will contact you about payment ({money(t.entryFeeCents)}).</div>}
      {sp.closed && <div className="mb-4 rounded-md bg-[#fde8e8] p-4 text-sm font-semibold text-red">Registration is closed for this tournament.</div>}
      {sp.full && <div className="mb-4 rounded-md bg-[#fde8e8] p-4 text-sm font-semibold text-red">This tournament is full. Call the rink to get on the wait list.</div>}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {t.description && <Card><p className="text-sm">{t.description}</p><div className="mt-3 text-sm text-ink-3">{money(t.entryFeeCents)} per team · {approved.length} of {t.maxTeams} spots filled</div>{t.registrationOpen && t.teams.length < t.maxTeams && <Link href={`/tournaments/${t.id}/register`} className="btn btn-primary mt-3">Register a team</Link>}</Card>}
          {t.pools.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {t.pools.map((p) => {
                const ids = approved.filter((x) => x.poolId === p.id).map((x) => x.id);
                const rows = computeStandings(ids, games.filter((g) => g.poolId === p.id).map((g) => ({ homeTeamId: g.homeTTeamId, awayTeamId: g.awayTTeamId, homeScore: g.homeScore, awayScore: g.awayScore, status: g.status })));
                return <Card key={p.id} title={`Pool ${p.name}`}><table className="table"><thead><tr><th>Team</th><th className="text-right">W-L-T</th><th className="text-right">PTS</th></tr></thead><tbody>{rows.map((r) => <tr key={r.teamId}><td className="font-bold">{name(r.teamId)}</td><td className="text-right tabular-nums">{r.w}-{r.l}-{r.t}</td><td className="text-right font-bold tabular-nums">{r.pts}</td></tr>)}</tbody></table></Card>;
              })}
            </div>
          )}
          {bracket.length > 0 && <Card title="Bracket"><Bracket games={bracket} /></Card>}
          <Card title="Schedule">
            {games.length === 0 ? <Empty>Schedule will be posted after registration closes.</Empty> : (
              <table className="table"><tbody>{games.map((g) => { const final = g.status === "FINAL"; return <tr key={g.id}><td className="w-36 text-xs font-bold text-ink-3">{fmtDateTime(g.startsAt)}</td><td className="text-xs text-ink-3">{g.pool ? `Pool ${g.pool.name}` : `Bracket`}</td><td className="font-semibold">{g.awayTTeam?.name ?? g.awayLabel}</td><td className="w-8 text-right tabular-nums font-bold">{final ? g.awayScore : ""}</td><td className="w-6 text-center text-xs text-ink-3">{final ? "-" : "vs"}</td><td className="w-8 tabular-nums font-bold">{final ? g.homeScore : ""}</td><td className="font-semibold">{g.homeTTeam?.name ?? g.homeLabel}</td></tr>; })}</tbody></table>
            )}
          </Card>
        </div>
        <Card title={`Teams (${approved.length})`}>
          {approved.length === 0 ? <Empty>No teams yet.</Empty> : <ul className="divide-y hairline text-sm">{approved.map((x) => <li key={x.id} className="py-2 font-semibold">{x.name}{x.poolId && <span className="ml-2 text-xs font-normal text-ink-3">Pool {t.pools.find((p) => p.id === x.poolId)?.name}</span>}</li>)}</ul>}
        </Card>
      </div>
    </PublicShell>
  );
}
