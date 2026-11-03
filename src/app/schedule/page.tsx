import Link from "next/link";
import { PublicShell } from "@/components/shell";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { leagues, seasons } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui";
import { DAY_NAMES } from "@/lib/schedule";

export default async function SchedulesIndex() {
  const user = await getCurrentUser();
  const lgs = await db.query.leagues.findMany({ where: eq(leagues.active, true), orderBy: [asc(leagues.sortOrder)], with: { seasons: { where: inArray(seasons.status, ["ACTIVE", "REGISTRATION", "COMPLETE"]), orderBy: (s, { desc }) => [desc(s.startDate)], limit: 2 } } });
  return (
    <PublicShell user={user}>
      <PageHeader title="Schedules" kicker="Pick a league" />
      <div className="grid gap-4 md:grid-cols-2">
        {["ADULT", "YOUTH"].map((type) => (
          <Card key={type} title={type === "ADULT" ? "Adult leagues" : "Youth leagues"}>
            <ul className="divide-y hairline">
              {lgs.filter((l) => l.type === type).map((l) => (
                <li key={l.id} className="py-3">
                  <div className="font-bold">{l.name} <span className="text-xs font-normal text-ink-3">· {DAY_NAMES[l.dayOfWeek]}s · {l.skillLevel}</span></div>
                  <div className="mt-1 flex flex-wrap gap-2">{l.seasons.map((s) => <Link key={s.id} href={`/schedule/${s.id}`} className="btn btn-secondary btn-sm">{s.name}{s.status === "COMPLETE" ? " (final)" : ""}</Link>)}{l.seasons.length === 0 && <span className="text-xs text-ink-3">Schedule coming soon</span>}</div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </PublicShell>
  );
}
