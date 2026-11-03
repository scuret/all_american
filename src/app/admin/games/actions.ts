"use server";
import { db } from "@/db";
import { games, goalieAssignments, refAssignments, rosterEntries, users } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { inviteGoalie, autoFillGoalie, inviteRef, autoFillRef, ensureGameSlots, gameLabel } from "@/lib/assignments";
import { broadcast } from "@/lib/messaging";
import { and, eq, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { fromZonedTime } from "date-fns-tz";
import { fmtDate, fmtTime } from "@/lib/format";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function paths(gameId: string, seasonId?: string | null, tournamentId?: string | null) {
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/goalies");
  revalidatePath("/admin/referees");
  if (seasonId) revalidatePath(`/admin/seasons/${seasonId}`);
  if (tournamentId) revalidatePath(`/admin/tournaments/${tournamentId}`);
}

export async function updateGame(gameId: string, form: FormData) {
  await requireStaff();
  const g = await db.query.games.findFirst({ where: eq(games.id, gameId) });
  if (!g) return;
  const status = str(form, "status") as "SCHEDULED" | "FINAL" | "CANCELED" | "POSTPONED";
  const hs = str(form, "homeScore");
  const as = str(form, "awayScore");
  await db.update(games).set({
    status,
    homeScore: hs === "" ? null : Number(hs),
    awayScore: as === "" ? null : Number(as),
    startsAt: str(form, "startsAt") ? fromZonedTime(str(form, "startsAt"), "America/Chicago") : g.startsAt,
    notes: str(form, "notes") || null,
  }).where(eq(games.id, gameId));
  paths(gameId, g.seasonId, g.tournamentId);
}

export async function assignGoalie(assignmentId: string, form: FormData) {
  await requireStaff();
  const a = await db.query.goalieAssignments.findFirst({ where: eq(goalieAssignments.id, assignmentId), with: { game: true } });
  if (!a) return;
  const userId = str(form, "userId");
  const mode = str(form, "mode"); // invite | confirm | auto | clear
  if (mode === "auto") await autoFillGoalie(assignmentId);
  else if (mode === "clear") await db.update(goalieAssignments).set({ userId: null, status: "NEEDED", invitedAt: null, respondedAt: null }).where(eq(goalieAssignments.id, assignmentId));
  else if (mode === "confirm" && userId) await db.update(goalieAssignments).set({ userId, status: "CONFIRMED", respondedAt: new Date() }).where(eq(goalieAssignments.id, assignmentId));
  else if (userId) await inviteGoalie(assignmentId, userId);
  paths(a.gameId, a.game.seasonId, a.game.tournamentId);
}

export async function assignRef(assignmentId: string, form: FormData) {
  await requireStaff();
  const a = await db.query.refAssignments.findFirst({ where: eq(refAssignments.id, assignmentId), with: { game: true } });
  if (!a) return;
  const userId = str(form, "userId");
  const mode = str(form, "mode");
  if (mode === "auto") await autoFillRef(assignmentId);
  else if (mode === "clear") await db.update(refAssignments).set({ userId: null, status: "NEEDED", invitedAt: null, respondedAt: null }).where(eq(refAssignments.id, assignmentId));
  else if (mode === "confirm" && userId) await db.update(refAssignments).set({ userId, status: "CONFIRMED", respondedAt: new Date() }).where(eq(refAssignments.id, assignmentId));
  else if (userId) await inviteRef(assignmentId, userId);
  paths(a.gameId, a.game.seasonId, a.game.tournamentId);
}

export async function addRefSlot(gameId: string) {
  await requireStaff();
  const g = await db.query.games.findFirst({ where: eq(games.id, gameId) });
  if (!g) return;
  await db.insert(refAssignments).values({ gameId, role: "ASSISTANT", status: "NEEDED" });
  paths(gameId, g.seasonId, g.tournamentId);
}

export async function removeRefSlot(assignmentId: string) {
  await requireStaff();
  const a = await db.query.refAssignments.findFirst({ where: eq(refAssignments.id, assignmentId), with: { game: true } });
  if (!a) return;
  await db.delete(refAssignments).where(eq(refAssignments.id, assignmentId));
  paths(a.gameId, a.game.seasonId, a.game.tournamentId);
}

export async function repairSlots(gameId: string) {
  await requireStaff();
  await ensureGameSlots(gameId);
  const g = await db.query.games.findFirst({ where: eq(games.id, gameId) });
  paths(gameId, g?.seasonId, g?.tournamentId);
}

/** Text or email everyone on both rosters for a game. */
export async function messageGame(gameId: string, form: FormData) {
  const staff = await requireStaff();
  const g = await db.query.games.findFirst({ where: eq(games.id, gameId) });
  if (!g) return;
  const teamIds = [g.homeTeamId, g.awayTeamId].filter(Boolean) as string[];
  const roster = teamIds.length ? await db.query.rosterEntries.findMany({ where: inArray(rosterEntries.teamId, teamIds), with: { user: true } }) : [];
  const recipients = roster.map((r) => r.user);
  const channel = str(form, "channel") as "SMS" | "EMAIL";
  const { label } = await gameLabel(gameId);
  const body = str(form, "body") || `Reminder: ${label} on ${fmtDate(g.startsAt)} at ${fmtTime(g.startsAt)} at All American.`;
  await broadcast({ channel, subject: `Game ${fmtDate(g.startsAt)}: ${label}`, body, audienceType: "GAME", audienceId: gameId, sentById: staff.id, recipients });
  paths(gameId, g.seasonId, g.tournamentId);
}

/** Bulk: send invites for every NEEDED goalie/ref slot on games in the next N days. */
export async function autoFillUpcoming(days: number) {
  await requireStaff();
  const to = new Date(Date.now() + days * 86400000);
  const upcoming = await db.query.games.findMany({ where: and(eq(games.status, "SCHEDULED"), or(eq(games.status, "SCHEDULED"))), with: { goalies: true, refs: true } });
  let count = 0;
  for (const g of upcoming) {
    if (g.startsAt < new Date() || g.startsAt > to) continue;
    for (const a of g.goalies) {
      if (a.status === "NEEDED" && a.source === "TEAM" && a.userId) { await inviteGoalie(a.id, a.userId); count++; }
      else if (a.status === "NEEDED" || a.status === "DECLINED") { const r = await autoFillGoalie(a.id); if (r) count++; }
    }
    for (const r of g.refs) {
      if (r.status === "NEEDED") { const x = await autoFillRef(r.id); if (x) count++; }
    }
  }
  revalidatePath("/admin/goalies");
  revalidatePath("/admin/referees");
  revalidatePath("/admin");
  return count;
}

