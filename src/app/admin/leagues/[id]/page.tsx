import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { leagues } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader, Card, StatusBadge, Field } from "@/components/ui";
import { DAY_NAMES } from "@/lib/schedule";
import { createSeason, updateLeague } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { fmtDate, fmtYmd, money } from "@/lib/format";

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const league = await db.query.leagues.findFirst({ where: eq(leagues.id, id), with: { seasons: { with: { teams: true, games: true }, orderBy: (s, { desc }) => [desc(s.startDate)] } } });
  if (!league) notFound();
  const last = league.seasons[0];
  const isAdult = league.type === "ADULT";
  return (
    <>
      <PageHeader back={{ href: "/admin/leagues", label: "Leagues" }} kicker={`${DAY_NAMES[league.dayOfWeek]}s · ${league.skillLevel ?? league.type}`} title={league.name} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Seasons">
            {league.seasons.length === 0 ? <p className="text-sm text-ink-3">No seasons yet. Create one to the right.</p> : (
              <table className="table">
                <thead><tr><th>Season</th><th>Starts</th><th>Teams</th><th>Games</th><th>Fee</th><th>Status</th></tr></thead>
                <tbody>
                  {league.seasons.map((s) => (
                    <tr key={s.id}>
                      <td><Link href={`/admin/seasons/${s.id}`} className="font-bold hover:text-red">{s.name}</Link></td>
                      <td>{fmtDate(s.startDate)}</td>
                      <td>{s.teams.length}</td>
                      <td>{s.games.length}</td>
                      <td>{money(s.teamFeeCents)}</td>
                      <td><StatusBadge status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card title="League settings">
            <form action={updateLeague.bind(null, league.id)} className="grid gap-3 md:grid-cols-2">
              <Field label="Name"><input name="name" defaultValue={league.name} className="input" required /></Field>
              <Field label="Level / division"><input name="skillLevel" defaultValue={league.skillLevel ?? ""} className="input" /></Field>
              <Field label="Type"><select name="type" defaultValue={league.type} className="select"><option value="ADULT">Adult</option><option value="YOUTH">Youth</option></select></Field>
              <Field label="Night"><select name="dayOfWeek" defaultValue={league.dayOfWeek} className="select">{DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></Field>
              <Field label="Description"><textarea name="description" defaultValue={league.description ?? ""} className="textarea" rows={2} /></Field>
              <div className="flex flex-col gap-3">
                <Field label="Sort order"><input name="sortOrder" type="number" defaultValue={league.sortOrder} className="input" /></Field>
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="active" defaultChecked={league.active} className="h-4 w-4" /> Active (shown on the public site)</label>
              </div>
              <div className="md:col-span-2"><SubmitButton className="btn-secondary">Save settings</SubmitButton></div>
            </form>
          </Card>
        </div>
        <Card title="New season">
          <form action={createSeason.bind(null, league.id)} className="space-y-3">
            <Field label="Season name"><input name="name" className="input" placeholder="Spring 2027" required /></Field>
            <Field label="First game night" hint={`Will snap forward to the next ${DAY_NAMES[league.dayOfWeek]}.`}><input name="startDate" type="date" className="input" required defaultValue={fmtYmd(new Date())} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Games per team"><input name="gamesPerTeam" type="number" defaultValue={last?.gamesPerTeam ?? (isAdult ? 10 : 8)} className="input" /></Field>
              <Field label="Game length (min)"><input name="gameMinutes" type="number" defaultValue={last?.gameMinutes ?? (isAdult ? 75 : 60)} className="input" /></Field>
            </div>
            <Field label="Time slots" hint="Local rink time, comma separated. One game per slot per night."><input name="timeSlots" defaultValue={(last?.timeSlots ?? (isAdult ? ["19:00", "20:15", "21:30"] : ["09:00", "10:15", "11:30"])).join(", ")} className="input" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Team fee ($)"><input name="teamFee" type="number" step="1" defaultValue={last ? last.teamFeeCents / 100 : isAdult ? 1250 : 0} className="input" /></Field>
              <Field label="New-team deposit ($)"><input name="deposit" type="number" step="1" defaultValue={last ? last.depositCents / 100 : isAdult ? 600 : 0} className="input" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Refs per game"><input name="refsPerGame" type="number" defaultValue={last?.refsPerGame ?? 1} className="input" /></Field>
            </div>
            <Field label="Blackout dates" hint="YYYY-MM-DD, comma separated. Holidays, closures."><input name="blackoutDates" defaultValue={(last?.blackoutDates ?? []).join(", ")} className="input" /></Field>
            <SubmitButton>Create season</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
