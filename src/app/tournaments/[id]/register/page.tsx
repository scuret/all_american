import { notFound } from "next/navigation";
import { PublicShell } from "@/components/shell";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader, Card, Field } from "@/components/ui";
import { registerTeam } from "@/app/admin/tournaments/actions";
import { SubmitButton } from "@/components/submit-button";
import { fmtDate, money } from "@/lib/format";

export default async function RegisterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await getCurrentUser();
  const t = await db.query.tournaments.findFirst({ where: eq(tournaments.id, id), with: { teams: true } });
  if (!t || t.status === "DRAFT") notFound();
  const full = t.teams.length >= t.maxTeams;
  return (
    <PublicShell user={user}>
      <PageHeader back={{ href: `/tournaments/${t.id}`, label: t.name }} kicker={`${fmtDate(t.startDate)} to ${fmtDate(t.endDate)} · ${money(t.entryFeeCents)} per team`} title="Register your team" />
      <div className="mx-auto max-w-2xl">
        {!t.registrationOpen || full ? (
          <Card><p className="text-sm font-semibold text-red">{full ? "This tournament is full." : "Registration is closed."} Call (314) 487-4625 to get on the wait list.</p></Card>
        ) : (
          <Card>
            {error && <p className="mb-3 text-sm font-semibold text-red">Please fill in the team name, contact name, and a phone or email.</p>}
            <form action={registerTeam.bind(null, t.id)} className="space-y-4">
              <Field label="Team name"><input name="name" className="input" required /></Field>
              <Field label="Team contact (manager or captain)"><input name="contactName" className="input" required defaultValue={user?.name ?? ""} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Mobile" hint="We text schedule changes and game-day updates."><input name="contactPhone" className="input" defaultValue={user?.phone ?? ""} /></Field>
                <Field label="Email"><input name="contactEmail" type="email" className="input" defaultValue={user?.email ?? ""} /></Field>
              </div>
              <Field label="Roster" hint="One player per line: number, name. You can update this later."><textarea name="roster" className="textarea" rows={8} placeholder={"12 Jake Meyer\n7 Tyler Koenig\n…"} /></Field>
              <div className="rounded-md bg-ice p-3 text-sm">Entry fee is {money(t.entryFeeCents)} per team. After you register, the rink will confirm your spot and collect payment. Online payment is coming soon.</div>
              <SubmitButton className="btn-primary w-full" pendingText="Registering…">Submit registration</SubmitButton>
            </form>
          </Card>
        )}
      </div>
    </PublicShell>
  );
}
