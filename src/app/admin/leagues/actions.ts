"use server";
import { db } from "@/db";
import { leagues, seasons, teams, rosterEntries, games, users, rinkBlocks, goalieAssignments, refAssignments } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { roundRobin, layoutSeason } from "@/lib/schedule";
import { ensureGameSlots } from "@/lib/assignments";
import { normalizePhone } from "@/lib/phone";
import { and, eq, gte, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromZonedTime } from "date-fns-tz";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string, d = 0) => { const v = Number(f.get(k)); return Number.isFinite(v) ? v : d; };

export async function createLeague(form: FormData) {
  await requireStaff();
  const [l] = await db.insert(leagues).values({ name: str(form, "name"), type: str(form, "type") as "ADULT" | "YOUTH", dayOfWeek: num(form, "dayOfWeek"), skillLevel: str(form, "skillLevel") || null, description: str(form, "description") || null, sortOrder: num(form, "sortOrder", 99) }).returning();
  revalidatePath("/admin/leagues");
  redirect(`/admin/leagues/${l.id}`);
}

export async function updateLeague(id: string, form: FormData) {
  await requireStaff();
  await db.update(leagues).set({ name: str(form, "name"), type: str(form, "type") as "ADULT" | "YOUTH", dayOfWeek: num(form, "dayOfWeek"), skillLevel: str(form, "skillLevel") || null, description: str(form, "description") || null, active: form.get("active") === "on", sortOrder: num(form, "sortOrder", 99) }).where(eq(leagues.id, id));
  revalidatePath(`/admin/leagues/${id}`);
  revalidatePath("/admin/leagues");
}

export async function createSeason(leagueId: string, form: FormData) {
  await requireStaff();
  const slots = str(form, "timeSlots").split(/[,\s]+/).filter(Boolean);
  const blackout = str(form, "blackoutDates").split(/[,\s]+/).filter(Boolean);
  const [s] = await db.insert(seasons).values({
    leagueId,
    name: str(form, "name"),
    startDate: fromZonedTime(str(form, "startDate"), "America/Chicago"),
    gamesPerTeam: num(form, "gamesPerTeam", 10),
    timeSlots: slots.length ? slots : ["19:00", "20:15", "21:30"],
    gameMinutes: num(form, "gameMinutes", 75),
    teamFeeCents: Math.round(num(form, "teamFee") * 100),
    depositCents: Math.round(num(form, "deposit") * 100),
    refsPerGame: num(form, "refsPerGame", 1),
    blackoutDates: blackout,
    status: "DRAFT",
  }).returning();
  revalidatePath(`/admin/leagues/${leagueId}`);
  redirect(`/admin/seasons/${s.id}`);
}

export async function updateSeason(id: string, form: FormData) {
  await requireStaff();
  const slots = str(form, "timeSlots").split(/[,\s]+/).filter(Boolean);
  const blackout = str(form, "blackoutDates").split(/[,\s]+/).filter(Boolean);
  await db.update(seasons).set({
    name: str(form, "name"),
    startDate: fromZonedTime(str(form, "startDate"), "America/Chicago"),
    gamesPerTeam: num(form, "gamesPerTeam", 10),
    timeSlots: slots,
    gameMinutes: num(form, "gameMinutes", 75),
    teamFeeCents: Math.round(num(form, "teamFee") * 100),
    depositCents: Math.round(num(form, "deposit") * 100),
    refsPerGame: num(form, "refsPerGame", 1),
    blackoutDates: blackout,
    status: str(form, "status") as "DRAFT" | "REGISTRATION" | "ACTIVE" | "COMPLETE",
  }).where(eq(seasons.id, id));
  revalidatePath(`/admin/seasons/${id}`);
}

export async function createTeam(seasonId: string, form: FormData) {
  await requireStaff();
  await db.insert(teams).values({ seasonId, name: str(form, "name"), color: str(form, "color") || "#B00000", isNew: form.get("isNew") === "on" });
  revalidatePath(`/admin/seasons/${seasonId}`);
}

export async function updateTeam(teamId: string, form: FormData) {
  await requireStaff();
  const t = await db.query.teams.findFirst({ where: eq(teams.id, teamId) });
  if (!t) return;
  const captainId = str(form, "captainId") || null;
  const goalieUserId = str(form, "goalieUserId") || null;
  const hasOwnGoalie = form.get("hasOwnGoalie") === "on";
  await db.update(teams).set({
    name: str(form, "name"),
    color: str(form, "color") || "#B00000",
    captainId,
    hasOwnGoalie,
    goalieUserId: hasOwnGoalie ? goalieUserId : null,
    feeStatus: str(form, "feeStatus") as "UNPAID" | "DEPOSIT" | "PAID" | "WAIVED",
    feePaidCents: Math.round(num(form, "feePaid") * 100),
    isNew: form.get("isNew") === "on",
  }).where(eq(teams.id, teamId));
  if (captainId) {
    const u = await db.query.users.findFirst({ where: eq(users.id, captainId) });
    if (u && !u.roles.includes("CAPTAIN")) await db.update(users).set({ roles: [...u.roles, "CAPTAIN"] }).where(eq(users.id, captainId));
  }
  if (hasOwnGoalie && goalieUserId) {
    const u = await db.query.users.findFirst({ where: eq(users.id, goalieUserId) });
    if (u && !u.roles.includes("GOALIE")) await db.update(users).set({ roles: [...u.roles, "GOALIE"] }).where(eq(users.id, goalieUserId));
    // sync upcoming goalie slots for this team
    const upcoming = await db.select({ id: games.id }).from(games).where(and(gte(games.startsAt, new Date()), or(eq(games.homeTeamId, teamId), eq(games.awayTeamId, teamId))));
    if (upcoming.length) {
      await db.update(goalieAssignments).set({ userId: goalieUserId, source: "TEAM", status: "NEEDED" }).where(and(eq(goalieAssignments.teamId, teamId), inArray(goalieAssignments.gameId, upcoming.map((g) => g.id)), inArray(goalieAssignments.status, ["NEEDED", "DECLINED"])));
    }
  }
  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath(`/admin/seasons/${t.seasonId}`);
}

export async function deleteTeam(teamId: string) {
  await requireStaff();
  const t = await db.query.teams.findFirst({ where: eq(teams.id, teamId) });
  if (!t) return;
  await db.delete(teams).where(eq(teams.id, teamId));
  revalidatePath(`/admin/seasons/${t.seasonId}`);
  redirect(`/admin/seasons/${t.seasonId}`);
}

/** Add a player to a roster: by existing user id, or create a new user from name/phone/email. */
export async function addRosterPlayer(teamId: string, form: FormData) {
  await requireStaff();
  let userId = str(form, "userId");
  if (!userId) {
    const name = str(form, "name");
    if (!name) return;
    const phone = normalizePhone(str(form, "phone"));
    const email = str(form, "email").toLowerCase() || null;
    const existing = phone ? await db.query.users.findFirst({ where: eq(users.phone, phone) }) : email ? await db.query.users.findFirst({ where: eq(users.email, email) }) : null;
    if (existing) userId = existing.id;
    else {
      const [u] = await db.insert(users).values({ name, phone, email, roles: ["PLAYER"], smsOptIn: !!phone }).returning();
      userId = u.id;
    }
  }
  const position = str(form, "position") || null;
  await db.insert(rosterEntries).values({ teamId, userId, jerseyNumber: str(form, "jerseyNumber") || null, position, waiverSigned: form.get("waiverSigned") === "on" }).onConflictDoNothing();
  if (position === "G") {
    const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (u && !u.roles.includes("GOALIE")) await db.update(users).set({ roles: [...u.roles, "GOALIE"] }).where(eq(users.id, userId));
  }
  revalidatePath(`/admin/teams/${teamId}`);
}

export async function removeRosterPlayer(teamId: string, userId: string) {
  await requireStaff();
  await db.delete(rosterEntries).where(and(eq(rosterEntries.teamId, teamId), eq(rosterEntries.userId, userId)));
  revalidatePath(`/admin/teams/${teamId}`);
}

export async function toggleWaiver(teamId: string, userId: string, signed: boolean) {
  await requireStaff();
  await db.update(rosterEntries).set({ waiverSigned: signed }).where(and(eq(rosterEntries.teamId, teamId), eq(rosterEntries.userId, userId)));
  revalidatePath(`/admin/teams/${teamId}`);
}

/** Generate (or regenerate) the season schedule. Existing FINAL games are kept; unplayed games are replaced. */
export async function generateSchedule(seasonId: string, form: FormData) {
  await requireStaff();
  const season = await db.query.seasons.findFirst({ where: eq(seasons.id, seasonId), with: { league: true, teams: true } });
  if (!season) return;
  if (season.teams.length < 2) return;
  const replaceAll = form.get("replaceAll") === "on";
  const existing = await db.query.games.findMany({ where: eq(games.seasonId, seasonId) });
  const keep = replaceAll ? [] : existing.filter((g) => g.status === "FINAL");
  const removeIds = existing.filter((g) => !keep.includes(g)).map((g) => g.id);
  if (removeIds.length) await db.delete(games).where(inArray(games.id, removeIds));

  const blockers = await db.select().from(rinkBlocks).where(gte(rinkBlocks.endsAt, season.startDate));
  // if keeping played games, start generating after the last kept game and skip the weeks already played
  const playedWeeks = new Set(keep.map((g) => g.week ?? 0));
  const startDate = keep.length ? new Date(Math.max(...keep.map((g) => g.startsAt.getTime())) + 86400000) : season.startDate;
  const pairings = roundRobin(season.teams.map((t) => t.id), season.gamesPerTeam).filter((p) => !playedWeeks.has(p.week));
  const plan = layoutSeason({ pairings, startDate, dayOfWeek: season.league.dayOfWeek, timeSlots: season.timeSlots, gameMinutes: season.gameMinutes, blackoutDates: season.blackoutDates, blockers });
  const offset = keep.length ? Math.max(...keep.map((g) => g.week ?? 0)) : 0;
  for (const p of plan) {
    const [g] = await db.insert(games).values({ seasonId, homeTeamId: p.home, awayTeamId: p.away, week: p.week + offset, startsAt: p.date, durationMinutes: season.gameMinutes }).returning();
    await ensureGameSlots(g.id);
  }
  if (season.status === "DRAFT") await db.update(seasons).set({ status: "ACTIVE" }).where(eq(seasons.id, seasonId));
  revalidatePath(`/admin/seasons/${seasonId}`);
  redirect(`/admin/seasons/${seasonId}?tab=schedule`);
}

export async function addGame(seasonId: string, form: FormData) {
  await requireStaff();
  const season = await db.query.seasons.findFirst({ where: eq(seasons.id, seasonId) });
  if (!season) return;
  const [g] = await db.insert(games).values({ seasonId, homeTeamId: str(form, "homeTeamId"), awayTeamId: str(form, "awayTeamId"), week: num(form, "week") || null, startsAt: fromZonedTime(str(form, "startsAt"), "America/Chicago"), durationMinutes: season.gameMinutes }).returning();
  await ensureGameSlots(g.id);
  revalidatePath(`/admin/seasons/${seasonId}`);
}

export async function clearSchedule(seasonId: string) {
  await requireStaff();
  await db.delete(games).where(and(eq(games.seasonId, seasonId), eq(games.status, "SCHEDULED")));
  revalidatePath(`/admin/seasons/${seasonId}`);
}

