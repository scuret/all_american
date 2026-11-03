import { NextResponse } from "next/server";
import { db } from "@/db";
import { games, goalieAssignments, refAssignments, rosterEntries, users } from "@/db/schema";
import { and, eq, gte, lte, inArray, lt } from "drizzle-orm";
import { inviteGoalie, autoFillGoalie, autoFillRef, gameLabel } from "@/lib/assignments";
import { notifyUser } from "@/lib/messaging";
import { fmtTime, fmtDate } from "@/lib/format";

/**
 * Daily automation (Vercel Cron hits this with Authorization: Bearer CRON_SECRET).
 * 1. Games in the next 7 days: invite team goalies that haven't been asked, auto-fill pool slots, auto-assign refs.
 * 2. Invites older than 24h with no reply: mark EXPIRED and move to the next person.
 * 3. Games tomorrow: text every rostered player a reminder with YES/NO RSVP.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) return new NextResponse("Unauthorized", { status: 401 });

  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400000);
  const upcoming = await db.query.games.findMany({ where: and(eq(games.status, "SCHEDULED"), gte(games.startsAt, now), lte(games.startsAt, in7)), with: { goalies: true, refs: true } });
  let invites = 0, expired = 0, reminders = 0;

  // 2. expire stale invites (24h, no response)
  const stale = new Date(now.getTime() - 24 * 3600 * 1000);
  for (const g of upcoming) {
    for (const a of g.goalies) {
      if (a.status === "INVITED" && a.invitedAt && a.invitedAt < stale && a.source === "POOL") {
        await db.update(goalieAssignments).set({ status: "DECLINED", declinedUserIds: a.userId ? [...a.declinedUserIds, a.userId] : a.declinedUserIds }).where(eq(goalieAssignments.id, a.id));
        expired++;
      }
    }
    for (const r of g.refs) {
      if (r.status === "INVITED" && r.invitedAt && r.invitedAt < stale) {
        await db.update(refAssignments).set({ status: "DECLINED" }).where(eq(refAssignments.id, r.id));
        await db.insert(refAssignments).values({ gameId: g.id, role: r.role, status: "NEEDED" });
        expired++;
      }
    }
  }

  // 1. fill gaps
  const refreshed = await db.query.games.findMany({ where: and(eq(games.status, "SCHEDULED"), gte(games.startsAt, now), lte(games.startsAt, in7)), with: { goalies: true, refs: true } });
  for (const g of refreshed) {
    for (const a of g.goalies) {
      if (a.status === "NEEDED" && a.source === "TEAM" && a.userId) { await inviteGoalie(a.id, a.userId); invites++; }
      else if (a.status === "NEEDED" || a.status === "DECLINED") { if (await autoFillGoalie(a.id)) invites++; }
    }
    for (const r of g.refs) if (r.status === "NEEDED") { if (await autoFillRef(r.id)) invites++; }
  }

  // 3. reminders for tomorrow's games
  const tStart = new Date(now.getTime() + 24 * 3600 * 1000);
  const tEnd = new Date(now.getTime() + 48 * 3600 * 1000);
  const tomorrow = await db.query.games.findMany({ where: and(eq(games.status, "SCHEDULED"), gte(games.startsAt, tStart), lt(games.startsAt, tEnd)) });
  for (const g of tomorrow) {
    const teamIds = [g.homeTeamId, g.awayTeamId].filter(Boolean) as string[];
    if (!teamIds.length) continue;
    const roster = await db.query.rosterEntries.findMany({ where: inArray(rosterEntries.teamId, teamIds), with: { user: true } });
    const { label } = await gameLabel(g.id);
    for (const r of roster) {
      if (!r.user.active) continue;
      await notifyUser(r.user, { subject: `Game tomorrow: ${label}`, body: `Game tomorrow: ${label}, ${fmtDate(g.startsAt)} at ${fmtTime(g.startsAt)} at All American. Reply YES if you're in, NO if you're out.`, context: { kind: "GAME_REMINDER", gameId: g.id } });
      reminders++;
    }
  }

  return NextResponse.json({ ok: true, invites, expired, reminders, ran: now.toISOString() });
}

