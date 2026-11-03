import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { users, deliveries, goalieAssignments, refAssignments } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { PageHeader, Card, StatusBadge, Empty } from "@/components/ui";
import { PersonForm } from "@/components/person-form";
import { updatePerson, deletePerson } from "../actions";
import { getCurrentUser } from "@/lib/auth";
import { SubmitButton } from "@/components/submit-button";
import { fmtDateTime } from "@/lib/format";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  const u = await db.query.users.findFirst({ where: eq(users.id, id), with: { roster: { with: { team: { with: { season: { with: { league: true } } } } } } } });
  if (!u) notFound();
  const [msgs, gAssign, rAssign] = await Promise.all([
    db.query.deliveries.findMany({ where: eq(deliveries.userId, id), orderBy: [desc(deliveries.createdAt)], limit: 10 }),
    db.query.goalieAssignments.findMany({ where: eq(goalieAssignments.userId, id), with: { game: true, team: true }, orderBy: [desc(goalieAssignments.createdAt)], limit: 8 }),
    db.query.refAssignments.findMany({ where: eq(refAssignments.userId, id), with: { game: true }, orderBy: [desc(refAssignments.createdAt)], limit: 8 }),
  ]);
  return (
    <>
      <PageHeader back={{ href: "/admin/people", label: "People" }} title={u.name} kicker={u.roles.join(" · ").toLowerCase()} actions={<Link href={`/admin/messages/new?audience=USERS&id=${u.id}`} className="btn btn-primary btn-sm">✉ Message</Link>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Details"><PersonForm user={u} action={updatePerson.bind(null, u.id)} canGrantAdmin={!!me?.roles.includes("ADMIN")} /></Card>
          <Card title="Teams">
            {u.roster.length === 0 ? <Empty>Not on any roster.</Empty> : (
              <ul className="divide-y hairline text-sm">{u.roster.map((r) => <li key={r.id} className="flex justify-between py-2"><Link href={`/admin/teams/${r.teamId}`} className="font-bold hover:text-red">{r.team.name}</Link><span className="text-xs text-ink-3">{r.team.season.league.name} · {r.team.season.name}{r.jerseyNumber ? ` · #${r.jerseyNumber}` : ""}</span></li>)}</ul>
            )}
          </Card>
          {(gAssign.length > 0 || rAssign.length > 0) && (
            <Card title="Assignments">
              <ul className="divide-y hairline text-sm">
                {gAssign.map((a) => <li key={a.id} className="flex justify-between py-2"><span>Goalie for <b>{a.team?.name}</b> · <Link href={`/admin/games/${a.gameId}`} className="hover:text-red">{fmtDateTime(a.game.startsAt)}</Link></span><StatusBadge status={a.status} /></li>)}
                {rAssign.map((a) => <li key={a.id} className="flex justify-between py-2"><span>Ref · <Link href={`/admin/games/${a.gameId}`} className="hover:text-red">{fmtDateTime(a.game.startsAt)}</Link></span><StatusBadge status={a.status} /></li>)}
              </ul>
            </Card>
          )}
        </div>
        <div className="space-y-5">
          <Card title="Recent messages">
            {msgs.length === 0 ? <Empty>Nothing sent yet.</Empty> : (
              <ul className="space-y-2 text-xs">{msgs.map((m) => <li key={m.id} className="border-b hairline pb-2 last:border-0"><div className="flex justify-between"><span className="font-bold">{m.channel}</span><StatusBadge status={m.status} /></div><div className="mt-1 line-clamp-2 text-ink-2">{m.body}</div><div className="text-ink-3">{fmtDateTime(m.createdAt)}</div></li>)}</ul>
            )}
          </Card>
          {me?.roles.includes("ADMIN") && me.id !== u.id && (
            <Card title="Danger zone"><form action={deletePerson.bind(null, u.id)}><SubmitButton className="btn-danger btn-sm" confirm={`Delete ${u.name}? This removes them from rosters and assignments.`}>Delete person</SubmitButton></form></Card>
          )}
        </div>
      </div>
    </>
  );
}
