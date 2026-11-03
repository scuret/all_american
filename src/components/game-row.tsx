import Link from "next/link";
import { fmtTime, fmtDate, cn } from "@/lib/format";
import { Badge } from "./ui";

export interface GameRowData {
  id: string;
  startsAt: Date;
  status: string;
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  context?: string; // league or tournament
  goalieNeeded?: number;
  goalieInvited?: number;
  refNeeded?: number;
  refInvited?: number;
  week?: number | null;
}

export function GameRow({ g, href, showDate, compact }: { g: GameRowData; href?: string; showDate?: boolean; compact?: boolean }) {
  const final = g.status === "FINAL";
  const inner = (
    <div className={cn("flex items-center gap-3", compact ? "py-2" : "py-3")}>
      <div className="w-20 shrink-0 text-xs font-bold text-ink-3">
        {showDate && <div className="text-ink">{fmtDate(g.startsAt)}</div>}
        <div>{fmtTime(g.startsAt)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-bold text-ink">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: g.awayColor ?? "#999" }} />
          <span className="truncate">{g.awayName}</span>
          {final && <span className="ml-auto tabular-nums">{g.awayScore}</span>}
        </div>
        <div className="flex items-center gap-2 text-sm font-bold text-ink">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: g.homeColor ?? "#999" }} />
          <span className="truncate">{g.homeName}</span>
          {final && <span className="ml-auto tabular-nums">{g.homeScore}</span>}
        </div>
        {g.context && <div className="mt-0.5 text-[11px] uppercase tracking-wider text-ink-3">{g.context}{g.week ? ` · Wk ${g.week}` : ""}</div>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {g.status === "CANCELED" && <Badge tone="gray">Canceled</Badge>}
        {g.status === "POSTPONED" && <Badge tone="warn">Postponed</Badge>}
        {!final && g.status === "SCHEDULED" && (
          <>
            {(g.goalieNeeded ?? 0) > 0 && <Badge tone="red">{g.goalieNeeded} goalie{g.goalieNeeded! > 1 ? "s" : ""} needed</Badge>}
            {(g.goalieInvited ?? 0) > 0 && (g.goalieNeeded ?? 0) === 0 && <Badge tone="warn">goalie pending</Badge>}
            {(g.refNeeded ?? 0) > 0 && <Badge tone="red">ref needed</Badge>}
            {(g.refInvited ?? 0) > 0 && (g.refNeeded ?? 0) === 0 && <Badge tone="warn">ref pending</Badge>}
            {(g.goalieNeeded ?? 0) + (g.goalieInvited ?? 0) + (g.refNeeded ?? 0) + (g.refInvited ?? 0) === 0 && g.goalieNeeded != null && <Badge tone="ok">Ready</Badge>}
          </>
        )}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block border-b hairline last:border-0 hover:bg-paper-2 -mx-2 px-2">{inner}</Link> : <div className="border-b hairline last:border-0">{inner}</div>;
}
