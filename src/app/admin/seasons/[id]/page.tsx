import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { seasons } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader, Card, StatusBadge, Field, Empty, Tabs, Badge } from "@/components/ui";
import { DAY_NAMES, computeStandings } from "@/lib/schedule";
import { createTeam, generateSchedule, updateSeason, addGame, clearSchedule } from "../../leagues/actions";
import { SubmitButton } from "@/components/submit-button";
import { fmtDate, fmtInputDateTime, money, fmtYmd } from "@/lib/format";
import { loadGames, toRow } from "@/lib/queries";
import { GameRow } from "@/components/game-row";

export default async function SeasonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = "teams" } = await searchParams;
  const season = await db.query.seasons.findFirst({ where: eq(seasons.id, id), with: { league: true, teams: { with: { captain: true, goalie: true, roster: true }, orderBy: (t, { asc }) => [asc(t.name)] } } });
  if (!season) notFound();
  const games = await loadGames({ seasonId: id });
  const standings = computeStandings(season.teams.map((t) => t.id), games);
  const teamById = new Map(season.teams.map((t) => [t.id, t]));
  const base = `/admin/seasons/${id}`;
  const unplayed = games.filter((g) => g.status === "SCHEDULED").length;
  const played = games.filter((g) => g.status === "FINAL").length;

  return (
    <>
      <PageHeader back={{ href: `/admin/leagues/${season.leagueId}`, label: season.league.name }} kicker={`${DAY_NAMES[season.league.dayOfWeek]}s · ${season.league.skillLevel ?? ""}`} title={`${season.league.name} · ${season.name}`}
        actions={<><StatusBadge status={season.status} /><Link href={`/schedule/${season.id}`} className="btn btn-secondary btn-sm" target="_blank">Public page ↗</Link><Link href={`/admin/messages/new?audience=SEASON&id=${season.id}`} className="btn btn-primary btn-sm">✉ Message this league</Link></>} />
      <Tabs items={[
        { href: `${base}?tab=teams`, label: `Teams (${season.teams.length})`, active: tab === "teams" },
        { href: `${base}?tab=schedule`, label: `Schedule (${games.length})`, active: tab === "schedule" },
        { href: `${base}?tab=standings`, label: "Standings", active: tab === "standings" },
        { href: `${base}?tab=settings`, label: "Settings", active: tab === "settings" },
      ]} />

      {tab === "teams" && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Teams" className="lg:col-span-2">
            {season.teams.length === 0 ? <Empty>No teams yet. Add teams, then generate the schedule.</Empty> : (
              <table className="table">
                <thead><tr><th>Team</th><th>Captain</th><th>Goalie</th><th>Roster</th><th>Fee</th></tr></thead>
                <tbody>
                  {season.teams.map((t) => (
                    <tr key={t.id}>
                      <td><Link href={`/admin/teams/${t.id}`} className="flex items-center gap-2 font-bold hover:text-red"><span className="h-3 w-3 rounded-sm" style={{ background: t.color }} />{t.name}{t.isNew && <Badge tone="info">new</Badge>}</Link></td>
                      <td>{t.captain?.name ?? <span className="text-ink-3">none</span>}</td>
                      <td>{t.hasOwnGoalie ? t.goalie?.name ?? <Badge tone="warn">own, unnamed</Badge> : <Badge tone="red">rink fills</Badge>}</td>
                      <td className="tabular-nums">{t.roster.length} <span className="text-ink-3">({t.roster.filter((r) => r.waiverSigned).length} waivers)</span></td>
                      <td><StatusBadge status={t.feeStatus} />{season.teamFeeCents > 0 && t.feeStatus !== "WAIVED" && <span className="ml-1 text-xs text-ink-3">{money(t.feePaidCents)} / {money(season.teamFeeCents)}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card title="Add a team">
            <form action={createTeam.bind(null, season.id)} className="space-y-3">
              <Field label="Team name"><input name="name" className="input" required /></Field>
              <Field label="Color"><input name="color" type="color" defaultValue="#B00000" className="input h-11 p-1" /></Field>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="isNew" className="h-4 w-4" /> New team (deposit required)</label>
              <SubmitButton>Add team</SubmitButton>
            </form>
          </Card>
        </div>
      )}

      {tab === "schedule" && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Games" className="lg:col-span-2" actions={played > 0 ? <span className="text-xs text-ink-3">{played} played · {unplayed} to play</span> : null}>
            {games.length === 0 ? <Empty>No games yet. Generate the schedule to the right.</Empty> : games.map((g) => <GameRow key={g.id} g={toRow(g)} href={`/admin/games/${g.id}`} showDate />)}
          </Card>
          <div className="space-y-5">
            <Card title="Generate schedule">
              <p className="mb-3 text-sm text-ink-3">Round robin across {season.teams.length} teams, {season.gamesPerTeam} games each, on {DAY_NAMES[season.league.dayOfWeek]} nights at {season.timeSlots.join(", ")}. Skips blackout dates and rink blocks.</p>
              <form action={generateSchedule.bind(null, season.id)} className="space-y-3">
                {played > 0 && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="replaceAll" className="h-4 w-4" /> Replace played games too</label>}
                <SubmitButton confirm={games.length ? "This replaces all unplayed games and their goalie/ref assignments. Continue?" : undefined}>{games.length ? "Regenerate unplayed games" : "Generate schedule"}</SubmitButton>
              </form>
              {unplayed > 0 && <form action={clearSchedule.bind(null, season.id)} className="mt-2"><SubmitButton className="btn-danger btn-sm" confirm="Delete all unplayed games?">Clear unplayed games</SubmitButton></form>}
            </Card>
            <Card title="Add a single game">
              <form action={addGame.bind(null, season.id)} className="space-y-3">
                <Field label="Away"><select name="awayTeamId" className="select">{season.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
                <Field label="Home"><select name="homeTeamId" className="select" defaultValue={season.teams[1]?.id}>{season.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
                <Field label="Start"><input name="startsAt" type="datetime-local" className="input" defaultValue={fmtInputDateTime(new Date())} required /></Field>
                <Field label="Week #"><input name="week" type="number" className="input" /></Field>
                <SubmitButton className="btn-secondary">Add game</SubmitButton>
              </form>
            </Card>
          </div>
        </div>
      )}

      {tab === "standings" && (
        <Card title="Standings">
          <table className="table">
            <thead><tr><th>#</th><th>Team</th><th className="text-right">GP</th><th className="text-right">W</th><th className="text-right">L</th><th className="text-right">T</th><th className="text-right">GF</th><th className="text-right">GA</th><th className="text-right">+/-</th><th className="text-right">PTS</th></tr></thead>
            <tbody>
              {standings.map((r, i) => { const t = teamById.get(r.teamId)!; return (
                <tr key={r.teamId}>
                  <td className="text-ink-3">{i + 1}</td>
                  <td><Link href={`/admin/teams/${t.id}`} className="flex items-center gap-2 font-bold hover:text-red"><span className="h-3 w-3 rounded-sm" style={{ background: t.color }} />{t.name}</Link></td>
                  <td className="text-right tabular-nums">{r.gp}</td><td className="text-right tabular-nums">{r.w}</td><td className="text-right tabular-nums">{r.l}</td><td className="text-right tabular-nums">{r.t}</td><td className="text-right tabular-nums">{r.gf}</td><td className="text-right tabular-nums">{r.ga}</td><td className="text-right tabular-nums">{r.gf - r.ga > 0 ? "+" : ""}{r.gf - r.ga}</td><td className="text-right font-bold tabular-nums">{r.pts}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "settings" && (
        <Card title="Season settings">
          <form action={updateSeason.bind(null, season.id)} className="grid gap-3 md:grid-cols-2">
            <Field label="Season name"><input name="name" defaultValue={season.name} className="input" required /></Field>
            <Field label="Status"><select name="status" defaultValue={season.status} className="select"><option value="DRAFT">Draft</option><option value="REGISTRATION">Registration open</option><option value="ACTIVE">Active</option><option value="COMPLETE">Complete</option></select></Field>
            <Field label="First game night"><input name="startDate" type="date" defaultValue={fmtYmd(season.startDate)} className="input" required /></Field>
            <Field label="Games per team"><input name="gamesPerTeam" type="number" defaultValue={season.gamesPerTeam} className="input" /></Field>
            <Field label="Time slots"><input name="timeSlots" defaultValue={season.timeSlots.join(", ")} className="input" /></Field>
            <Field label="Game length (min)"><input name="gameMinutes" type="number" defaultValue={season.gameMinutes} className="input" /></Field>
            <Field label="Team fee ($)"><input name="teamFee" type="number" defaultValue={season.teamFeeCents / 100} className="input" /></Field>
            <Field label="New-team deposit ($)"><input name="deposit" type="number" defaultValue={season.depositCents / 100} className="input" /></Field>
            <Field label="Refs per game"><input name="refsPerGame" type="number" defaultValue={season.refsPerGame} className="input" /></Field>
            <Field label="Blackout dates"><input name="blackoutDates" defaultValue={season.blackoutDates.join(", ")} className="input" /></Field>
            <div className="md:col-span-2"><SubmitButton>Save season</SubmitButton></div>
          </form>
          <p className="mt-3 text-xs text-ink-3">Season started {fmtDate(season.startDate)}. Changing slots or start date doesn&apos;t move existing games; regenerate from the Schedule tab.</p>
        </Card>
      )}
    </>
  );
}
