import "server-only";
import { db } from "@/db";
import { games, goalieAssignments, refAssignments, maintenanceTasks, repairTickets, teams, seasons } from "@/db/schema";
import { and, asc, eq, gte, lte, inArray, lt } from "drizzle-orm";
import type { GameRowData } from "@/components/game-row";

export type GameWithAll = Awaited<ReturnType<typeof loadGames>>[number];

export async function loadGames(opts: { from?: Date; to?: Date; seasonId?: string; tournamentId?: string; limit?: number; statuses?: ("SCHEDULED" | "FINAL" | "CANCELED" | "POSTPONED")[] }) {
  const conds = [];
  if (opts.from) conds.push(gte(games.startsAt, opts.from));
  if (opts.to) conds.push(lte(games.startsAt, opts.to));
  if (opts.seasonId) conds.push(eq(games.seasonId, opts.seasonId));
  if (opts.tournamentId) conds.push(eq(games.tournamentId, opts.tournamentId));
  if (opts.statuses) conds.push(inArray(games.status, opts.statuses));
  return db.query.games.findMany({
    where: conds.length ? and(...conds) : undefined,
    orderBy: [asc(games.startsAt)],
    limit: opts.limit,
    with: {
      homeTeam: true,
      awayTeam: true,
      homeTTeam: true,
      awayTTeam: true,
      season: { with: { league: true } },
      tournament: true,
      pool: true,
      goalies: { with: { user: true } },
      refs: { with: { user: true } },
    },
  });
}

export function toRow(g: GameWithAll): GameRowData {
  return {
    id: g.id,
    startsAt: g.startsAt,
    status: g.status,
    homeName: g.homeTeam?.name ?? g.homeTTeam?.name ?? g.homeLabel ?? "TBD",
    awayName: g.awayTeam?.name ?? g.awayTTeam?.name ?? g.awayLabel ?? "TBD",
    homeColor: g.homeTeam?.color ?? "#B00000",
    awayColor: g.awayTeam?.color ?? "#333",
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    context: g.season ? g.season.league.name : g.tournament?.name,
    week: g.week,
    goalieNeeded: g.goalies.filter((x) => x.status === "NEEDED" || x.status === "DECLINED").length,
    goalieInvited: g.goalies.filter((x) => x.status === "INVITED").length,
    refNeeded: g.refs.filter((x) => x.status === "NEEDED" || x.status === "DECLINED").length,
    refInvited: g.refs.filter((x) => x.status === "INVITED").length,
  };
}

export async function dashboardCounts() {
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400000);
  const upcoming = await db.select({ id: games.id }).from(games).where(and(gte(games.startsAt, now), lte(games.startsAt, in7), eq(games.status, "SCHEDULED")));
  const ids = upcoming.map((g) => g.id);
  const goalieGaps = ids.length ? await db.select({ id: goalieAssignments.id }).from(goalieAssignments).where(and(inArray(goalieAssignments.gameId, ids), inArray(goalieAssignments.status, ["NEEDED", "DECLINED"]))) : [];
  const refGaps = ids.length ? await db.select({ id: refAssignments.id }).from(refAssignments).where(and(inArray(refAssignments.gameId, ids), inArray(refAssignments.status, ["NEEDED", "DECLINED"]))) : [];
  const overdue = await db.select({ id: maintenanceTasks.id }).from(maintenanceTasks).where(and(eq(maintenanceTasks.active, true), lt(maintenanceTasks.nextDueAt, now)));
  const openTickets = await db.select({ id: repairTickets.id }).from(repairTickets).where(inArray(repairTickets.status, ["OPEN", "IN_PROGRESS"]));
  const unpaid = await db
    .select({ id: teams.id })
    .from(teams)
    .innerJoin(seasons, eq(seasons.id, teams.seasonId))
    .where(and(eq(seasons.status, "ACTIVE"), inArray(teams.feeStatus, ["UNPAID", "DEPOSIT"])));
  return { gamesThisWeek: ids.length, goalieGaps: goalieGaps.length, refGaps: refGaps.length, overdue: overdue.length, openTickets: openTickets.length, unpaid: unpaid.length };
}
