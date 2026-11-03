import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/db";
import { rosterEntries, teams } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { PageHeader, Card, Empty, Badge, StatusBadge, Field } from "@/components/ui";
import { money } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { captainUpdateTeam, captainAddPlayer, captainRemovePlayer } from "../actions";
import { SubmitButton } from "@/components/submit-button";

export default async function MyTeamPage() {
  const me = await requireUser();
  const mine = await db.query.rosterEntries.findMany({ where: eq(rosterEntries.userId, me.id) });
  const teamIds = mine.map((r) => r.teamId);
  const list = teamIds.length ? await db.query.teams.findMany({ where: inArray(teams.id, teamIds), with: { season: { with: { league: true } }, captain: true, goalie: true, roster: { with: { user: true }, orderBy: (r, { asc }) => [asc(r.jerseyNumber)] } } }) : [];
  return (
    <>
      <PageHeader title="My Team" kicker={list.length > 1 ? `${list.length} teams` : undefined} />
      {list.length === 0 ? <Empty>You&apos;re not on a roster yet.</Empty> : list.map((t) => {
        const isCaptain = t.captainId === me.id;
        return (
          <div key={t.id} className="mb-6 space-y-4">
            <Card title={t.name} actions={<div className="flex items-center gap-2">{isCaptain && <Badge tone="ink">You&apos;re captain</Badge>}<Link href={`/schedule/${t.seasonId}`} className="text-xs font-bold uppercase text-red">Schedule →</Link></div>}>
              <div className="text-sm text-ink-3">{t.season.league.name} · {t.season.name}</div>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <div><div className="label">Captain</div>{t.captain?.name ?? "—"}</div>
                <div><div className="label">Goalie</div>{t.hasOwnGoalie ? t.goalie?.name ?? "Not named" : <span className="text-ink-3">Rink provides</span>}</div>
                {t.season.teamFeeCents > 0 && <div><div className="label">Team fee</div><StatusBadge status={t.feeStatus} /> <span className="text-xs text-ink-3">{money(t.feePaidCents)} of {money(t.season.teamFeeCents)}</span></div>}
              </div>
              {isCaptain && t.feeStatus !== "PAID" && t.feeStatus !== "WAIVED" && <p className="mt-3 rounded-md bg-[#fdf0dc] p-3 text-xs">Fees are due by the third week of play. Pay at the front desk or call (314) 487-4625. Online payment is coming soon.</p>}
            </Card>
            <Card title={`Roster (${t.roster.length})`}>
              <ul className="divide-y hairline text-sm">
                {t.roster.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2">
                    <span>{r.jerseyNumber && <span className="mr-2 w-6 inline-block text-ink-3 tabular-nums">#{r.jerseyNumber}</span>}<span className="font-semibold">{r.user.name}</span>{r.position && <span className="ml-2 text-xs text-ink-3">{r.position}</span>}{t.captainId === r.userId && <Badge tone="ink">C</Badge>}</span>
                    <span className="flex items-center gap-3 text-xs text-ink-3">{isCaptain && formatPhone(r.user.phone)}{isCaptain && r.userId !== me.id && <form action={captainRemovePlayer.bind(null, t.id, r.userId)}><button className="hover:text-red">Remove</button></form>}</span>
                  </li>
                ))}
              </ul>
            </Card>
            {isCaptain && (
              <div className="grid gap-4 md:grid-cols-2">
                <Card title="Add a player">
                  <form action={captainAddPlayer.bind(null, t.id)} className="space-y-3">
                    <Field label="Name"><input name="name" className="input" required /></Field>
                    <Field label="Mobile"><input name="phone" className="input" /></Field>
                    <Field label="Email"><input name="email" type="email" className="input" /></Field>
                    <div className="grid grid-cols-2 gap-3"><Field label="Jersey #"><input name="jerseyNumber" className="input" /></Field><Field label="Position"><select name="position" className="select"><option value="F">F</option><option value="D">D</option><option value="G">G</option></select></Field></div>
                    <SubmitButton className="btn-secondary">Add</SubmitButton>
                  </form>
                </Card>
                <Card title="Goalie">
                  <form action={captainUpdateTeam.bind(null, t.id)} className="space-y-3">
                    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="hasOwnGoalie" defaultChecked={t.hasOwnGoalie} className="h-4 w-4" /> We bring our own goalie</label>
                    <Field label="Who" hint="They'll get a text before each game to confirm. If they can't make it, the rink fills the spot."><select name="goalieUserId" defaultValue={t.goalieUserId ?? ""} className="select"><option value="">Pick from roster</option>{t.roster.map((r) => <option key={r.userId} value={r.userId}>{r.user.name}</option>)}</select></Field>
                    <SubmitButton>Save</SubmitButton>
                  </form>
                </Card>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
