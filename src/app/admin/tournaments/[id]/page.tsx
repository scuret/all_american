import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { tournaments, pools, tournamentTeams } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { PageHeader, Card, StatusBadge, Field, Empty, Tabs, Badge } from "@/components/ui";
import { updateTournament, addTournamentTeam, updateTournamentTeam, removeTournamentTeam, assignPools, generateTournamentGames, advanceBracket } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { fmtDate, money, fmtYmd } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { loadGames, toRow } from "@/lib/queries";
import { GameRow } from "@/components/game-row";
import { Bracket } from "@/components/bracket";
import { computeStandings } from "@/lib/schedule";

export default async function TournamentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = "teams" } = await searchParams;
  const t = await db.query.tournaments.findFirst({ where: eq(tournaments.id, id), with: { teams: { orderBy: [asc(tournamentTeams.createdAt)] }, pools: { orderBy: [asc(pools.sortOrder)] } } });
  if (!t) notFound();
  const games = await loadGames({ tournamentId: id });
  const base = `/admin/tournaments/${id}`;
  const approved = t.teams.filter((x) => x.approved);
  const pending = t.teams.filter((x) => !x.approved);
  const teamName = (tid: string | null) => t.teams.find((x) => x.id === tid)?.name;
  const bracketGames = games.filter((g) => g.bracketRound).map((g) => ({ id: g.id, bracketRound: g.bracketRound!, bracketSlot: g.bracketSlot!, homeName: g.homeTTeam?.name ?? g.homeLabel ?? "TBD", awayName: g.awayTTeam?.name ?? g.awayLabel ?? "TBD", homeScore: g.homeScore, awayScore: g.awayScore, status: g.status, startsAt: g.startsAt }));

  return (
    <>
      <PageHeader back={{ href: "/admin/tournaments", label: "Tournaments" }} kicker={`${t.division ?? ""} · ${fmtDate(t.startDate)} to ${fmtDate(t.endDate)}`} title={t.name}
        actions={<><StatusBadge status={t.status} /><Link href={`/tournaments/${t.id}`} target="_blank" className="btn btn-secondary btn-sm">Public page ↗</Link><Link href={`/admin/messages/new?audience=TOURNAMENT&id=${t.id}`} className="btn btn-primary btn-sm">✉ Message teams</Link></>} />
      <Tabs items={[
        { href: `${base}?tab=teams`, label: `Teams (${approved.length}/${t.maxTeams})`, active: tab === "teams", count: pending.length },
        { href: `${base}?tab=pools`, label: "Pools", active: tab === "pools" },
        { href: `${base}?tab=schedule`, label: `Schedule (${games.length})`, active: tab === "schedule" },
        { href: `${base}?tab=bracket`, label: "Bracket", active: tab === "bracket" },
        { href: `${base}?tab=settings`, label: "Settings", active: tab === "settings" },
      ]} />

      {tab === "teams" && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            {pending.length > 0 && (
              <Card title={`Pending approval (${pending.length})`}>
                {pending.map((team) => <TeamEditor key={team.id} team={team} pools={t.pools} />)}
              </Card>
            )}
            <Card title={`Registered teams (${approved.length})`}>
              {approved.length === 0 ? <Empty>No approved teams yet.</Empty> : approved.map((team) => <TeamEditor key={team.id} team={team} pools={t.pools} />)}
            </Card>
          </div>
          <Card title="Add a team manually">
            <form action={addTournamentTeam.bind(null, t.id)} className="space-y-3">
              <Field label="Team name"><input name="name" className="input" required /></Field>
              <Field label="Contact name"><input name="contactName" className="input" required /></Field>
              <Field label="Contact mobile"><input name="contactPhone" className="input" /></Field>
              <Field label="Contact email"><input name="contactEmail" type="email" className="input" /></Field>
              <Field label="Roster (one per line)"><textarea name="roster" className="textarea" rows={4} /></Field>
              <SubmitButton>Add team</SubmitButton>
            </form>
          </Card>
        </div>
      )}

      {tab === "pools" && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            {t.pools.length === 0 ? <Empty>No pools yet. Assign pools to the right.</Empty> : (
              <div className="grid gap-4 md:grid-cols-2">
                {t.pools.map((p) => {
                  const ids = approved.filter((x) => x.poolId === p.id).map((x) => x.id);
                  const rows = computeStandings(ids, games.filter((g) => g.poolId === p.id).map((g) => ({ homeTeamId: g.homeTTeamId, awayTeamId: g.awayTTeamId, homeScore: g.homeScore, awayScore: g.awayScore, status: g.status })));
                  return (
                    <Card key={p.id} title={`Pool ${p.name}`}>
                      <table className="table"><thead><tr><th>#</th><th>Team</th><th className="text-right">W-L-T</th><th className="text-right">GF/GA</th><th className="text-right">PTS</th></tr></thead><tbody>
                        {rows.map((r, i) => <tr key={r.teamId}><td className="text-ink-3">{i + 1}</td><td className="font-bold">{teamName(r.teamId)}</td><td className="text-right tabular-nums">{r.w}-{r.l}-{r.t}</td><td className="text-right tabular-nums">{r.gf}/{r.ga}</td><td className="text-right font-bold tabular-nums">{r.pts}</td></tr>)}
                      </tbody></table>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
          <Card title="Pool setup">
            <p className="mb-3 text-sm text-ink-3">Creates {t.poolCount} pools and snake-seeds the {approved.length} approved teams by seed number (or registration order). You can move teams between pools on the Teams tab afterwards.</p>
            <form action={assignPools.bind(null, t.id)}><SubmitButton confirm={t.pools.length ? "Re-assign all pools?" : undefined}>{t.pools.length ? "Re-assign pools" : "Assign pools"}</SubmitButton></form>
          </Card>
        </div>
      )}

      {tab === "schedule" && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Games" className="lg:col-span-2">
            {games.length === 0 ? <Empty>No games yet. Generate them to the right.</Empty> : games.map((g) => <GameRow key={g.id} g={{ ...toRow(g), context: g.pool ? `Pool ${g.pool.name}` : g.bracketRound ? `Bracket R${g.bracketRound}` : "" }} href={`/admin/games/${g.id}`} showDate />)}
          </Card>
          <div className="space-y-5">
            <Card title="Generate games">
              <p className="mb-3 text-sm text-ink-3">{t.format === "POOL_TO_BRACKET" ? `Pool round robin for every pool, then a ${t.bracketSize}-team bracket with placeholders, laid across ${t.timeSlots.length} slots per day from ${fmtDate(t.startDate)} to ${fmtDate(t.endDate)}.` : "Full round robin among approved teams across the tournament slots."}</p>
              <form action={generateTournamentGames.bind(null, t.id)}><SubmitButton confirm={games.length ? "Replace all unplayed games?" : undefined}>{games.length ? "Regenerate" : "Generate games"}</SubmitButton></form>
            </Card>
            {t.format === "POOL_TO_BRACKET" && bracketGames.length > 0 && (
              <Card title="Advance bracket">
                <p className="mb-3 text-sm text-ink-3">Fills bracket slots from pool standings and from completed bracket games. Run after entering scores.</p>
                <form action={advanceBracket.bind(null, t.id)}><SubmitButton className="btn-secondary">Advance bracket</SubmitButton></form>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === "bracket" && (
        <Card title="Bracket">
          {bracketGames.length === 0 ? <Empty>{t.format === "ROUND_ROBIN" ? "Round-robin tournaments have no bracket; standings decide the winner." : "Generate games first."}</Empty> : <Bracket games={bracketGames} hrefFor={(gid) => `/admin/games/${gid}`} />}
        </Card>
      )}

      {tab === "settings" && (
        <Card title="Tournament settings">
          <form action={updateTournament.bind(null, t.id)} className="grid gap-3 md:grid-cols-2">
            <Field label="Name"><input name="name" defaultValue={t.name} className="input" required /></Field>
            <Field label="Division"><input name="division" defaultValue={t.division ?? ""} className="input" /></Field>
            <Field label="Format"><select name="format" defaultValue={t.format} className="select"><option value="POOL_TO_BRACKET">Pool play → single elimination</option><option value="ROUND_ROBIN">Round robin</option></select></Field>
            <Field label="Status"><select name="status" defaultValue={t.status} className="select">{["DRAFT", "REGISTRATION", "POOL_PLAY", "BRACKET", "COMPLETE"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select></Field>
            <Field label="Start"><input name="startDate" type="date" defaultValue={fmtYmd(t.startDate)} className="input" /></Field>
            <Field label="End"><input name="endDate" type="date" defaultValue={fmtYmd(t.endDate)} className="input" /></Field>
            <Field label="Time slots per day"><input name="timeSlots" defaultValue={t.timeSlots.join(", ")} className="input" /></Field>
            <Field label="Game minutes"><input name="gameMinutes" type="number" defaultValue={t.gameMinutes} className="input" /></Field>
            <Field label="Entry fee ($)"><input name="entryFee" type="number" defaultValue={t.entryFeeCents / 100} className="input" /></Field>
            <Field label="Max teams"><input name="maxTeams" type="number" defaultValue={t.maxTeams} className="input" /></Field>
            <Field label="Pools"><input name="poolCount" type="number" defaultValue={t.poolCount} className="input" /></Field>
            <Field label="Bracket size"><select name="bracketSize" defaultValue={t.bracketSize} className="select"><option value={2}>2</option><option value={4}>4</option><option value={8}>8</option></select></Field>
            <Field label="Description"><textarea name="description" defaultValue={t.description ?? ""} className="textarea" rows={3} /></Field>
            <div className="flex items-end pb-3"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="registrationOpen" defaultChecked={t.registrationOpen} className="h-4 w-4" /> Registration open</label></div>
            <div className="md:col-span-2"><SubmitButton>Save</SubmitButton></div>
          </form>
        </Card>
      )}
    </>
  );
}

function TeamEditor({ team, pools }: { team: typeof tournamentTeams.$inferSelect; pools: (typeof import("@/db/schema").pools.$inferSelect)[] }) {
  return (
    <details className="group border-b hairline py-3 last:border-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div><span className="font-bold">{team.name}</span>{!team.approved && <Badge tone="warn">pending</Badge>}<div className="text-xs text-ink-3">{team.contactName} · {formatPhone(team.contactPhone)} {team.contactEmail}</div></div>
        <div className="flex items-center gap-2 text-xs">{team.poolId && <Badge tone="info">Pool {pools.find((p) => p.id === team.poolId)?.name}</Badge>}{team.seed && <span className="text-ink-3">#{team.seed}</span>}<StatusBadge status={team.feeStatus} /><span className="text-ink-3 group-open:rotate-180">▾</span></div>
      </summary>
      <form action={updateTournamentTeam.bind(null, team.id)} className="mt-3 grid gap-3 md:grid-cols-3">
        <Field label="Team"><input name="name" defaultValue={team.name} className="input" /></Field>
        <Field label="Contact"><input name="contactName" defaultValue={team.contactName} className="input" /></Field>
        <Field label="Mobile"><input name="contactPhone" defaultValue={formatPhone(team.contactPhone)} className="input" /></Field>
        <Field label="Email"><input name="contactEmail" defaultValue={team.contactEmail ?? ""} className="input" /></Field>
        <Field label="Pool"><select name="poolId" defaultValue={team.poolId ?? ""} className="select"><option value="">—</option>{pools.map((p) => <option key={p.id} value={p.id}>Pool {p.name}</option>)}</select></Field>
        <Field label="Seed"><input name="seed" type="number" defaultValue={team.seed ?? ""} className="input" /></Field>
        <Field label="Fee"><select name="feeStatus" defaultValue={team.feeStatus} className="select"><option value="UNPAID">Unpaid</option><option value="DEPOSIT">Deposit</option><option value="PAID">Paid</option><option value="WAIVED">Waived</option></select></Field>
        <div className="md:col-span-2"><Field label="Roster"><textarea name="roster" defaultValue={team.roster ?? ""} className="textarea" rows={3} /></Field></div>
        <div className="flex items-center gap-4 md:col-span-3">
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="approved" defaultChecked={team.approved} className="h-4 w-4" /> Approved</label>
          <SubmitButton className="btn-secondary btn-sm">Save</SubmitButton>
          <button formAction={removeTournamentTeam.bind(null, team.id)} className="text-xs text-ink-3 hover:text-red">Remove</button>
        </div>
      </form>
    </details>
  );
}
