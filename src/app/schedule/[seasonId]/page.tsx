import { notFound } from "next/navigation";
import { PublicShell } from "@/components/shell";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { seasons } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader, Card, Badge } from "@/components/ui";
import { DAY_NAMES, computeStandings } from "@/lib/schedule";
import { loadGames } from "@/lib/queries";
import { fmtDate, fmtTime, fmtYmd } from "@/lib/format";

export default async function PublicSeason({ params }: { params: Promise<{ seasonId: string }> }) {
  const { seasonId } = await params;
  const user = await getCurrentUser();
  const season = await db.query.seasons.findFirst({ where: eq(seasons.id, seasonId), with: { league: true, teams: true } });
  if (!season) notFound();
  const games = await loadGames({ seasonId });
  const standings = computeStandings(season.teams.map((t) => t.id), games);
  const team = (id: string | null) => season.teams.find((t) => t.id === id);
  const byDate = new Map<string, typeof games>();
  for (const g of games) { const k = fmtYmd(g.startsAt); byDate.set(k, [...(byDate.get(k) ?? []), g]); }
  const todayKey = fmtYmd(new Date());
  return (
    <PublicShell user={user}>
      <PageHeader back={{ href: "/schedule", label: "All schedules" }} kicker={`${DAY_NAMES[season.league.dayOfWeek]}s · ${season.league.skillLevel ?? ""}`} title={`${season.league.name} · ${season.name}`} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Schedule" className="lg:col-span-2">
          {[...byDate.entries()].map(([day, list]) => (
            <div key={day} className="mb-4 last:mb-0">
              <div className={`mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${day < todayKey ? "text-ink-3" : "text-red"}`}>{fmtDate(list[0].startsAt)}{list[0].week ? <span className="text-ink-3">· Week {list[0].week}</span> : null}{day === todayKey && <Badge tone="red">Today</Badge>}</div>
              <table className="table">
                <tbody>
                  {list.map((g) => {
                    const h = team(g.homeTeamId); const a = team(g.awayTeamId);
                    const final = g.status === "FINAL";
                    return (
                      <tr key={g.id} className={g.status === "CANCELED" ? "opacity-50 line-through" : ""}>
                        <td className="w-20 text-xs font-bold text-ink-3">{fmtTime(g.startsAt)}</td>
                        <td><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: a?.color }} /><span className={final && (g.awayScore ?? 0) > (g.homeScore ?? 0) ? "font-extrabold" : "font-semibold"}>{a?.name}</span></td>
                        <td className="w-10 text-right tabular-nums font-bold">{final ? g.awayScore : ""}</td>
                        <td className="w-6 text-center text-xs text-ink-3">{final ? "-" : "@"}</td>
                        <td className="w-10 tabular-nums font-bold">{final ? g.homeScore : ""}</td>
                        <td><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: h?.color }} /><span className={final && (g.homeScore ?? 0) > (g.awayScore ?? 0) ? "font-extrabold" : "font-semibold"}>{h?.name}</span></td>
                        <td className="text-right text-xs">{g.status === "POSTPONED" && <Badge tone="warn">PPD</Badge>}{g.status === "CANCELED" && <Badge tone="gray">CXL</Badge>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
          {games.length === 0 && <p className="text-sm text-ink-3">Schedule hasn&apos;t been posted yet.</p>}
        </Card>
        <Card title="Standings">
          <table className="table">
            <thead><tr><th>Team</th><th className="text-right">GP</th><th className="text-right">W</th><th className="text-right">L</th><th className="text-right">T</th><th className="text-right">PTS</th></tr></thead>
            <tbody>{standings.map((r) => { const t = team(r.teamId)!; return <tr key={r.teamId}><td className="font-bold"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: t.color }} />{t.name}</td><td className="text-right tabular-nums">{r.gp}</td><td className="text-right tabular-nums">{r.w}</td><td className="text-right tabular-nums">{r.l}</td><td className="text-right tabular-nums">{r.t}</td><td className="text-right font-bold tabular-nums">{r.pts}</td></tr>; })}</tbody>
          </table>
          <p className="mt-3 text-xs text-ink-3">2 points for a win, 1 for a tie. Tiebreak: goal differential, then goals for.</p>
        </Card>
      </div>
    </PublicShell>
  );
}
