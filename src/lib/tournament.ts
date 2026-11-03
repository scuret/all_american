import { addMinutes, parse, addDays, format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { roundRobin, computeStandings, RINK_TZ } from "./schedule";

export interface TGame {
  poolId?: string | null;
  home?: string | null;
  away?: string | null;
  homeLabel?: string | null;
  awayLabel?: string | null;
  bracketRound?: number | null;
  bracketSlot?: number | null;
  startsAt: Date;
}

/** Sequential time slots across the tournament days. */
export function* slotIterator(startDate: Date, endDate: Date, timeSlots: string[]) {
  let day = toZonedTime(startDate, RINK_TZ);
  day = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const last = toZonedTime(endDate, RINK_TZ);
  while (day <= last) {
    const ymd = format(day, "yyyy-MM-dd");
    for (const slot of timeSlots) {
      const local = parse(`${ymd} ${slot}`, "yyyy-MM-dd HH:mm", new Date());
      yield fromZonedTime(local, RINK_TZ);
    }
    day = addDays(day, 1);
  }
}

/** Pool play: every team plays every other team in its pool once. Games interleave across pools so each slot is used. */
export function buildPoolGames(pools: { id: string; teamIds: string[] }[], slots: Generator<Date>): TGame[] {
  const perPool = pools.map((p) => ({ id: p.id, pairings: roundRobin(p.teamIds, Math.max(1, p.teamIds.length - 1)) }));
  const out: TGame[] = [];
  const maxWeek = Math.max(...perPool.map((p) => Math.max(0, ...p.pairings.map((x) => x.week))));
  for (let w = 1; w <= maxWeek; w++) {
    for (const p of perPool) {
      for (const pr of p.pairings.filter((x) => x.week === w)) {
        const next = slots.next();
        if (next.done) return out;
        out.push({ poolId: p.id, home: pr.home, away: pr.away, startsAt: next.value });
      }
    }
  }
  return out;
}

/** Single-elimination bracket skeleton with placeholder labels. bracketSize must be 2, 4, 8, or 16. */
export function buildBracketSkeleton(bracketSize: number, seedLabels: string[], slots: Generator<Date>, gameMinutes: number): TGame[] {
  const rounds = Math.log2(bracketSize);
  const out: TGame[] = [];
  // standard seeding order for first round: 1v8, 4v5, 3v6, 2v7 etc.
  const order = seedOrder(bracketSize);
  let slotIdx = 0;
  for (let i = 0; i < bracketSize / 2; i++) {
    const a = order[i * 2];
    const b = order[i * 2 + 1];
    const next = slots.next();
    if (next.done) break;
    out.push({ bracketRound: 1, bracketSlot: i + 1, homeLabel: seedLabels[a - 1] ?? `Seed ${a}`, awayLabel: seedLabels[b - 1] ?? `Seed ${b}`, startsAt: next.value });
    slotIdx++;
  }
  for (let r = 2; r <= rounds; r++) {
    const gamesInRound = bracketSize / Math.pow(2, r);
    for (let i = 0; i < gamesInRound; i++) {
      const next = slots.next();
      if (next.done) break;
      const name = r === rounds ? "Championship" : r === rounds - 1 ? "Semifinal" : `Round ${r}`;
      out.push({ bracketRound: r, bracketSlot: i + 1, homeLabel: `Winner R${r - 1} G${i * 2 + 1}`, awayLabel: `Winner R${r - 1} G${i * 2 + 2}`, startsAt: next.value, poolId: null, home: null, away: null, ...(name ? {} : {}) });
    }
  }
  void slotIdx; void gameMinutes; void addMinutes;
  return out;
}

function seedOrder(n: number): number[] {
  let arr = [1, 2];
  while (arr.length < n) {
    const next: number[] = [];
    const m = arr.length * 2 + 1;
    for (const s of arr) next.push(s, m - s);
    arr = next;
  }
  return arr;
}

/** Seed labels for pool-to-bracket: "Pool A #1", "Pool B #1", "Pool A #2", ... (cross-pool so top seeds avoid each other) */
export function poolSeedLabels(poolNames: string[], bracketSize: number): string[] {
  const labels: string[] = [];
  let place = 1;
  while (labels.length < bracketSize) {
    for (const p of poolNames) {
      if (labels.length >= bracketSize) break;
      labels.push(`Pool ${p} #${place}`);
    }
    place++;
  }
  return labels;
}

export { computeStandings };
