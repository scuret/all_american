import Link from "next/link";
import { fmtDateTime } from "@/lib/format";

export interface BracketGame {
  id: string;
  bracketRound: number;
  bracketSlot: number;
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  startsAt: Date;
}

export function Bracket({ games, hrefFor }: { games: BracketGame[]; hrefFor?: (id: string) => string }) {
  const rounds = Math.max(0, ...games.map((g) => g.bracketRound));
  if (!rounds) return null;
  const roundName = (r: number) => (r === rounds ? "Championship" : r === rounds - 1 ? "Semifinals" : r === rounds - 2 ? "Quarterfinals" : `Round ${r}`);
  return (
    <div className="flex gap-6 overflow-x-auto pb-2">
      {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => {
        const rg = games.filter((g) => g.bracketRound === r).sort((a, b) => a.bracketSlot - b.bracketSlot);
        return (
          <div key={r} className="flex min-w-56 flex-col justify-around gap-4">
            <div className="text-center text-[11px] font-bold uppercase tracking-wider text-ink-3">{roundName(r)}</div>
            {rg.map((g) => {
              const final = g.status === "FINAL";
              const homeWin = final && (g.homeScore ?? 0) > (g.awayScore ?? 0);
              const awayWin = final && (g.awayScore ?? 0) > (g.homeScore ?? 0);
              const body = (
                <div className="rounded-md border hairline bg-white text-sm shadow-sm">
                  <div className={`flex justify-between px-3 py-1.5 ${awayWin ? "font-extrabold" : ""}`}><span className="truncate">{g.awayName}</span><span className="tabular-nums">{final ? g.awayScore : ""}</span></div>
                  <div className={`flex justify-between border-t hairline px-3 py-1.5 ${homeWin ? "font-extrabold" : ""}`}><span className="truncate">{g.homeName}</span><span className="tabular-nums">{final ? g.homeScore : ""}</span></div>
                  <div className="border-t hairline px-3 py-1 text-[10px] uppercase tracking-wider text-ink-3">{fmtDateTime(g.startsAt)}</div>
                </div>
              );
              return hrefFor ? <Link key={g.id} href={hrefFor(g.id)} className="block hover:opacity-90">{body}</Link> : <div key={g.id}>{body}</div>;
            })}
          </div>
        );
      })}
    </div>
  );
}
