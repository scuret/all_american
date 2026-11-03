import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { teams, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { PageHeader, Card, Field, Empty, Badge, StatusBadge } from "@/components/ui";
import { updateTeam, addRosterPlayer, removeRosterPlayer, toggleWaiver, deleteTeam } from "../../leagues/actions";
import { SubmitButton } from "@/components/submit-button";
import { formatPhone } from "@/lib/phone";
import { money } from "@/lib/format";
import { loadGames, toRow } from "@/lib/queries";
import { GameRow } from "@/components/game-row";

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await db.query.teams.findFirst({ where: eq(teams.id, id), with: { season: { with: { league: true } }, captain: true, goalie: true, roster: { with: { user: true }, orderBy: (r, { asc }) => [asc(r.jerseyNumber)] } } });
  if (!team) notFound();
  const poolGoalies = await db.query.users.findMany({ where: sql`${users.roles} @> ARRAY['GOALIE']::role[]`, orderBy: (u, { asc }) => [asc(u.name)] });
  const rosterIds = new Set(team.roster.map((r) => r.userId));
  const goalieOptions = [...team.roster.map((r) => r.user), ...poolGoalies.filter((g) => !rosterIds.has(g.id))];
  const allGames = await loadGames({ seasonId: team.seasonId });
  const myGames = allGames.filter((g) => g.homeTeamId === id || g.awayTeamId === id);

  return (
    <>
      <PageHeader back={{ href: `/admin/seasons/${team.seasonId}`, label: `${team.season.league.name} · ${team.season.name}` }} kicker={team.season.league.name} title={team.name}
        actions={<><Link href={`/admin/messages/new?audience=TEAM&id=${team.id}`} className="btn btn-primary btn-sm">✉ Message team</Link></>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title={`Roster (${team.roster.length})`}>
            {team.roster.length === 0 ? <Empty>No players yet.</Empty> : (
              <table className="table">
                <thead><tr><th>#</th><th>Player</th><th>Pos</th><th>Contact</th><th>Waiver</th><th></th></tr></thead>
                <tbody>
                  {team.roster.map((r) => (
                    <tr key={r.id}>
                      <td className="tabular-nums text-ink-3">{r.jerseyNumber}</td>
                      <td><Link href={`/admin/people/${r.userId}`} className="font-bold hover:text-red">{r.user.name}</Link>{team.captainId === r.userId && <Badge tone="ink">C</Badge>}{team.goalieUserId === r.userId && <Badge tone="info">G</Badge>}</td>
                      <td>{r.position}</td>
                      <td className="text-xs text-ink-3">{formatPhone(r.user.phone)}{r.user.phone && r.user.email ? " · " : ""}{r.user.email}</td>
                      <td>
                        <form action={toggleWaiver.bind(null, team.id, r.userId, !r.waiverSigned)}>
                          <button className={r.waiverSigned ? "badge badge-ok" : "badge badge-red"}>{r.waiverSigned ? "Signed" : "Missing"}</button>
                        </form>
                      </td>
                      <td className="text-right"><form action={removeRosterPlayer.bind(null, team.id, r.userId)}><button className="text-xs text-ink-3 hover:text-red">Remove</button></form></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card title="Add player">
            <form action={addRosterPlayer.bind(null, team.id)} className="grid gap-3 md:grid-cols-3">
              <Field label="Name"><input name="name" className="input" placeholder="Full name" /></Field>
              <Field label="Mobile"><input name="phone" className="input" placeholder="(314) 555-0123" /></Field>
              <Field label="Email"><input name="email" className="input" type="email" /></Field>
              <Field label="Jersey #"><input name="jerseyNumber" className="input" /></Field>
              <Field label="Position"><select name="position" className="select"><option value="F">F</option><option value="D">D</option><option value="G">G</option></select></Field>
              <div className="flex items-end pb-2"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="waiverSigned" className="h-4 w-4" /> Waiver signed</label></div>
              <div className="md:col-span-3"><SubmitButton className="btn-secondary">Add to roster</SubmitButton><span className="ml-3 text-xs text-ink-3">If the phone or email matches an existing person, they&apos;re linked instead of duplicated.</span></div>
            </form>
          </Card>
          <Card title="Games">
            {myGames.map((g) => <GameRow key={g.id} g={toRow(g)} href={`/admin/games/${g.id}`} showDate compact />)}
          </Card>
        </div>
        <div className="space-y-5">
          <Card title="Team settings">
            <form action={updateTeam.bind(null, team.id)} className="space-y-3">
              <Field label="Name"><input name="name" defaultValue={team.name} className="input" required /></Field>
              <Field label="Color"><input name="color" type="color" defaultValue={team.color} className="input h-11 p-1" /></Field>
              <Field label="Captain"><select name="captainId" defaultValue={team.captainId ?? ""} className="select"><option value="">None</option>{team.roster.map((r) => <option key={r.userId} value={r.userId}>{r.user.name}</option>)}</select></Field>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="hasOwnGoalie" defaultChecked={team.hasOwnGoalie} className="h-4 w-4" /> Team brings its own goalie</label>
              <Field label="Team goalie" hint="If unchecked above, the rink's goalie pool fills every game."><select name="goalieUserId" defaultValue={team.goalieUserId ?? ""} className="select"><option value="">Not named yet</option>{goalieOptions.map((u) => <option key={u.id} value={u.id}>{u.name}{rosterIds.has(u.id) ? "" : " (pool)"}</option>)}</select></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Fee status"><select name="feeStatus" defaultValue={team.feeStatus} className="select"><option value="UNPAID">Unpaid</option><option value="DEPOSIT">Deposit</option><option value="PAID">Paid</option><option value="WAIVED">Waived</option></select></Field>
                <Field label="Paid so far ($)"><input name="feePaid" type="number" defaultValue={team.feePaidCents / 100} className="input" /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="isNew" defaultChecked={team.isNew} className="h-4 w-4" /> New team</label>
              <div className="text-xs text-ink-3">Season fee {money(team.season.teamFeeCents)} · deposit {money(team.season.depositCents)} · <StatusBadge status={team.feeStatus} /></div>
              <SubmitButton>Save team</SubmitButton>
            </form>
          </Card>
          <Card title="Danger zone">
            <form action={deleteTeam.bind(null, team.id)}><SubmitButton className="btn-danger btn-sm" confirm={`Delete ${team.name} and all of its games?`}>Delete team</SubmitButton></form>
          </Card>
        </div>
      </div>
    </>
  );
}
