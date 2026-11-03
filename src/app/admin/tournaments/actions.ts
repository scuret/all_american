"use server";
import { db } from "@/db";
import { tournaments, tournamentTeams, pools, games, users } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromZonedTime } from "date-fns-tz";
import { slotIterator, buildPoolGames, buildBracketSkeleton, poolSeedLabels, computeStandings } from "@/lib/tournament";
import { ensureGameSlots } from "@/lib/assignments";
import { roundRobin } from "@/lib/schedule";
import { normalizePhone } from "@/lib/phone";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string, d = 0) => { const v = Number(f.get(k)); return Number.isFinite(v) ? v : d; };
const tz = "America/Chicago";

function fields(form: FormData) {
  const slots = str(form, "timeSlots").split(/[,\s]+/).filter(Boolean);
  return {
    name: str(form, "name"),
    division: str(form, "division") || null,
    format: str(form, "format") as "POOL_TO_BRACKET" | "ROUND_ROBIN",
    startDate: fromZonedTime(str(form, "startDate") + "T00:00", tz),
    endDate: fromZonedTime(str(form, "endDate") + "T23:59", tz),
    timeSlots: slots.length ? slots : ["09:00", "10:15", "11:30", "12:45", "14:00", "15:15", "16:30", "17:45"],
    gameMinutes: num(form, "gameMinutes", 60),
    entryFeeCents: Math.round(num(form, "entryFee") * 100),
    maxTeams: num(form, "maxTeams", 8),
    poolCount: num(form, "poolCount", 2),
    bracketSize: num(form, "bracketSize", 4),
    registrationOpen: form.get("registrationOpen") === "on",
    description: str(form, "description") || null,
  };
}

export async function createTournament(form: FormData) {
  await requireStaff();
  const [t] = await db.insert(tournaments).values({ ...fields(form), status: "REGISTRATION" }).returning();
  revalidatePath("/admin/tournaments");
  redirect(`/admin/tournaments/${t.id}`);
}

export async function updateTournament(id: string, form: FormData) {
  await requireStaff();
  await db.update(tournaments).set({ ...fields(form), status: str(form, "status") as "DRAFT" | "REGISTRATION" | "POOL_PLAY" | "BRACKET" | "COMPLETE" }).where(eq(tournaments.id, id));
  revalidatePath(`/admin/tournaments/${id}`);
}

export async function addTournamentTeam(tournamentId: string, form: FormData) {
  await requireStaff();
  await db.insert(tournamentTeams).values({ tournamentId, name: str(form, "name"), contactName: str(form, "contactName"), contactEmail: str(form, "contactEmail") || null, contactPhone: normalizePhone(str(form, "contactPhone")), roster: str(form, "roster") || null, approved: true, feeStatus: "UNPAID" });
  revalidatePath(`/admin/tournaments/${tournamentId}`);
}

export async function updateTournamentTeam(teamId: string, form: FormData) {
  await requireStaff();
  const t = await db.query.tournamentTeams.findFirst({ where: eq(tournamentTeams.id, teamId) });
  if (!t) return;
  await db.update(tournamentTeams).set({ name: str(form, "name"), contactName: str(form, "contactName"), contactEmail: str(form, "contactEmail") || null, contactPhone: normalizePhone(str(form, "contactPhone")), roster: str(form, "roster") || null, approved: form.get("approved") === "on", feeStatus: str(form, "feeStatus") as "UNPAID" | "DEPOSIT" | "PAID" | "WAIVED", poolId: str(form, "poolId") || null, seed: num(form, "seed") || null }).where(eq(tournamentTeams.id, teamId));
  revalidatePath(`/admin/tournaments/${t.tournamentId}`);
}

export async function removeTournamentTeam(teamId: string) {
  await requireStaff();
  const t = await db.query.tournamentTeams.findFirst({ where: eq(tournamentTeams.id, teamId) });
  if (!t) return;
  await db.delete(tournamentTeams).where(eq(tournamentTeams.id, teamId));
  revalidatePath(`/admin/tournaments/${t.tournamentId}`);
}

/** Create pools and distribute approved teams snake-style by seed (or registration order). */
export async function assignPools(tournamentId: string) {
  await requireStaff();
  const t = await db.query.tournaments.findFirst({ where: eq(tournaments.id, tournamentId), with: { teams: { orderBy: [asc(tournamentTeams.seed), asc(tournamentTeams.createdAt)] }, pools: true } });
  if (!t) return;
  await db.delete(pools).where(eq(pools.tournamentId, tournamentId));
  const names = "ABCDEFGH".slice(0, t.poolCount).split("");
  const created = await db.insert(pools).values(names.map((n, i) => ({ tournamentId, name: n, sortOrder: i }))).returning();
  const approved = t.teams.filter((x) => x.approved);
  for (let i = 0; i < approved.length; i++) {
    const team = approved[i];
    const cycle = Math.floor(i / created.length);
    const idx = cycle % 2 === 0 ? i % created.length : created.length - 1 - (i % created.length);
    await db.update(tournamentTeams).set({ poolId: created[idx].id, seed: team.seed ?? i + 1 }).where(eq(tournamentTeams.id, team.id));
  }
  revalidatePath(`/admin/tournaments/${tournamentId}`);
}

/** Generate pool-play (or full round-robin) games plus the bracket skeleton. Replaces existing unplayed games. */
export async function generateTournamentGames(tournamentId: string) {
  await requireStaff();
  const t = await db.query.tournaments.findFirst({ where: eq(tournaments.id, tournamentId), with: { teams: true, pools: { orderBy: [asc(pools.sortOrder)] } } });
  if (!t) return;
  await db.delete(games).where(and(eq(games.tournamentId, tournamentId), eq(games.status, "SCHEDULED")));
  const slots = slotIterator(t.startDate, t.endDate, t.timeSlots);
  const approved = t.teams.filter((x) => x.approved);
  let plan;
  if (t.format === "ROUND_ROBIN" || t.pools.length === 0) {
    const pairings = roundRobin(approved.map((x) => x.id), Math.max(1, approved.length - 1));
    plan = [] as ReturnType<typeof buildPoolGames>;
    for (const p of pairings) { const n = slots.next(); if (n.done) break; plan.push({ home: p.home, away: p.away, startsAt: n.value, poolId: null }); }
  } else {
    plan = buildPoolGames(t.pools.map((p) => ({ id: p.id, teamIds: approved.filter((x) => x.poolId === p.id).map((x) => x.id) })), slots);
    if (t.bracketSize >= 2) {
      plan.push(...buildBracketSkeleton(t.bracketSize, poolSeedLabels(t.pools.map((p) => p.name), t.bracketSize), slots, t.gameMinutes));
    }
  }
  for (const g of plan) {
    const [row] = await db.insert(games).values({ tournamentId, poolId: g.poolId ?? null, homeTTeamId: g.home ?? null, awayTTeamId: g.away ?? null, homeLabel: g.homeLabel ?? null, awayLabel: g.awayLabel ?? null, bracketRound: g.bracketRound ?? null, bracketSlot: g.bracketSlot ?? null, startsAt: g.startsAt, durationMinutes: t.gameMinutes }).returning();
    await ensureGameSlots(row.id);
  }
  await db.update(tournaments).set({ status: "POOL_PLAY" }).where(eq(tournaments.id, tournamentId));
  revalidatePath(`/admin/tournaments/${tournamentId}`);
}

/** Fill bracket round 1 from pool standings, and later rounds from winners. */
export async function advanceBracket(tournamentId: string) {
  await requireStaff();
  const t = await db.query.tournaments.findFirst({ where: eq(tournaments.id, tournamentId), with: { teams: true, pools: { orderBy: [asc(pools.sortOrder)] }, games: true } });
  if (!t) return;
  // pool standings
  const seedMap = new Map<string, string>(); // "Pool A #1" -> teamId
  for (const p of t.pools) {
    const ids = t.teams.filter((x) => x.poolId === p.id).map((x) => x.id);
    const pg = t.games.filter((g) => g.poolId === p.id).map((g) => ({ homeTeamId: g.homeTTeamId, awayTeamId: g.awayTTeamId, homeScore: g.homeScore, awayScore: g.awayScore, status: g.status }));
    const rows = computeStandings(ids, pg);
    rows.forEach((r, i) => seedMap.set(`Pool ${p.name} #${i + 1}`, r.teamId));
  }
  const bracket = t.games.filter((g) => g.bracketRound).sort((a, b) => (a.bracketRound! - b.bracketRound!) || (a.bracketSlot! - b.bracketSlot!));
  for (const g of bracket) {
    const resolve = (label: string | null) => {
      if (!label) return null;
      if (seedMap.has(label)) return seedMap.get(label)!;
      const m = label.match(/^Winner R(\d+) G(\d+)$/);
      if (m) {
        const src = bracket.find((x) => x.bracketRound === Number(m[1]) && x.bracketSlot === Number(m[2]));
        if (src && src.status === "FINAL" && src.homeScore != null && src.awayScore != null) return src.homeScore > src.awayScore ? src.homeTTeamId : src.awayTTeamId;
      }
      return null;
    };
    const home = resolve(g.homeLabel);
    const away = resolve(g.awayLabel);
    if ((home && home !== g.homeTTeamId) || (away && away !== g.awayTTeamId)) {
      await db.update(games).set({ homeTTeamId: home ?? g.homeTTeamId, awayTTeamId: away ?? g.awayTTeamId }).where(eq(games.id, g.id));
      await ensureGameSlots(g.id);
    }
  }
  const poolDone = t.games.filter((g) => g.poolId).every((g) => g.status !== "SCHEDULED");
  if (poolDone && t.status === "POOL_PLAY") await db.update(tournaments).set({ status: "BRACKET" }).where(eq(tournaments.id, tournamentId));
  revalidatePath(`/admin/tournaments/${tournamentId}`);
}

/** Public registration. Creates a contact user so the team contact can sign in. */
export async function registerTeam(tournamentId: string, form: FormData) {
  const t = await db.query.tournaments.findFirst({ where: eq(tournaments.id, tournamentId), with: { teams: true } });
  if (!t || !t.registrationOpen) redirect(`/tournaments/${tournamentId}?closed=1`);
  if (t.teams.length >= t.maxTeams) redirect(`/tournaments/${tournamentId}?full=1`);
  const name = str(form, "name"); const contactName = str(form, "contactName");
  const contactEmail = str(form, "contactEmail").toLowerCase() || null; const contactPhone = normalizePhone(str(form, "contactPhone"));
  if (!name || !contactName || (!contactEmail && !contactPhone)) redirect(`/tournaments/${tournamentId}/register?error=1`);
  let contact = contactPhone ? await db.query.users.findFirst({ where: eq(users.phone, contactPhone) }) : null;
  if (!contact && contactEmail) contact = await db.query.users.findFirst({ where: eq(users.email, contactEmail) });
  if (!contact) [contact] = await db.insert(users).values({ name: contactName, email: contactEmail, phone: contactPhone, roles: ["CAPTAIN"], smsOptIn: !!contactPhone }).returning();
  await db.insert(tournamentTeams).values({ tournamentId, name, contactName, contactEmail, contactPhone, contactUserId: contact.id, roster: str(form, "roster") || null, approved: false, feeStatus: "UNPAID" });
  revalidatePath(`/admin/tournaments/${tournamentId}`);
  redirect(`/tournaments/${tournamentId}?registered=1`);
}

