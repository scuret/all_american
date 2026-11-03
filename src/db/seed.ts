/* Seed realistic demo data. Run: npm run db:seed (wipes existing data). */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as s from "./schema";
import { roundRobin, layoutSeason } from "../lib/schedule";
import { addDays, addHours, setHours, setMinutes, startOfDay, subDays } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { sql } from "drizzle-orm";

const TZ = "America/Chicago";
type SeedDb = ReturnType<typeof drizzle<typeof s>>;

const FIRST = ["Jake", "Tyler", "Matt", "Chris", "Ryan", "Nick", "Josh", "Kyle", "Brandon", "Zach", "Austin", "Drew", "Cody", "Derek", "Evan", "Sean", "Alex", "Brett", "Colin", "Dan", "Eric", "Grant", "Ian", "Jordan", "Kevin", "Logan", "Mike", "Nate", "Owen", "Pat", "Quinn", "Rob", "Sam", "Tom", "Vince", "Will", "Aaron", "Ben", "Cole", "Dylan", "Mason", "Liam", "Noah", "Ethan", "Lucas", "Jackson", "Carter", "Wyatt", "Hunter", "Blake", "Maya", "Emma", "Ava", "Sophia", "Olivia", "Riley", "Kate", "Sara", "Jenna", "Lauren"];
const LAST = ["Schmidt", "Meyer", "Mueller", "Koenig", "Becker", "Wagner", "Fischer", "Weber", "Schaefer", "Hoffman", "Klein", "Wolf", "Braun", "Zimmerman", "Krueger", "Hartmann", "Lange", "Werner", "Krause", "Lehmann", "Kelly", "Murphy", "O'Brien", "Walsh", "Ryan", "Sullivan", "Burke", "Doyle", "Nguyen", "Garcia", "Martinez", "Rodriguez", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Wilson", "Anderson", "Taylor", "Thomas", "Moore", "Jackson", "Martin", "Lee", "Thompson", "White", "Harris", "Clark"];
let seedIdx = 7;
function rnd(n: number) { seedIdx = (seedIdx * 9301 + 49297) % 233280; return Math.floor((seedIdx / 233280) * n); }
function pick<T>(a: T[]) { return a[rnd(a.length)]; }
let phoneCounter = 5550100;
function nextPhone() { return `+1314${phoneCounter++}`; }
const usedNames = new Set<string>();
function person(roles: s.Role[], opts: Partial<typeof s.users.$inferInsert> = {}) {
  let name = "";
  do { name = `${pick(FIRST)} ${pick(LAST)}`; } while (usedNames.has(name));
  usedNames.add(name);
  const email = `${name.toLowerCase().replace(/[^a-z]/g, ".")}@example.com`;
  return { name, email, phone: nextPhone(), roles, smsOptIn: true, emailOptIn: true, ...opts } as typeof s.users.$inferInsert;
}

const TEAM_NAMES = ["Ice Pirates", "Rink Rats", "Red Line", "Night Shift", "Puck Dynasty", "The Grinders", "Gateway Sting", "Arch Rivals", "South County Snipers", "Mound City Mayhem", "Top Shelf", "Dirty Dangles", "Benchwarmers", "Blue Liners", "Crease Lightning", "Slapshot Social", "Meramec Mustangs", "Lemay Lightning", "Oakville Outlaws", "Affton Avalanche", "Kirkwood Kings", "Fenton Flyers", "Arnold Admirals", "Webster Wolves", "Jefferson Barracks", "Riverfront Rush", "Tower Grove Titans", "Shrewsbury Sharks"];
let teamNameIdx = 0;
let pIdx = 0;
function teamName() { return TEAM_NAMES[teamNameIdx++ % TEAM_NAMES.length]; }
const COLORS = ["#B00000", "#0C71C3", "#1F8A3D", "#111111", "#C7811A", "#5B2C83", "#0B7285", "#E02B20"];

export async function runSeed(db: SeedDb) {
  seedIdx = 7; phoneCounter = 5550100; usedNames.clear(); teamNameIdx = 0; pIdx = 0;
  console.log("Wiping…");
  await db.execute(sql`TRUNCATE users, leagues, tournaments, maintenance_tasks, rink_blocks, equipment, messages, inbound_messages, settings RESTART IDENTITY CASCADE`);

  // ---------- People ----------
  const [admin] = await db.insert(s.users).values({ name: "Stephen Curet", email: "scuret@gmail.com", phone: "+19048601980", roles: ["ADMIN"], smsOptIn: true }).returning();
  const [staff] = await db.insert(s.users).values(person(["STAFF"], { name: "Rink Office", email: "allamericanhockey85@gmail.com", phone: "+13144874625" })).returning();
  const refs = await db.insert(s.users).values(Array.from({ length: 7 }, () => person(["REFEREE"]))).returning();
  const goalies = await db.insert(s.users).values(Array.from({ length: 8 }, () => person(["GOALIE"]))).returning();
  const playersPool = await db.insert(s.users).values(Array.from({ length: 480 }, () => person(["PLAYER"]))).returning();
  pIdx = 0;
  const takePlayers = (n: number) => playersPool.slice(pIdx, (pIdx += n));
  const now = new Date();

  // ---------- Leagues ----------
  const leagueDefs: (typeof s.leagues.$inferInsert)[] = [
    { name: "Sunday Adult", type: "ADULT", dayOfWeek: 0, skillLevel: "All Levels", sortOrder: 1 },
    { name: "Monday Over 30", type: "ADULT", dayOfWeek: 1, skillLevel: "Over 30", sortOrder: 2 },
    { name: "Tuesday B/C", type: "ADULT", dayOfWeek: 2, skillLevel: "B/C", sortOrder: 3 },
    { name: "Wednesday Adult", type: "ADULT", dayOfWeek: 3, skillLevel: "All Levels", sortOrder: 4 },
    { name: "Thursday Adult", type: "ADULT", dayOfWeek: 4, skillLevel: "All Levels", sortOrder: 5 },
    { name: "Open / 8U", type: "YOUTH", dayOfWeek: 5, skillLevel: "Open (8U + new players)", sortOrder: 6 },
    { name: "12U", type: "YOUTH", dayOfWeek: 6, skillLevel: "12U", sortOrder: 7 },
    { name: "14U", type: "YOUTH", dayOfWeek: 6, skillLevel: "14U", sortOrder: 8 },
    { name: "16U / High School", type: "YOUTH", dayOfWeek: 6, skillLevel: "16U/HS", sortOrder: 9 },
  ];
  const leagues = await db.insert(s.leagues).values(leagueDefs).returning();

  // maintenance blocks (so the generator has something to dodge)
  const blockStart = fromZonedTime(setMinutes(setHours(startOfDay(addDays(now, 10)), 18), 0), TZ);
  const blocks = await db.insert(s.rinkBlocks).values([
    { title: "Floor deep clean + line repaint", kind: "MAINTENANCE", startsAt: blockStart, endsAt: addHours(blockStart, 5), notes: "Vendor on site. No skating." },
    { title: "Birthday party rental", kind: "RENTAL", startsAt: fromZonedTime(setMinutes(setHours(startOfDay(addDays(now, 5)), 13), 0), TZ), endsAt: fromZonedTime(setMinutes(setHours(startOfDay(addDays(now, 5)), 15), 0), TZ) },
    { title: "Thanksgiving: rink closed", kind: "CLOSED", startsAt: fromZonedTime(new Date(2026, 10, 26, 0, 0), TZ), endsAt: fromZonedTime(new Date(2026, 10, 27, 0, 0), TZ) },
  ]).returning();

  // ---------- Seasons, teams, schedules ----------
  const seasonStart = subDays(now, 21); // 3 weeks in
  const adultSlots = ["19:00", "20:15", "21:30"];
  const youthSlotsSat = ["09:00", "10:15", "11:30", "12:45", "14:00"];
  const youthSlotsFri = ["17:30", "18:45"];

  for (const lg of leagues) {
    const isAdult = lg.type === "ADULT";
    const teamCount = isAdult ? 6 : lg.name.startsWith("Open") ? 4 : 5;
    const [season] = await db.insert(s.seasons).values({
      leagueId: lg.id,
      name: "Winter 2026",
      startDate: seasonStart,
      gamesPerTeam: isAdult ? 10 : 8,
      timeSlots: isAdult ? adultSlots : lg.dayOfWeek === 5 ? youthSlotsFri : youthSlotsSat,
      gameMinutes: isAdult ? 75 : 60,
      teamFeeCents: isAdult ? (lg.dayOfWeek === 0 ? 120000 : 125000) : 0,
      depositCents: isAdult ? 60000 : 0,
      refsPerGame: 1,
      blackoutDates: ["2026-11-26", "2026-12-24", "2026-12-25", "2026-12-31", "2027-01-01"],
      status: "ACTIVE",
    }).returning();

    const teams: s.Team[] = [];
    for (let i = 0; i < teamCount; i++) {
      const rosterUsers = takePlayers(isAdult ? 9 : 10);
      const captain = rosterUsers[0];
      await db.update(s.users).set({ roles: isAdult ? ["PLAYER", "CAPTAIN"] : ["PLAYER", "CAPTAIN"] }).where(sql`${s.users.id} = ${captain.id}`);
      const hasOwnGoalie = rnd(10) < 7;
      let goalieUserId: string | null = null;
      if (hasOwnGoalie) {
        // make the last roster player a goalie
        const g = rosterUsers[rosterUsers.length - 1];
        await db.update(s.users).set({ roles: ["PLAYER", "GOALIE"] }).where(sql`${s.users.id} = ${g.id}`);
        goalieUserId = g.id;
      }
      const feeRoll = rnd(10);
      const [team] = await db.insert(s.teams).values({
        seasonId: season.id,
        name: teamName(),
        color: COLORS[i % COLORS.length],
        captainId: captain.id,
        hasOwnGoalie,
        goalieUserId,
        isNew: i === teamCount - 1,
        feeStatus: !isAdult ? "WAIVED" : feeRoll < 6 ? "PAID" : feeRoll < 8 ? "DEPOSIT" : "UNPAID",
        feePaidCents: !isAdult ? 0 : feeRoll < 6 ? season.teamFeeCents : feeRoll < 8 ? 60000 : 0,
      }).returning();
      teams.push(team);
      await db.insert(s.rosterEntries).values(rosterUsers.map((u, j) => ({ teamId: team.id, userId: u.id, jerseyNumber: String(2 + j * 7 % 89), position: j === rosterUsers.length - 1 && hasOwnGoalie ? "G" : j % 3 === 0 ? "D" : "F", waiverSigned: rnd(10) < 9 })));
    }

    const pairings = roundRobin(teams.map((t) => t.id), season.gamesPerTeam);
    const plan = layoutSeason({ pairings, startDate: season.startDate, dayOfWeek: lg.dayOfWeek, timeSlots: season.timeSlots, gameMinutes: season.gameMinutes, blackoutDates: season.blackoutDates, blockers: blocks.map((b) => ({ startsAt: b.startsAt, endsAt: b.endsAt })) });
    for (const p of plan) {
      const past = p.date < now;
      const hs = past ? rnd(8) : null;
      const as = past ? rnd(8) : null;
      const [game] = await db.insert(s.games).values({ seasonId: season.id, homeTeamId: p.home, awayTeamId: p.away, week: p.week, startsAt: p.date, durationMinutes: season.gameMinutes, status: past ? "FINAL" : "SCHEDULED", homeScore: hs, awayScore: as }).returning();
      // goalie slots
      for (const tid of [p.home, p.away]) {
        const t = teams.find((x) => x.id === tid)!;
        const daysOut = (p.date.getTime() - now.getTime()) / 86400000;
        let status: s.Game["status"] extends never ? never : "NEEDED" | "INVITED" | "CONFIRMED" | "DECLINED" = "NEEDED";
        let userId: string | null = t.goalieUserId;
        let source: "TEAM" | "POOL" = t.hasOwnGoalie ? "TEAM" : "POOL";
        if (past) { status = "CONFIRMED"; if (!userId) userId = pick(goalies).id; }
        else if (t.hasOwnGoalie) { status = daysOut < 7 ? (rnd(10) < 8 ? "CONFIRMED" : "INVITED") : "NEEDED"; }
        else {
          // pool fill
          if (daysOut < 7) { const r = rnd(10); if (r < 5) { status = "CONFIRMED"; userId = pick(goalies).id; } else if (r < 8) { status = "INVITED"; userId = pick(goalies).id; } else status = "NEEDED"; }
          source = "POOL";
        }
        await db.insert(s.goalieAssignments).values({ gameId: game.id, teamId: tid, userId, source, status, invitedAt: status === "INVITED" || status === "CONFIRMED" ? subDays(now, 1) : null, respondedAt: status === "CONFIRMED" ? now : null });
      }
      // ref slot
      const daysOut = (p.date.getTime() - now.getTime()) / 86400000;
      const rstatus = past ? "CONFIRMED" : daysOut < 10 ? (rnd(10) < 7 ? "CONFIRMED" : rnd(2) ? "INVITED" : "NEEDED") : "NEEDED";
      await db.insert(s.refAssignments).values({ gameId: game.id, role: "HEAD", userId: rstatus === "NEEDED" ? null : pick(refs).id, status: rstatus, invitedAt: rstatus !== "NEEDED" ? subDays(now, 2) : null, respondedAt: rstatus === "CONFIRMED" ? subDays(now, 1) : null });
      // some RSVPs for upcoming games
      if (!past && daysOut < 8) {
        const roster = await db.select().from(s.rosterEntries).where(sql`${s.rosterEntries.teamId} in (${p.home}, ${p.away})`);
        for (const r of roster) { const x = rnd(10); if (x < 6) await db.insert(s.rsvps).values({ gameId: game.id, userId: r.userId, status: x < 5 ? "IN" : "OUT" }); }
      }
    }
  }

  // ---------- Tournament ----------
  const tStart = fromZonedTime(new Date(2026, 11, 12, 8, 0), TZ);
  const [tourney] = await db.insert(s.tournaments).values({
    name: "Gateway Holiday Classic",
    division: "Adult B/C",
    format: "POOL_TO_BRACKET",
    startDate: tStart,
    endDate: fromZonedTime(new Date(2026, 11, 13, 20, 0), TZ),
    entryFeeCents: 45000,
    maxTeams: 8,
    poolCount: 2,
    bracketSize: 4,
    registrationOpen: true,
    description: "Two-day holiday tournament. 4-game guarantee. Pool play Saturday, bracket Sunday. Jerseys with numbers required.",
    status: "REGISTRATION",
  }).returning();
  const tTeams = ["Chicago Fury", "KC Breakaway", "Springfield Slash", "Columbia Cougars", "Evansville Edge", "STL Red Line", "Peoria Pucks"];
  for (let i = 0; i < tTeams.length; i++) {
    const c = person([]);
    await db.insert(s.tournamentTeams).values({ tournamentId: tourney.id, name: tTeams[i], contactName: c.name!, contactEmail: c.email, contactPhone: c.phone, roster: Array.from({ length: 10 }, (_, j) => `${j + 1}. ${pick(FIRST)} ${pick(LAST)}`).join("\n"), feeStatus: i < 4 ? "PAID" : i < 6 ? "DEPOSIT" : "UNPAID", approved: i < 6 });
  }

  // ---------- Maintenance ----------
  const attendant = await db.insert(s.users).values([person(["STAFF"], { name: "Marcus Bell" }), person(["STAFF"], { name: "Tina Alvarez" })]).returning();
  const tasks = await db.insert(s.maintenanceTasks).values([
    { title: "Sweep and dust-mop sport court", checklist: ["Sweep full surface", "Dust mop both ends", "Check for loose tiles"], cadence: "DAILY", assigneeId: attendant[0].id, nextDueAt: now, estimatedMinutes: 40 },
    { title: "Wet scrub floor (auto-scrubber)", checklist: ["Fill scrubber", "Two passes", "Squeegee corners", "Empty recovery tank"], cadence: "WEEKLY", assigneeId: attendant[0].id, nextDueAt: addDays(now, 2), estimatedMinutes: 90 },
    { title: "Inspect dasher boards and glass", checklist: ["Walk full perimeter", "Check cap rail bolts", "Note cracked panels", "Clean glass"], cadence: "WEEKLY", assigneeId: attendant[1].id, nextDueAt: subDays(now, 1), estimatedMinutes: 45 },
    { title: "Net inspection and mesh repair", checklist: ["Check pegs", "Repair torn mesh", "Replace frayed cord"], cadence: "BIWEEKLY", assigneeId: attendant[1].id, nextDueAt: addDays(now, 4), estimatedMinutes: 30 },
    { title: "Rental skate sanitize + bearing check", checklist: ["Spray and wipe each pair", "Spin test wheels", "Pull pairs with bad bearings"], cadence: "WEEKLY", assigneeId: attendant[0].id, nextDueAt: addDays(now, 1), estimatedMinutes: 60 },
    { title: "Scoreboard and horn test", checklist: ["Power cycle", "Test horn", "Verify clock sync"], cadence: "MONTHLY", assigneeId: attendant[1].id, nextDueAt: addDays(now, 12), estimatedMinutes: 15 },
    { title: "Restroom and locker room deep clean", checklist: ["Disinfect benches", "Restock", "Mop"], cadence: "DAILY", assigneeId: attendant[1].id, nextDueAt: now, estimatedMinutes: 45 },
    { title: "HVAC filter change", cadence: "QUARTERLY", assigneeId: attendant[0].id, nextDueAt: addDays(now, 30), estimatedMinutes: 30 },
  ]).returning();
  for (const t of tasks.slice(0, 5)) {
    for (let i = 1; i <= 3; i++) await db.insert(s.maintenanceLogs).values({ taskId: t.id, completedById: t.assigneeId, completedAt: subDays(now, i * (t.cadence === "DAILY" ? 1 : 7)), notes: i === 1 ? "All good" : null });
  }
  const eq = await db.insert(s.equipment).values([
    { name: "Regulation nets", category: "Nets", quantity: 4, condition: "GOOD", location: "Rink + storage" },
    { name: "Practice nets (small)", category: "Nets", quantity: 2, condition: "FAIR", location: "Storage" },
    { name: "Rental inline skates", category: "Rental Gear", quantity: 46, condition: "FAIR", location: "Front desk", notes: "Sizes Y10 to M13" },
    { name: "Rental helmets w/ cage", category: "Rental Gear", quantity: 24, condition: "GOOD", location: "Front desk" },
    { name: "Goalie gear set (adult)", category: "Rental Gear", quantity: 2, condition: "GOOD", location: "Office" },
    { name: "Goalie gear set (youth)", category: "Rental Gear", quantity: 2, condition: "POOR", location: "Office" },
    { name: "Scoreboard", category: "Scoreboard", quantity: 1, condition: "GOOD", location: "North wall" },
    { name: "Auto floor scrubber", category: "Floor", quantity: 1, condition: "FAIR", location: "Maintenance closet" },
    { name: "Dasher glass panels (spare)", category: "Glass", quantity: 3, condition: "GOOD", location: "Storage" },
    { name: "Penalty box timers", category: "Scoreboard", quantity: 2, condition: "OUT_OF_SERVICE", location: "Penalty box" },
  ]).returning();
  await db.insert(s.repairTickets).values([
    { equipmentId: eq[9].id, title: "Penalty box timer display dead", description: "Left-side timer won't power on. Right side flickers.", priority: "HIGH", status: "OPEN", reportedById: staff.id },
    { equipmentId: eq[5].id, title: "Youth goalie pads: torn strap", description: "Right leg pad strap ripped. Zip-tied for now.", priority: "NORMAL", status: "IN_PROGRESS", reportedById: attendant[1].id, assigneeId: attendant[1].id },
    { equipmentId: eq[7].id, title: "Scrubber leaving streaks", description: "Squeegee blade worn. Order replacement.", priority: "NORMAL", status: "OPEN", reportedById: attendant[0].id },
    { title: "Loose cap rail near bench door", description: "Section 4, two bolts loose.", priority: "URGENT", status: "CLOSED", reportedById: staff.id, assigneeId: attendant[0].id, resolvedAt: subDays(now, 3) },
  ]);

  // ---------- Messages ----------
  const [m1] = await db.insert(s.messages).values({ channel: "SMS", body: "Reminder: Sunday league fees are due by week 3. Pay at the front desk or call (314) 487-4625.", audienceType: "LEAGUE", audienceId: leagues[0].id, sentById: staff.id, recipientCount: 6 }).returning();
  const captains = await db.select().from(s.users).where(sql`${s.users.roles} @> ARRAY['CAPTAIN']::role[]`).limit(6);
  await db.insert(s.deliveries).values(captains.map((c) => ({ messageId: m1.id, userId: c.id, channel: "SMS" as const, to: c.phone!, body: m1.body, status: "SENT" as const, providerId: "SM" + Math.random().toString(36).slice(2, 12) })));
  await db.insert(s.inboundMessages).values([
    { from: goalies[0].phone!, body: "YES", userId: goalies[0].id, handled: true, result: "goalie CONFIRMED" },
    { from: refs[1].phone!, body: "Can't make Thursday, sorry", userId: refs[1].id, handled: true, result: "unparsed" },
    { from: "+13145550000", body: "Is the rink open Sunday?", handled: false, result: "unknown number" },
  ]);

  await db.insert(s.settings).values({ key: "rink", value: { name: "All American Inline Hockey", phone: "(314) 487-4625", email: "allamericanhockey85@gmail.com", address: "All American Sports Mall, St. Louis, MO" } });

  console.log("Seeded. Sign in as scuret@gmail.com (admin) or any example.com user; codes show on screen in dev mode.");
  return { users: 499 + 2, games: (await db.select({ id: s.games.id }).from(s.games)).length };
}

// CLI entry: npm run db:seed
if (process.argv[1] && /seed\.ts$/.test(process.argv[1])) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes("localhost") ? undefined : { rejectUnauthorized: false } });
  const db = drizzle(pool, { schema: s });
  runSeed(db).then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
