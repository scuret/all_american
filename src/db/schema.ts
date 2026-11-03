import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  pgEnum,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@/lib/id";

// ---------- Enums ----------
export const roleEnum = pgEnum("role", [
  "ADMIN",
  "STAFF",
  "CAPTAIN",
  "PLAYER",
  "REFEREE",
  "GOALIE",
]);
export const leagueTypeEnum = pgEnum("league_type", ["ADULT", "YOUTH"]);
export const seasonStatusEnum = pgEnum("season_status", [
  "DRAFT",
  "REGISTRATION",
  "ACTIVE",
  "COMPLETE",
]);
export const gameStatusEnum = pgEnum("game_status", [
  "SCHEDULED",
  "FINAL",
  "CANCELED",
  "POSTPONED",
]);
export const assignmentStatusEnum = pgEnum("assignment_status", [
  "NEEDED",
  "INVITED",
  "CONFIRMED",
  "DECLINED",
  "EXPIRED",
]);
export const goalieSourceEnum = pgEnum("goalie_source", ["TEAM", "POOL"]);
export const refRoleEnum = pgEnum("ref_role", ["HEAD", "ASSISTANT"]);
export const rsvpEnum = pgEnum("rsvp_status", ["IN", "OUT", "MAYBE"]);
export const tournamentFormatEnum = pgEnum("tournament_format", [
  "POOL_TO_BRACKET",
  "ROUND_ROBIN",
]);
export const tournamentStatusEnum = pgEnum("tournament_status", [
  "DRAFT",
  "REGISTRATION",
  "POOL_PLAY",
  "BRACKET",
  "COMPLETE",
]);
export const feeStatusEnum = pgEnum("fee_status", [
  "UNPAID",
  "DEPOSIT",
  "PAID",
  "WAIVED",
]);
export const cadenceEnum = pgEnum("cadence", [
  "DAILY",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "ONCE",
]);
export const ticketStatusEnum = pgEnum("ticket_status", [
  "OPEN",
  "IN_PROGRESS",
  "CLOSED",
]);
export const priorityEnum = pgEnum("priority", ["LOW", "NORMAL", "HIGH", "URGENT"]);
export const channelEnum = pgEnum("channel", ["SMS", "EMAIL"]);
export const deliveryStatusEnum = pgEnum("delivery_status", [
  "QUEUED",
  "SENT",
  "DELIVERED",
  "FAILED",
  "DEV",
]);
export const audienceEnum = pgEnum("audience_type", [
  "ALL",
  "LEAGUE",
  "SEASON",
  "TEAM",
  "REFEREES",
  "GOALIES",
  "TOURNAMENT",
  "GAME",
  "USERS",
]);

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

// ---------- People ----------
export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"), // E.164
    roles: roleEnum("roles").array().notNull().default([]),
    smsOptIn: boolean("sms_opt_in").notNull().default(false),
    emailOptIn: boolean("email_opt_in").notNull().default(true),
    birthYear: integer("birth_year"),
    emergencyContact: text("emergency_contact"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    uniqueIndex("users_phone_idx").on(t.phone),
  ]
);

export const loginTokens = pgTable("login_tokens", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  channel: channelEnum("channel").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ---------- Leagues ----------
export const leagues = pgTable("leagues", {
  id: id(),
  name: text("name").notNull(),
  type: leagueTypeEnum("type").notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0 = Sunday
  skillLevel: text("skill_level"), // "All Levels", "B/C", "Over 30", "12U"...
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const seasons = pgTable("seasons", {
  id: id(),
  leagueId: text("league_id")
    .notNull()
    .references(() => leagues.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // "Winter 2026"
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  gamesPerTeam: integer("games_per_team").notNull().default(10),
  timeSlots: jsonb("time_slots").$type<string[]>().notNull().default(["19:00", "20:15", "21:30"]),
  gameMinutes: integer("game_minutes").notNull().default(75),
  teamFeeCents: integer("team_fee_cents").notNull().default(120000),
  depositCents: integer("deposit_cents").notNull().default(60000),
  refsPerGame: integer("refs_per_game").notNull().default(1),
  blackoutDates: jsonb("blackout_dates").$type<string[]>().notNull().default([]), // YYYY-MM-DD
  status: seasonStatusEnum("status").notNull().default("DRAFT"),
  createdAt: createdAt(),
});

export const teams = pgTable("teams", {
  id: id(),
  seasonId: text("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#B00000"),
  captainId: text("captain_id").references(() => users.id, { onDelete: "set null" }),
  hasOwnGoalie: boolean("has_own_goalie").notNull().default(false),
  goalieUserId: text("goalie_user_id").references(() => users.id, { onDelete: "set null" }),
  feeStatus: feeStatusEnum("fee_status").notNull().default("UNPAID"),
  feePaidCents: integer("fee_paid_cents").notNull().default(0),
  isNew: boolean("is_new").notNull().default(false),
  createdAt: createdAt(),
});

export const rosterEntries = pgTable(
  "roster_entries",
  {
    id: id(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jerseyNumber: text("jersey_number"),
    position: text("position"), // F, D, G
    waiverSigned: boolean("waiver_signed").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("roster_team_user_idx").on(t.teamId, t.userId)]
);

// ---------- Tournaments ----------
export const tournaments = pgTable("tournaments", {
  id: id(),
  name: text("name").notNull(),
  division: text("division"), // "Adult B", "12U"
  format: tournamentFormatEnum("format").notNull().default("POOL_TO_BRACKET"),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  timeSlots: jsonb("time_slots").$type<string[]>().notNull().default(["08:00", "09:15", "10:30", "11:45", "13:00", "14:15", "15:30", "16:45", "18:00"]),
  gameMinutes: integer("game_minutes").notNull().default(60),
  entryFeeCents: integer("entry_fee_cents").notNull().default(0),
  maxTeams: integer("max_teams").notNull().default(8),
  poolCount: integer("pool_count").notNull().default(2),
  bracketSize: integer("bracket_size").notNull().default(4),
  registrationOpen: boolean("registration_open").notNull().default(true),
  description: text("description"),
  status: tournamentStatusEnum("status").notNull().default("REGISTRATION"),
  createdAt: createdAt(),
});

export const pools = pgTable("pools", {
  id: id(),
  tournamentId: text("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // "A"
  sortOrder: integer("sort_order").notNull().default(0),
});

export const tournamentTeams = pgTable("tournament_teams", {
  id: id(),
  tournamentId: text("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  poolId: text("pool_id").references(() => pools.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  contactUserId: text("contact_user_id").references(() => users.id, { onDelete: "set null" }),
  roster: text("roster"), // free text, one player per line
  seed: integer("seed"),
  feeStatus: feeStatusEnum("fee_status").notNull().default("UNPAID"),
  approved: boolean("approved").notNull().default(false),
  createdAt: createdAt(),
});

// ---------- Games ----------
export const games = pgTable(
  "games",
  {
    id: id(),
    seasonId: text("season_id").references(() => seasons.id, { onDelete: "cascade" }),
    tournamentId: text("tournament_id").references(() => tournaments.id, { onDelete: "cascade" }),
    poolId: text("pool_id").references(() => pools.id, { onDelete: "set null" }),
    // league games
    homeTeamId: text("home_team_id").references(() => teams.id, { onDelete: "cascade" }),
    awayTeamId: text("away_team_id").references(() => teams.id, { onDelete: "cascade" }),
    // tournament games
    homeTTeamId: text("home_tteam_id").references(() => tournamentTeams.id, { onDelete: "set null" }),
    awayTTeamId: text("away_tteam_id").references(() => tournamentTeams.id, { onDelete: "set null" }),
    homeLabel: text("home_label"), // placeholder e.g. "Pool A #1"
    awayLabel: text("away_label"),
    bracketRound: integer("bracket_round"), // 1 = first round
    bracketSlot: integer("bracket_slot"),
    week: integer("week"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(75),
    status: gameStatusEnum("status").notNull().default("SCHEDULED"),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("games_starts_idx").on(t.startsAt), index("games_season_idx").on(t.seasonId)]
);

export const refAssignments = pgTable("ref_assignments", {
  id: id(),
  gameId: text("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  role: refRoleEnum("role").notNull().default("HEAD"),
  status: assignmentStatusEnum("status").notNull().default("NEEDED"),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const goalieAssignments = pgTable("goalie_assignments", {
  id: id(),
  gameId: text("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  tournamentTeamId: text("tournament_team_id").references(() => tournamentTeams.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  source: goalieSourceEnum("source").notNull().default("TEAM"),
  status: assignmentStatusEnum("status").notNull().default("NEEDED"),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  declinedUserIds: jsonb("declined_user_ids").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
});

export const rsvps = pgTable(
  "rsvps",
  {
    id: id(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: rsvpEnum("status").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("rsvp_game_user_idx").on(t.gameId, t.userId)]
);

// ---------- Maintenance ----------
export const maintenanceTasks = pgTable("maintenance_tasks", {
  id: id(),
  title: text("title").notNull(),
  description: text("description"),
  checklist: jsonb("checklist").$type<string[]>().notNull().default([]),
  cadence: cadenceEnum("cadence").notNull().default("WEEKLY"),
  assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
  nextDueAt: timestamp("next_due_at", { withTimezone: true }).notNull(),
  estimatedMinutes: integer("estimated_minutes"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const maintenanceLogs = pgTable("maintenance_logs", {
  id: id(),
  taskId: text("task_id")
    .notNull()
    .references(() => maintenanceTasks.id, { onDelete: "cascade" }),
  completedById: text("completed_by_id").references(() => users.id, { onDelete: "set null" }),
  completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
  notes: text("notes"),
});

export const rinkBlocks = pgTable("rink_blocks", {
  id: id(),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("MAINTENANCE"), // MAINTENANCE | RENTAL | EVENT | CLOSED
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const equipment = pgTable("equipment", {
  id: id(),
  name: text("name").notNull(),
  category: text("category").notNull(), // Nets, Rental Gear, Scoreboard, Floor, Glass
  quantity: integer("quantity").notNull().default(1),
  condition: text("condition").notNull().default("GOOD"), // GOOD | FAIR | POOR | OUT_OF_SERVICE
  location: text("location"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const repairTickets = pgTable("repair_tickets", {
  id: id(),
  equipmentId: text("equipment_id").references(() => equipment.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  priority: priorityEnum("priority").notNull().default("NORMAL"),
  status: ticketStatusEnum("status").notNull().default("OPEN"),
  reportedById: text("reported_by_id").references(() => users.id, { onDelete: "set null" }),
  assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ---------- Messaging ----------
export const messages = pgTable("messages", {
  id: id(),
  channel: channelEnum("channel").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  audienceType: audienceEnum("audience_type").notNull(),
  audienceId: text("audience_id"),
  sentById: text("sent_by_id").references(() => users.id, { onDelete: "set null" }),
  recipientCount: integer("recipient_count").notNull().default(0),
  createdAt: createdAt(),
});

export const deliveries = pgTable("deliveries", {
  id: id(),
  messageId: text("message_id").references(() => messages.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  channel: channelEnum("channel").notNull(),
  to: text("to").notNull(),
  body: text("body").notNull(),
  subject: text("subject"),
  status: deliveryStatusEnum("status").notNull().default("QUEUED"),
  providerId: text("provider_id"),
  error: text("error"),
  context: jsonb("context").$type<Record<string, string>>(), // e.g. { kind: "GOALIE_INVITE", assignmentId }
  createdAt: createdAt(),
});

export const inboundMessages = pgTable("inbound_messages", {
  id: id(),
  channel: channelEnum("channel").notNull().default("SMS"),
  from: text("from").notNull(),
  body: text("body").notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  handled: boolean("handled").notNull().default(false),
  result: text("result"),
  providerId: text("provider_id"),
  createdAt: createdAt(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
});

// ---------- Relations ----------
export const usersRelations = relations(users, ({ many }) => ({
  roster: many(rosterEntries),
  refAssignments: many(refAssignments),
  goalieAssignments: many(goalieAssignments),
}));
export const leaguesRelations = relations(leagues, ({ many }) => ({ seasons: many(seasons) }));
export const seasonsRelations = relations(seasons, ({ one, many }) => ({
  league: one(leagues, { fields: [seasons.leagueId], references: [leagues.id] }),
  teams: many(teams),
  games: many(games),
}));
export const teamsRelations = relations(teams, ({ one, many }) => ({
  season: one(seasons, { fields: [teams.seasonId], references: [seasons.id] }),
  captain: one(users, { fields: [teams.captainId], references: [users.id], relationName: "captain" }),
  goalie: one(users, { fields: [teams.goalieUserId], references: [users.id], relationName: "goalie" }),
  roster: many(rosterEntries),
}));
export const rosterRelations = relations(rosterEntries, ({ one }) => ({
  team: one(teams, { fields: [rosterEntries.teamId], references: [teams.id] }),
  user: one(users, { fields: [rosterEntries.userId], references: [users.id] }),
}));
export const gamesRelations = relations(games, ({ one, many }) => ({
  season: one(seasons, { fields: [games.seasonId], references: [seasons.id] }),
  tournament: one(tournaments, { fields: [games.tournamentId], references: [tournaments.id] }),
  pool: one(pools, { fields: [games.poolId], references: [pools.id] }),
  homeTeam: one(teams, { fields: [games.homeTeamId], references: [teams.id], relationName: "home" }),
  awayTeam: one(teams, { fields: [games.awayTeamId], references: [teams.id], relationName: "away" }),
  homeTTeam: one(tournamentTeams, { fields: [games.homeTTeamId], references: [tournamentTeams.id], relationName: "thome" }),
  awayTTeam: one(tournamentTeams, { fields: [games.awayTTeamId], references: [tournamentTeams.id], relationName: "taway" }),
  refs: many(refAssignments),
  goalies: many(goalieAssignments),
  rsvps: many(rsvps),
}));
export const refAssignmentsRelations = relations(refAssignments, ({ one }) => ({
  game: one(games, { fields: [refAssignments.gameId], references: [games.id] }),
  user: one(users, { fields: [refAssignments.userId], references: [users.id] }),
}));
export const goalieAssignmentsRelations = relations(goalieAssignments, ({ one }) => ({
  game: one(games, { fields: [goalieAssignments.gameId], references: [games.id] }),
  user: one(users, { fields: [goalieAssignments.userId], references: [users.id] }),
  team: one(teams, { fields: [goalieAssignments.teamId], references: [teams.id] }),
  tournamentTeam: one(tournamentTeams, { fields: [goalieAssignments.tournamentTeamId], references: [tournamentTeams.id] }),
}));
export const rsvpsRelations = relations(rsvps, ({ one }) => ({
  game: one(games, { fields: [rsvps.gameId], references: [games.id] }),
  user: one(users, { fields: [rsvps.userId], references: [users.id] }),
}));
export const tournamentsRelations = relations(tournaments, ({ many }) => ({
  teams: many(tournamentTeams),
  pools: many(pools),
  games: many(games),
}));
export const poolsRelations = relations(pools, ({ one, many }) => ({
  tournament: one(tournaments, { fields: [pools.tournamentId], references: [tournaments.id] }),
  teams: many(tournamentTeams),
}));
export const tournamentTeamsRelations = relations(tournamentTeams, ({ one }) => ({
  tournament: one(tournaments, { fields: [tournamentTeams.tournamentId], references: [tournaments.id] }),
  pool: one(pools, { fields: [tournamentTeams.poolId], references: [pools.id] }),
}));
export const maintenanceTasksRelations = relations(maintenanceTasks, ({ one, many }) => ({
  assignee: one(users, { fields: [maintenanceTasks.assigneeId], references: [users.id] }),
  logs: many(maintenanceLogs),
}));
export const maintenanceLogsRelations = relations(maintenanceLogs, ({ one }) => ({
  task: one(maintenanceTasks, { fields: [maintenanceLogs.taskId], references: [maintenanceTasks.id] }),
  completedBy: one(users, { fields: [maintenanceLogs.completedById], references: [users.id] }),
}));
export const repairTicketsRelations = relations(repairTickets, ({ one }) => ({
  equipment: one(equipment, { fields: [repairTickets.equipmentId], references: [equipment.id] }),
  reportedBy: one(users, { fields: [repairTickets.reportedById], references: [users.id], relationName: "reporter" }),
  assignee: one(users, { fields: [repairTickets.assigneeId], references: [users.id], relationName: "assignee" }),
}));
export const messagesRelations = relations(messages, ({ one, many }) => ({
  sentBy: one(users, { fields: [messages.sentById], references: [users.id] }),
  deliveries: many(deliveries),
}));
export const deliveriesRelations = relations(deliveries, ({ one }) => ({
  message: one(messages, { fields: [deliveries.messageId], references: [messages.id] }),
  user: one(users, { fields: [deliveries.userId], references: [users.id] }),
}));
export const inboundRelations = relations(inboundMessages, ({ one }) => ({
  user: one(users, { fields: [inboundMessages.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Role = User["roles"][number];
export type Game = typeof games.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Season = typeof seasons.$inferSelect;
export type League = typeof leagues.$inferSelect;
export type Tournament = typeof tournaments.$inferSelect;
export type TournamentTeam = typeof tournamentTeams.$inferSelect;
