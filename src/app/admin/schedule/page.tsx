import Link from "next/link";
import { db } from "@/db";
import { rinkBlocks } from "@/db/schema";
import { and, gte, lte } from "drizzle-orm";
import { PageHeader, Card, Badge } from "@/components/ui";
import { loadGames, toRow } from "@/lib/queries";
import { GameRow } from "@/components/game-row";
import { fmtDateLong, fmtTime, fmtYmd } from "@/lib/format";
import { addDays, startOfWeek, format } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const nowLocal = toZonedTime(new Date(), "America/Chicago");
  const anchor = week ? new Date(week + "T00:00:00") : nowLocal;
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const from = fromZonedTime(start, "America/Chicago");
  const to = fromZonedTime(addDays(start, 7), "America/Chicago");
  const [games, blocks] = await Promise.all([
    loadGames({ from, to }),
    db.select().from(rinkBlocks).where(and(lte(rinkBlocks.startsAt, to), gte(rinkBlocks.endsAt, from))),
  ]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const ymd = (d: Date) => fmtYmd(d);
  const prev = format(addDays(start, -7), "yyyy-MM-dd");
  const next = format(addDays(start, 7), "yyyy-MM-dd");
  const kindTone: Record<string, "red" | "warn" | "info" | "gray"> = { MAINTENANCE: "warn", RENTAL: "info", EVENT: "info", CLOSED: "red" };

  return (
    <>
      <PageHeader title="Rink Calendar" kicker={`Week of ${fmtDateLong(from)}`} actions={<div className="flex gap-2"><Link href={`/admin/schedule?week=${prev}`} className="btn btn-secondary btn-sm">← Prev</Link><Link href="/admin/schedule" className="btn btn-secondary btn-sm">This week</Link><Link href={`/admin/schedule?week=${next}`} className="btn btn-secondary btn-sm">Next →</Link><Link href="/admin/maintenance?tab=blocks" className="btn btn-primary btn-sm">+ Block time</Link></div>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const dayGames = games.filter((g) => ymd(g.startsAt) === key);
          const dayBlocks = blocks.filter((b) => ymd(b.startsAt) <= key && ymd(new Date(b.endsAt.getTime() - 1)) >= key);
          const isToday = key === format(nowLocal, "yyyy-MM-dd");
          return (
            <Card key={key} title={format(d, "EEEE M/d")} className={isToday ? "ring-2 ring-red" : ""} actions={isToday ? <Badge tone="red">Today</Badge> : undefined}>
              {dayBlocks.map((b) => (
                <div key={b.id} className="mb-2 rounded-md border border-dashed hairline bg-paper-2 px-3 py-2 text-xs">
                  <Badge tone={kindTone[b.kind] ?? "gray"}>{b.kind.toLowerCase()}</Badge> <span className="font-bold">{b.title}</span>
                  <div className="text-ink-3">{fmtTime(b.startsAt)} to {fmtTime(b.endsAt)}</div>
                </div>
              ))}
              {dayGames.length === 0 && dayBlocks.length === 0 && <div className="py-4 text-center text-xs text-ink-3">Open</div>}
              {dayGames.map((g) => <GameRow key={g.id} g={toRow(g)} href={`/admin/games/${g.id}`} compact />)}
            </Card>
          );
        })}
      </div>
    </>
  );
}
