import { addDays, addMinutes, format, getDay, parse, areIntervalsOverlapping } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export const RINK_TZ = "America/Chicago";

export interface Pairing {
  week: number;
  home: string;
  away: string;
}

/**
 * Circle-method round robin. Returns pairings for `rounds` rounds.
 * If rounds exceeds (n-1), the cycle repeats with home/away flipped.
 * Odd team counts get a BYE (pairings containing "BYE" are dropped).
 */
export function roundRobin(teamIds: string[], gamesPerTeam: number): Pairing[] {
  const ids = [...teamIds];
  if (ids.length < 2) return [];
  const odd = ids.length % 2 === 1;
  if (odd) ids.push("BYE");
  const n = ids.length;
  const perCycle = n - 1;
  const out: Pairing[] = [];
  const played = new Map<string, number>(teamIds.map((t) => [t, 0]));
  const homes = new Map<string, number>(teamIds.map((t) => [t, 0]));
  let arr = [...ids];
  // With an odd team count every round has a bye, so run extra rounds until each team reaches its target.
  const maxRounds = odd ? gamesPerTeam * 2 + n : gamesPerTeam;
  let week = 0;
  for (let r = 0; r < maxRounds; r++) {
    const cycle = Math.floor(r / perCycle);
    const flip = cycle % 2 === 1;
    const weekGames: Pairing[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === "BYE" || b === "BYE") continue;
      if ((played.get(a) ?? 0) >= gamesPerTeam || (played.get(b) ?? 0) >= gamesPerTeam) continue;
      // balance home games: whoever has hosted less is home; tie breaks alternate
      const ha = homes.get(a) ?? 0, hb = homes.get(b) ?? 0;
      const aHome = ha !== hb ? ha < hb : ((r + i) % 2 === 0) !== flip;
      const [home, away] = aHome ? [a, b] : [b, a];
      homes.set(home, (homes.get(home) ?? 0) + 1);
      weekGames.push({ week: 0, home, away });
      played.set(a, (played.get(a) ?? 0) + 1);
      played.set(b, (played.get(b) ?? 0) + 1);
    }
    if (weekGames.length) {
      week++;
      for (const g of weekGames) out.push({ ...g, week });
    }
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
    if ([...played.values()].every((c) => c >= gamesPerTeam)) break;
  }
  return out;
}

export interface SlotPlan {
  week: number;
  date: Date; // start time (UTC instant)
  home: string;
  away: string;
}

export interface Blocker {
  startsAt: Date;
  endsAt: Date;
}

/**
 * Lay round-robin pairings onto real calendar dates.
 * - One league night per week on `dayOfWeek` starting at/after `startDate`
 * - `timeSlots` are local "HH:mm" strings in rink time
 * - Weeks that fall on a blackout date, or whose slots overlap a blocker, are skipped (season extends)
 * - If pairings for a week exceed available slots, overflow spills to the next week
 */
export function layoutSeason(opts: {
  pairings: Pairing[];
  startDate: Date;
  dayOfWeek: number;
  timeSlots: string[];
  gameMinutes: number;
  blackoutDates: string[];
  blockers: Blocker[];
}): SlotPlan[] {
  const { pairings, dayOfWeek, timeSlots, gameMinutes, blackoutDates, blockers } = opts;
  const byWeek = new Map<number, Pairing[]>();
  for (const p of pairings) byWeek.set(p.week, [...(byWeek.get(p.week) ?? []), p]);

  // first league night on/after startDate (in rink tz)
  let night = toZonedTime(opts.startDate, RINK_TZ);
  night = new Date(night.getFullYear(), night.getMonth(), night.getDate());
  while (getDay(night) !== dayOfWeek) night = addDays(night, 1);

  const queue: Pairing[] = [];
  const weeks = [...byWeek.keys()].sort((a, b) => a - b);
  let wi = 0;
  const plan: SlotPlan[] = [];
  let guard = 0;
  let weekCounter = 0;

  while ((queue.length > 0 || wi < weeks.length) && guard++ < 200) {
    if (queue.length < timeSlots.length && wi < weeks.length) {
      queue.push(...(byWeek.get(weeks[wi]) ?? []));
      wi++;
    }
    const ymd = format(night, "yyyy-MM-dd");
    const isBlackout = blackoutDates.includes(ymd);
    if (!isBlackout) {
      weekCounter++;
      for (const slot of timeSlots) {
        if (queue.length === 0) break;
        const localStart = parse(`${ymd} ${slot}`, "yyyy-MM-dd HH:mm", new Date());
        const start = fromZonedTime(localStart, RINK_TZ);
        const end = addMinutes(start, gameMinutes);
        const blocked = blockers.some((b) =>
          areIntervalsOverlapping({ start, end }, { start: b.startsAt, end: b.endsAt })
        );
        if (blocked) continue;
        const p = queue.shift()!;
        plan.push({ week: weekCounter, date: start, home: p.home, away: p.away });
      }
    }
    night = addDays(night, 7);
  }
  return plan;
}

export interface StandingRow {
  teamId: string;
  gp: number;
  w: number;
  l: number;
  t: number;
  gf: number;
  ga: number;
  pts: number;
}

export function computeStandings(
  teamIds: string[],
  games: { homeTeamId: string | null; awayTeamId: string | null; homeScore: number | null; awayScore: number | null; status: string }[]
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const id of teamIds) rows.set(id, { teamId: id, gp: 0, w: 0, l: 0, t: 0, gf: 0, ga: 0, pts: 0 });
  for (const g of games) {
    if (g.status !== "FINAL" || g.homeScore == null || g.awayScore == null || !g.homeTeamId || !g.awayTeamId) continue;
    const h = rows.get(g.homeTeamId);
    const a = rows.get(g.awayTeamId);
    if (!h || !a) continue;
    h.gp++; a.gp++;
    h.gf += g.homeScore; h.ga += g.awayScore;
    a.gf += g.awayScore; a.ga += g.homeScore;
    if (g.homeScore > g.awayScore) { h.w++; a.l++; h.pts += 2; }
    else if (g.homeScore < g.awayScore) { a.w++; h.l++; a.pts += 2; }
    else { h.t++; a.t++; h.pts++; a.pts++; }
  }
  return [...rows.values()].sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
