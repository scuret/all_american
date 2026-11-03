import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { games, users, rosterEntries } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { PageHeader, Card, Field, StatusBadge, Badge, Empty } from "@/components/ui";
import { updateGame, assignGoalie, assignRef, addRefSlot, removeRefSlot, repairSlots, messageGame } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { fmtDateLong, fmtTime, fmtInputDateTime, fmtDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await db.query.games.findFirst({
    where: eq(games.id, id),
    with: { homeTeam: { with: { goalie: true } }, awayTeam: { with: { goalie: true } }, homeTTeam: true, awayTTeam: true, season: { with: { league: true } }, tournament: true, pool: true, goalies: { with: { user: true, team: true, tournamentTeam: true } }, refs: { with: { user: true } }, rsvps: { with: { user: true } } },
  });
  if (!g) notFound();
  const home = g.homeTeam?.name ?? g.homeTTeam?.name ?? g.homeLabel ?? "TBD";
  const away = g.awayTeam?.name ?? g.awayTTeam?.name ?? g.awayLabel ?? "TBD";
  const ctx = g.season ? `${g.season.league.name} · ${g.season.name}` : `${g.tournament?.name}${g.pool ? ` · Pool ${g.pool.name}` : g.bracketRound ? ` · Bracket R${g.bracketRound}` : ""}`;
  const backHref = g.seasonId ? `/admin/seasons/${g.seasonId}?tab=schedule` : `/admin/tournaments/${g.tournamentId}`;
  const [poolGoalies, refs] = await Promise.all([
    db.query.users.findMany({ where: sql`${users.roles} @> ARRAY['GOALIE']::role[]`, orderBy: (u, { asc }) => [asc(u.name)] }),
    db.query.users.findMany({ where: sql`${users.roles} @> ARRAY['REFEREE']::role[]`, orderBy: (u, { asc }) => [asc(u.name)] }),
  ]);
  const teamIds = [g.homeTeamId, g.awayTeamId].filter(Boolean) as string[];
  const roster = teamIds.length ? await db.query.rosterEntries.findMany({ where: inArray(rosterEntries.teamId, teamIds), with: { user: true } }) : [];
  const rsvpByUser = new Map(g.rsvps.map((r) => [r.userId, r.status]));
  const rosterFor = (teamId: string | null) => roster.filter((r) => r.teamId === teamId);

  return (
    <>
      <PageHeader back={{ href: backHref, label: ctx }} kicker={`${fmtDateLong(g.startsAt)} · ${fmtTime(g.startsAt)}`} title={`${away} @ ${home}`} actions={<StatusBadge status={g.status} />} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Goalies" actions={<form action={repairSlots.bind(null, g.id)}><button className="text-xs font-bold uppercase text-ink-3 hover:text-red">Repair slots</button></form>}>
            {g.goalies.length === 0 ? <Empty>No goalie slots. Click “Repair slots”.</Empty> : (
              <div className="grid gap-4 md:grid-cols-2">
                {g.goalies.map((a) => {
                  const teamName = a.team?.name ?? a.tournamentTeam?.name ?? "Team";
                  const own = a.team?.hasOwnGoalie;
                  const fullTeam = a.teamId === g.homeTeamId ? g.homeTeam : a.teamId === g.awayTeamId ? g.awayTeam : null;
                  const options = own && fullTeam?.goalie ? [fullTeam.goalie, ...poolGoalies.filter((p) => p.id !== fullTeam.goalieUserId)] : poolGoalies;
                  return (
                    <div key={a.id} className="rounded-md border hairline p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-bold">{teamName}</div>
                        <StatusBadge status={a.status} />
                      </div>
                      <div className="mt-1 text-xs text-ink-3">{own ? "Team brings own goalie" : "Rink pool fills"} · {a.source === "TEAM" ? "team goalie" : "pool"}</div>
                      <div className="mt-2 text-sm">{a.user ? <><span className="font-semibold">{a.user.name}</span> <span className="text-xs text-ink-3">{formatPhone(a.user.phone)}</span></> : <span className="text-red font-semibold">Nobody assigned</span>}</div>
                      {a.invitedAt && <div className="text-[11px] text-ink-3">Invited {fmtDateTime(a.invitedAt)}{a.respondedAt ? ` · responded ${fmtDateTime(a.respondedAt)}` : ""}</div>}
                      {a.declinedUserIds.length > 0 && <div className="text-[11px] text-ink-3">{a.declinedUserIds.length} declined so far</div>}
                      <form action={assignGoalie.bind(null, a.id)} className="mt-3 flex flex-wrap items-end gap-2">
                        <select name="userId" className="select w-full mb-1" defaultValue={a.userId ?? ""}>
                          <option value="">Choose goalie…</option>
                          {options.map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === a.team?.goalieUserId ? " (team)" : ""}</option>)}
                        </select>
                        <button name="mode" value="invite" className="btn btn-primary btn-sm">Invite</button>
                        <button name="mode" value="confirm" className="btn btn-secondary btn-sm">Mark confirmed</button>
                        {!own || a.status === "DECLINED" ? <button name="mode" value="auto" className="btn btn-secondary btn-sm">Auto-fill from pool</button> : null}
                        {a.userId && <button name="mode" value="clear" className="btn btn-ghost btn-sm">Clear</button>}
                      </form>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Referees" actions={<form action={addRefSlot.bind(null, g.id)}><button className="text-xs font-bold uppercase text-red">+ Add ref slot</button></form>}>
            {g.refs.length === 0 ? <Empty>No ref slots.</Empty> : (
              <div className="space-y-3">
                {g.refs.filter((r) => r.status !== "DECLINED").map((r) => (
                  <div key={r.id} className="rounded-md border hairline p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-bold">{r.role === "HEAD" ? "Head referee" : "Assistant referee"}</div>
                      <div className="flex items-center gap-2"><StatusBadge status={r.status} /><form action={removeRefSlot.bind(null, r.id)}><button className="text-xs text-ink-3 hover:text-red">✕</button></form></div>
                    </div>
                    <div className="mt-1 text-sm">{r.user ? <><span className="font-semibold">{r.user.name}</span> <span className="text-xs text-ink-3">{formatPhone(r.user.phone)}</span></> : <span className="text-red font-semibold">Nobody assigned</span>}</div>
                    {r.invitedAt && <div className="text-[11px] text-ink-3">Invited {fmtDateTime(r.invitedAt)}{r.respondedAt ? ` · responded ${fmtDateTime(r.respondedAt)}` : ""}</div>}
                    <form action={assignRef.bind(null, r.id)} className="mt-3 flex flex-wrap items-end gap-2">
                      <select name="userId" className="select w-full mb-1" defaultValue={r.userId ?? ""}><option value="">Choose referee…</option>{refs.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                      <button name="mode" value="invite" className="btn btn-primary btn-sm">Invite</button>
                      <button name="mode" value="confirm" className="btn btn-secondary btn-sm">Mark confirmed</button>
                      <button name="mode" value="auto" className="btn btn-secondary btn-sm">Auto-fill</button>
                      {r.userId && <button name="mode" value="clear" className="btn btn-ghost btn-sm">Clear</button>}
                    </form>
                  </div>
                ))}
                {g.refs.some((r) => r.status === "DECLINED") && <div className="text-xs text-ink-3">Declined: {g.refs.filter((r) => r.status === "DECLINED").map((r) => r.user?.name).join(", ")}</div>}
              </div>
            )}
          </Card>

          {teamIds.length > 0 && (
            <Card title="Player RSVPs">
              <div className="grid gap-4 md:grid-cols-2">
                {[g.awayTeam, g.homeTeam].map((t) => t && (
                  <div key={t.id}>
                    <div className="mb-2 flex items-center justify-between"><Link href={`/admin/teams/${t.id}`} className="font-bold hover:text-red">{t.name}</Link><span className="text-xs text-ink-3">{rosterFor(t.id).filter((r) => rsvpByUser.get(r.userId) === "IN").length} in · {rosterFor(t.id).filter((r) => rsvpByUser.get(r.userId) === "OUT").length} out · {rosterFor(t.id).filter((r) => !rsvpByUser.has(r.userId)).length} no reply</span></div>
                    <ul className="divide-y hairline text-sm">
                      {rosterFor(t.id).map((r) => (
                        <li key={r.id} className="flex items-center justify-between py-1.5"><span>{r.jerseyNumber && <span className="mr-2 text-ink-3 tabular-nums">#{r.jerseyNumber}</span>}{r.user.name}</span>{rsvpByUser.has(r.userId) ? <StatusBadge status={rsvpByUser.get(r.userId)!} /> : <Badge tone="gray">—</Badge>}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title="Score and status">
            <form action={updateGame.bind(null, g.id)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label={away}><input name="awayScore" type="number" min={0} defaultValue={g.awayScore ?? ""} className="input text-center text-2xl font-extrabold" /></Field>
                <Field label={home}><input name="homeScore" type="number" min={0} defaultValue={g.homeScore ?? ""} className="input text-center text-2xl font-extrabold" /></Field>
              </div>
              <Field label="Status"><select name="status" defaultValue={g.status} className="select"><option value="SCHEDULED">Scheduled</option><option value="FINAL">Final</option><option value="POSTPONED">Postponed</option><option value="CANCELED">Canceled</option></select></Field>
              <Field label="Start"><input name="startsAt" type="datetime-local" defaultValue={fmtInputDateTime(g.startsAt)} className="input" /></Field>
              <Field label="Notes"><textarea name="notes" defaultValue={g.notes ?? ""} className="textarea" rows={2} /></Field>
              <SubmitButton>Save</SubmitButton>
            </form>
          </Card>
          {teamIds.length > 0 && (
            <Card title="Message both teams">
              <form action={messageGame.bind(null, g.id)} className="space-y-3">
                <Field label="Channel"><select name="channel" className="select"><option value="SMS">Text (SMS)</option><option value="EMAIL">Email</option></select></Field>
                <Field label="Message"><textarea name="body" className="textarea" rows={3} defaultValue={`Reminder: ${away} vs ${home}, ${fmtDateLong(g.startsAt)} at ${fmtTime(g.startsAt)}. Reply YES if you're in, NO if you're out.`} /></Field>
                <SubmitButton className="btn-secondary">Send to {roster.length} players</SubmitButton>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
