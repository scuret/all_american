import "server-only";
import { db } from "@/db";
import { users, rosterEntries, teams, seasons, tournamentTeams, games, type User } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

export type AudienceType = "ALL" | "LEAGUE" | "SEASON" | "TEAM" | "REFEREES" | "GOALIES" | "TOURNAMENT" | "GAME" | "USERS";

/** Resolve an audience to a de-duplicated list of users. */
export async function resolveAudience(type: AudienceType, id?: string | null): Promise<User[]> {
  const active = eq(users.active, true);
  switch (type) {
    case "ALL":
      return db.query.users.findMany({ where: active });
    case "REFEREES":
      return db.query.users.findMany({ where: and(active, sql`${users.roles} @> ARRAY['REFEREE']::role[]`) });
    case "GOALIES":
      return db.query.users.findMany({ where: and(active, sql`${users.roles} @> ARRAY['GOALIE']::role[]`) });
    case "USERS":
      return id ? db.query.users.findMany({ where: and(active, inArray(users.id, id.split(","))) }) : [];
    case "TEAM": {
      if (!id) return [];
      const rows = await db.query.rosterEntries.findMany({ where: eq(rosterEntries.teamId, id), with: { user: true } });
      return dedupe(rows.map((r) => r.user));
    }
    case "SEASON": {
      if (!id) return [];
      const t = await db.select({ id: teams.id }).from(teams).where(eq(teams.seasonId, id));
      if (!t.length) return [];
      const rows = await db.query.rosterEntries.findMany({ where: inArray(rosterEntries.teamId, t.map((x) => x.id)), with: { user: true } });
      return dedupe(rows.map((r) => r.user));
    }
    case "LEAGUE": {
      if (!id) return [];
      const s = await db.select({ id: seasons.id }).from(seasons).where(and(eq(seasons.leagueId, id), inArray(seasons.status, ["ACTIVE", "REGISTRATION"])));
      if (!s.length) return [];
      const t = await db.select({ id: teams.id }).from(teams).where(inArray(teams.seasonId, s.map((x) => x.id)));
      if (!t.length) return [];
      const rows = await db.query.rosterEntries.findMany({ where: inArray(rosterEntries.teamId, t.map((x) => x.id)), with: { user: true } });
      return dedupe(rows.map((r) => r.user));
    }
    case "TOURNAMENT": {
      if (!id) return [];
      const tt = await db.query.tournamentTeams.findMany({ where: eq(tournamentTeams.tournamentId, id) });
      // contacts: linked users, or synthesize from contact fields
      const linked = tt.filter((x) => x.contactUserId).map((x) => x.contactUserId!);
      const linkedUsers = linked.length ? await db.query.users.findMany({ where: inArray(users.id, linked) }) : [];
      const synth: User[] = tt.filter((x) => !x.contactUserId).map((x) => ({ id: `tt_${x.id}`, name: x.contactName, email: x.contactEmail, phone: x.contactPhone, roles: [], smsOptIn: true, emailOptIn: true, birthYear: null, emergencyContact: null, notes: null, active: true, createdAt: x.createdAt }));
      return dedupe([...linkedUsers, ...synth]);
    }
    case "GAME": {
      if (!id) return [];
      const g = await db.query.games.findFirst({ where: eq(games.id, id) });
      if (!g) return [];
      const ids = [g.homeTeamId, g.awayTeamId].filter(Boolean) as string[];
      if (!ids.length) return [];
      const rows = await db.query.rosterEntries.findMany({ where: inArray(rosterEntries.teamId, ids), with: { user: true } });
      return dedupe(rows.map((r) => r.user));
    }
  }
}

function dedupe(list: User[]) {
  const seen = new Set<string>();
  return list.filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true)));
}

export async function audienceLabel(type: AudienceType, id?: string | null) {
  switch (type) {
    case "ALL": return "Everyone";
    case "REFEREES": return "All referees";
    case "GOALIES": return "Goalie pool";
    case "USERS": return id ? `${id.split(",").length} selected` : "Selected people";
    case "TEAM": { const t = id ? await db.query.teams.findFirst({ where: eq(teams.id, id) }) : null; return t ? `Team: ${t.name}` : "Team"; }
    case "SEASON": { const s = id ? await db.query.seasons.findFirst({ where: eq(seasons.id, id), with: { league: true } }) : null; return s ? `${s.league.name} · ${s.name}` : "Season"; }
    case "LEAGUE": { const l = id ? await db.query.leagues.findFirst({ where: (t, { eq }) => eq(t.id, id) }) : null; return l ? `League: ${l.name}` : "League"; }
    case "TOURNAMENT": { const t = id ? await db.query.tournaments.findFirst({ where: (x, { eq }) => eq(x.id, id) }) : null; return t ? `Tournament: ${t.name}` : "Tournament"; }
    case "GAME": return "Both teams in a game";
  }
}
