import "server-only";
import { db } from "@/db";
import { games, goalieAssignments, refAssignments, teams, users, tournamentTeams, rosterEntries } from "@/db/schema";
import { and, eq, inArray, gte, lte, ne, sql } from "drizzle-orm";
import { notifyUser } from "./messaging";
import { fmtDate, fmtTime } from "./format";

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

export async function gameLabel(gameId: string) {
  const g = await db.query.games.findFirst({
    where: eq(games.id, gameId),
    with: { homeTeam: true, awayTeam: true, homeTTeam: true, awayTTeam: true, season: { with: { league: true } }, tournament: true },
  });
  if (!g) return { g: null, label: "" };
  const home = g.homeTeam?.name ?? g.homeTTeam?.name ?? g.homeLabel ?? "TBD";
  const away = g.awayTeam?.name ?? g.awayTTeam?.name ?? g.awayLabel ?? "TBD";
  const ctx = g.season ? g.season.league.name : g.tournament?.name ?? "";
  return { g, label: `${away} @ ${home}`, ctx, when: `${fmtDate(g.startsAt)} ${fmtTime(g.startsAt)}` };
}

/** Ensure every game has its goalie slots (one per team) and ref slots. Idempotent. */
export async function ensureGameSlots(gameId: string) {
  const g = await db.query.games.findFirst({
    where: eq(games.id, gameId),
    with: { goalies: true, refs: true, homeTeam: true, awayTeam: true, season: true, tournament: true },
  });
  if (!g) return;
  // goalies
  const teamSides: { teamId?: string; tteamId?: string; hasOwn: boolean; goalieUserId: string | null }[] = [];
  if (g.homeTeam) teamSides.push({ teamId: g.homeTeam.id, hasOwn: g.homeTeam.hasOwnGoalie, goalieUserId: g.homeTeam.goalieUserId });
  if (g.awayTeam) teamSides.push({ teamId: g.awayTeam.id, hasOwn: g.awayTeam.hasOwnGoalie, goalieUserId: g.awayTeam.goalieUserId });
  if (g.homeTTeamId) teamSides.push({ tteamId: g.homeTTeamId, hasOwn: true, goalieUserId: null });
  if (g.awayTTeamId) teamSides.push({ tteamId: g.awayTTeamId, hasOwn: true, goalieUserId: null });
  for (const side of teamSides) {
    const exists = g.goalies.find((x) => (side.teamId && x.teamId === side.teamId) || (side.tteamId && x.tournamentTeamId === side.tteamId));
    if (exists) continue;
    await db.insert(goalieAssignments).values({
      gameId,
      teamId: side.teamId ?? null,
      tournamentTeamId: side.tteamId ?? null,
      userId: side.hasOwn ? side.goalieUserId : null,
      source: side.hasOwn && side.goalieUserId ? "TEAM" : side.hasOwn && side.tteamId ? "TEAM" : "POOL",
      // Tournament teams bring their own goalie: treat as confirmed. League team with own goalie: needs confirmation.
      status: side.tteamId ? "CONFIRMED" : side.hasOwn && side.goalieUserId ? "NEEDED" : "NEEDED",
    });
  }
  // refs
  const want = g.season?.refsPerGame ?? 1;
  const have = g.refs.length;
  for (let i = have; i < want; i++) {
    await db.insert(refAssignments).values({ gameId, role: i === 0 ? "HEAD" : "ASSISTANT", status: "NEEDED" });
  }
}

/** Invite a specific goalie to an assignment. */
export async function inviteGoalie(assignmentId: string, userId: string) {
  const a = await db.query.goalieAssignments.findFirst({ where: eq(goalieAssignments.id, assignmentId), with: { team: true, tournamentTeam: true } });
  if (!a) throw new Error("Assignment not found");
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new Error("Goalie not found");
  const { label, ctx, when } = await gameLabel(a.gameId);
  const teamName = a.team?.name ?? a.tournamentTeam?.name ?? "a team";
  await db.update(goalieAssignments).set({ userId, status: "INVITED", invitedAt: new Date(), respondedAt: null, source: a.team?.goalieUserId === userId ? "TEAM" : "POOL" }).where(eq(goalieAssignments.id, assignmentId));
  await notifyUser(user, {
    subject: `Goalie needed: ${teamName}, ${when}`,
    body: `Hi ${user.name.split(" ")[0]}, can you play goalie for ${teamName}?\n${ctx}: ${label}\n${when} at All American.\nReply YES to confirm or NO to pass.\n${appUrl()}/me`,
    context: { kind: "GOALIE_INVITE", assignmentId },
  });
}

/** Find next pool goalie not already declined, not already playing that night, and invite. */
export async function autoFillGoalie(assignmentId: string) {
  const a = await db.query.goalieAssignments.findFirst({ where: eq(goalieAssignments.id, assignmentId), with: { game: true } });
  if (!a) return null;
  const pool = await db.query.users.findMany({ where: and(sql`${users.roles} @> ARRAY['GOALIE']::role[]`, eq(users.active, true)) });
  // goalies already assigned to another game in the same 3-hour window
  const windowStart = new Date(a.game.startsAt.getTime() - 3 * 3600 * 1000);
  const windowEnd = new Date(a.game.startsAt.getTime() + 3 * 3600 * 1000);
  const busyRows = await db
    .select({ userId: goalieAssignments.userId })
    .from(goalieAssignments)
    .innerJoin(games, eq(games.id, goalieAssignments.gameId))
    .where(and(gte(games.startsAt, windowStart), lte(games.startsAt, windowEnd), ne(goalieAssignments.id, assignmentId), inArray(goalieAssignments.status, ["INVITED", "CONFIRMED"])));
  const busy = new Set(busyRows.map((r) => r.userId).filter(Boolean));
  // load-balance: count confirmed games per goalie this month
  const counts = await db
    .select({ userId: goalieAssignments.userId, c: sql<number>`count(*)::int` })
    .from(goalieAssignments)
    .where(eq(goalieAssignments.status, "CONFIRMED"))
    .groupBy(goalieAssignments.userId);
  const countMap = new Map(counts.map((c) => [c.userId, c.c]));
  const candidates = pool
    .filter((u) => !a.declinedUserIds.includes(u.id) && !busy.has(u.id) && u.id !== a.userId && (u.phone || u.email))
    .sort((x, y) => (countMap.get(x.id) ?? 0) - (countMap.get(y.id) ?? 0));
  const next = candidates[0];
  if (!next) {
    await db.update(goalieAssignments).set({ userId: null, status: "NEEDED" }).where(eq(goalieAssignments.id, assignmentId));
    return null;
  }
  await inviteGoalie(assignmentId, next.id);
  return next;
}

export async function respondGoalie(assignmentId: string, userId: string, accept: boolean) {
  const a = await db.query.goalieAssignments.findFirst({ where: eq(goalieAssignments.id, assignmentId) });
  if (!a || a.userId !== userId) return { ok: false };
  if (accept) {
    await db.update(goalieAssignments).set({ status: "CONFIRMED", respondedAt: new Date() }).where(eq(goalieAssignments.id, assignmentId));
    return { ok: true, status: "CONFIRMED" as const };
  }
  await db
    .update(goalieAssignments)
    .set({ status: "DECLINED", respondedAt: new Date(), declinedUserIds: [...a.declinedUserIds, userId] })
    .where(eq(goalieAssignments.id, assignmentId));
  // escalate to pool automatically
  const next = await autoFillGoalie(assignmentId);
  return { ok: true, status: "DECLINED" as const, escalatedTo: next?.name ?? null };
}

// ---------- Referees ----------
export async function inviteRef(assignmentId: string, userId: string) {
  const a = await db.query.refAssignments.findFirst({ where: eq(refAssignments.id, assignmentId) });
  if (!a) throw new Error("Assignment not found");
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new Error("Referee not found");
  const { label, ctx, when } = await gameLabel(a.gameId);
  await db.update(refAssignments).set({ userId, status: "INVITED", invitedAt: new Date(), respondedAt: null }).where(eq(refAssignments.id, assignmentId));
  await notifyUser(user, {
    subject: `Ref assignment: ${when}`,
    body: `Hi ${user.name.split(" ")[0]}, you're assigned to ref ${label} (${ctx}) on ${when} at All American.\nReply YES to confirm or NO if you can't make it.\n${appUrl()}/me`,
    context: { kind: "REF_INVITE", assignmentId },
  });
}

export async function autoFillRef(assignmentId: string) {
  const a = await db.query.refAssignments.findFirst({ where: eq(refAssignments.id, assignmentId), with: { game: true } });
  if (!a) return null;
  const refs = await db.query.users.findMany({ where: and(sql`${users.roles} @> ARRAY['REFEREE']::role[]`, eq(users.active, true)) });
  const windowStart = new Date(a.game.startsAt.getTime() - 90 * 60 * 1000);
  const windowEnd = new Date(a.game.startsAt.getTime() + 90 * 60 * 1000);
  const busyRows = await db
    .select({ userId: refAssignments.userId })
    .from(refAssignments)
    .innerJoin(games, eq(games.id, refAssignments.gameId))
    .where(and(gte(games.startsAt, windowStart), lte(games.startsAt, windowEnd), ne(refAssignments.id, assignmentId), inArray(refAssignments.status, ["INVITED", "CONFIRMED"])));
  const busy = new Set(busyRows.map((r) => r.userId));
  const declined = await db.select({ userId: refAssignments.userId }).from(refAssignments).where(and(eq(refAssignments.gameId, a.gameId), eq(refAssignments.status, "DECLINED")));
  const declinedSet = new Set(declined.map((d) => d.userId));
  const counts = await db.select({ userId: refAssignments.userId, c: sql<number>`count(*)::int` }).from(refAssignments).where(eq(refAssignments.status, "CONFIRMED")).groupBy(refAssignments.userId);
  const countMap = new Map(counts.map((c) => [c.userId, c.c]));
  const next = refs.filter((u) => !busy.has(u.id) && !declinedSet.has(u.id) && u.id !== a.userId && (u.phone || u.email)).sort((x, y) => (countMap.get(x.id) ?? 0) - (countMap.get(y.id) ?? 0))[0];
  if (!next) return null;
  await inviteRef(assignmentId, next.id);
  return next;
}

export async function respondRef(assignmentId: string, userId: string, accept: boolean) {
  const a = await db.query.refAssignments.findFirst({ where: eq(refAssignments.id, assignmentId) });
  if (!a || a.userId !== userId) return { ok: false };
  if (accept) {
    await db.update(refAssignments).set({ status: "CONFIRMED", respondedAt: new Date() }).where(eq(refAssignments.id, assignmentId));
    return { ok: true, status: "CONFIRMED" as const };
  }
  // record decline on this row, then create a fresh row and auto-fill
  await db.update(refAssignments).set({ status: "DECLINED", respondedAt: new Date() }).where(eq(refAssignments.id, assignmentId));
  const [fresh] = await db.insert(refAssignments).values({ gameId: a.gameId, role: a.role, status: "NEEDED" }).returning();
  const next = await autoFillRef(fresh.id);
  return { ok: true, status: "DECLINED" as const, escalatedTo: next?.name ?? null };
}

/** Handle an inbound SMS reply from a phone number. Returns a short reply to send back. */
export async function handleInboundReply(phone: string, bodyRaw: string): Promise<{ reply: string; userId?: string; result: string }> {
  const body = bodyRaw.trim().toUpperCase();
  const user = await db.query.users.findFirst({ where: eq(users.phone, phone) });
  if (!user) return { reply: "We don't recognize this number. Text the rink at (314) 487-4625 or sign in at the app.", result: "unknown number" };

  if (body === "STOP" || body === "UNSUBSCRIBE") {
    await db.update(users).set({ smsOptIn: false }).where(eq(users.id, user.id));
    return { reply: "You've been unsubscribed from All American texts.", userId: user.id, result: "opted out" };
  }
  if (body === "START" || body === "YES START") {
    await db.update(users).set({ smsOptIn: true }).where(eq(users.id, user.id));
    return { reply: "You're subscribed to All American texts.", userId: user.id, result: "opted in" };
  }

  const yes = /^(Y|YES|YEP|YEAH|CONFIRM|IN|OK)\b/.test(body);
  const no = /^(N|NO|NOPE|CAN'T|CANT|OUT|DECLINE|PASS)\b/.test(body);
  if (!yes && !no) return { reply: "Reply YES to confirm or NO to decline your latest assignment. Sign in for details: " + appUrl() + "/me", userId: user.id, result: "unparsed" };

  // most recent pending invite for this user: goalie first, then ref, then RSVP for next game
  const g = await db.query.goalieAssignments.findFirst({ where: and(eq(goalieAssignments.userId, user.id), eq(goalieAssignments.status, "INVITED")), orderBy: (t, { desc }) => [desc(t.invitedAt)] });
  if (g) {
    const r = await respondGoalie(g.id, user.id, yes);
    const { label, when } = await gameLabel(g.gameId);
    return { reply: yes ? `Confirmed: goalie for ${label}, ${when}. Thanks!` : `Got it, we'll find another goalie for ${label}.`, userId: user.id, result: `goalie ${r.status}` };
  }
  const r = await db.query.refAssignments.findFirst({ where: and(eq(refAssignments.userId, user.id), eq(refAssignments.status, "INVITED")), orderBy: (t, { desc }) => [desc(t.invitedAt)] });
  if (r) {
    const res = await respondRef(r.id, user.id, yes);
    const { label, when } = await gameLabel(r.gameId);
    return { reply: yes ? `Confirmed: ref for ${label}, ${when}. Thanks!` : `Got it, we'll reassign ${label}.`, userId: user.id, result: `ref ${res.status}` };
  }
  // RSVP to next game as a player
  const myTeams = await db.select({ teamId: rosterEntries.teamId }).from(rosterEntries).where(eq(rosterEntries.userId, user.id));
  const teamIds = myTeams.map((t) => t.teamId);
  if (teamIds.length) {
    const next = await db.query.games.findFirst({
      where: and(gte(games.startsAt, new Date()), sql`(${games.homeTeamId} = ANY(${teamIds}) OR ${games.awayTeamId} = ANY(${teamIds}))`),
      orderBy: (t, { asc }) => [asc(t.startsAt)],
    });
    if (next) {
      const { rsvps } = await import("@/db/schema");
      await db.insert(rsvps).values({ gameId: next.id, userId: user.id, status: yes ? "IN" : "OUT" }).onConflictDoUpdate({ target: [rsvps.gameId, rsvps.userId], set: { status: yes ? "IN" : "OUT", updatedAt: new Date() } });
      const { label, when } = await gameLabel(next.id);
      return { reply: `${yes ? "You're IN" : "You're OUT"} for ${label}, ${when}.`, userId: user.id, result: `rsvp ${yes ? "IN" : "OUT"}` };
    }
  }
  return { reply: "Nothing pending for you right now. Sign in for your schedule: " + appUrl() + "/me", userId: user.id, result: "nothing pending" };
}

