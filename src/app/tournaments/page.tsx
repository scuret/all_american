import Link from "next/link";
import { PublicShell } from "@/components/shell";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import { desc, ne } from "drizzle-orm";
import { PageHeader, Card, Empty, StatusBadge } from "@/components/ui";
import { fmtDate, money } from "@/lib/format";

export default async function TournamentsPublic() {
  const user = await getCurrentUser();
  const list = await db.query.tournaments.findMany({ where: ne(tournaments.status, "DRAFT"), orderBy: [desc(tournaments.startDate)], with: { teams: true } });
  return (
    <PublicShell user={user}>
      <PageHeader title="Tournaments" />
      {list.length === 0 ? <Empty>No tournaments posted yet.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((t) => (
            <Card key={t.id} title={t.name} actions={<StatusBadge status={t.status} />}>
              <div className="text-sm text-ink-2">{t.division} · {fmtDate(t.startDate)} to {fmtDate(t.endDate)} · {money(t.entryFeeCents)} per team · {t.teams.filter((x) => x.approved).length}/{t.maxTeams} teams</div>
              {t.description && <p className="mt-2 text-sm text-ink-3">{t.description}</p>}
              <div className="mt-3 flex gap-2"><Link href={`/tournaments/${t.id}`} className="btn btn-secondary btn-sm">Details</Link>{t.registrationOpen && t.teams.length < t.maxTeams && <Link href={`/tournaments/${t.id}/register`} className="btn btn-primary btn-sm">Register a team</Link>}</div>
            </Card>
          ))}
        </div>
      )}
    </PublicShell>
  );
}
