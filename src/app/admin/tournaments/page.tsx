import Link from "next/link";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader, Card, StatusBadge, Field, Empty } from "@/components/ui";
import { createTournament } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { fmtDate, money, fmtYmd } from "@/lib/format";
import { addDays } from "date-fns";

export default async function TournamentsPage() {
  const list = await db.query.tournaments.findMany({ orderBy: [desc(tournaments.startDate)], with: { teams: true, games: true } });
  return (
    <>
      <PageHeader title="Tournaments" kicker="Pool play, brackets, team registration" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="All tournaments" className="lg:col-span-2">
          {list.length === 0 ? <Empty>No tournaments yet.</Empty> : (
            <table className="table">
              <thead><tr><th>Tournament</th><th>Dates</th><th>Format</th><th>Teams</th><th>Fee</th><th>Status</th></tr></thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id}>
                    <td><Link href={`/admin/tournaments/${t.id}`} className="font-bold hover:text-red">{t.name}</Link><div className="text-xs text-ink-3">{t.division}</div></td>
                    <td className="text-xs">{fmtDate(t.startDate)} to {fmtDate(t.endDate)}</td>
                    <td className="text-xs">{t.format === "POOL_TO_BRACKET" ? `${t.poolCount} pools → ${t.bracketSize}-team bracket` : "Round robin"}</td>
                    <td className="tabular-nums">{t.teams.filter((x) => x.approved).length}/{t.maxTeams}{t.teams.some((x) => !x.approved) && <span className="ml-1 badge badge-warn">{t.teams.filter((x) => !x.approved).length} pending</span>}</td>
                    <td>{money(t.entryFeeCents)}</td>
                    <td><StatusBadge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="New tournament">
          <form action={createTournament} className="space-y-3">
            <Field label="Name"><input name="name" className="input" required /></Field>
            <Field label="Division"><input name="division" className="input" placeholder="Adult B/C, 12U…" /></Field>
            <Field label="Format"><select name="format" className="select"><option value="POOL_TO_BRACKET">Pool play → single elimination</option><option value="ROUND_ROBIN">Round robin (standings decide)</option></select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start"><input name="startDate" type="date" className="input" defaultValue={fmtYmd(addDays(new Date(), 30))} required /></Field>
              <Field label="End"><input name="endDate" type="date" className="input" defaultValue={fmtYmd(addDays(new Date(), 31))} required /></Field>
            </div>
            <Field label="Time slots per day"><input name="timeSlots" className="input" defaultValue="08:00, 09:15, 10:30, 11:45, 13:00, 14:15, 15:30, 16:45, 18:00" /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Game min"><input name="gameMinutes" type="number" defaultValue={60} className="input" /></Field>
              <Field label="Max teams"><input name="maxTeams" type="number" defaultValue={8} className="input" /></Field>
              <Field label="Entry fee $"><input name="entryFee" type="number" defaultValue={450} className="input" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pools"><input name="poolCount" type="number" defaultValue={2} className="input" /></Field>
              <Field label="Bracket size"><select name="bracketSize" className="select" defaultValue={4}><option value={2}>2 (final only)</option><option value={4}>4</option><option value={8}>8</option></select></Field>
            </div>
            <Field label="Description"><textarea name="description" className="textarea" rows={2} /></Field>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="registrationOpen" defaultChecked className="h-4 w-4" /> Registration open on public site</label>
            <SubmitButton>Create tournament</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
