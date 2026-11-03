import Link from "next/link";
import { cn } from "@/lib/format";
import type { ReactNode } from "react";

export function PageHeader({ title, kicker, actions, back }: { title: string; kicker?: string; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {back && (
          <Link href={back.href} className="text-xs font-bold uppercase tracking-wider text-ink-3 hover:text-red">
            ← {back.label}
          </Link>
        )}
        {kicker && <div className="text-xs font-bold uppercase tracking-widest text-red">{kicker}</div>}
        <h1 className="text-2xl md:text-3xl leading-tight">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: string; actions?: ReactNode }) {
  return (
    <section className={cn("card", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3 hairline">
          {title && <h2 className="text-sm">{title}</h2>}
          {actions}
        </header>
      )}
      <div className="card-pad">{children}</div>
    </section>
  );
}

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: "red" | "ok" | "warn" | "gray" | "info" | "ink" }) {
  return <span className={cn("badge", `badge-${tone}`)}>{children}</span>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "red" | "ok" | "warn" }) {
  return (
    <div className="card card-pad">
      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">{label}</div>
      <div className={cn("mt-1 text-3xl font-extrabold tracking-tight", tone === "red" && "text-red", tone === "ok" && "text-ok", tone === "warn" && "text-warn")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed hairline bg-paper-2 px-4 py-8 text-center text-sm text-ink-3">{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: "red" | "ok" | "warn" | "gray" | "info" | "ink"; label: string }> = {
    NEEDED: { tone: "red", label: "Needed" },
    INVITED: { tone: "warn", label: "Invited" },
    CONFIRMED: { tone: "ok", label: "Confirmed" },
    DECLINED: { tone: "gray", label: "Declined" },
    EXPIRED: { tone: "gray", label: "Expired" },
    SCHEDULED: { tone: "info", label: "Scheduled" },
    FINAL: { tone: "ink", label: "Final" },
    CANCELED: { tone: "gray", label: "Canceled" },
    POSTPONED: { tone: "warn", label: "Postponed" },
    UNPAID: { tone: "red", label: "Unpaid" },
    DEPOSIT: { tone: "warn", label: "Deposit" },
    PAID: { tone: "ok", label: "Paid" },
    WAIVED: { tone: "gray", label: "Waived" },
    OPEN: { tone: "red", label: "Open" },
    IN_PROGRESS: { tone: "warn", label: "In progress" },
    CLOSED: { tone: "ok", label: "Closed" },
    DRAFT: { tone: "gray", label: "Draft" },
    REGISTRATION: { tone: "info", label: "Registration" },
    ACTIVE: { tone: "ok", label: "Active" },
    COMPLETE: { tone: "ink", label: "Complete" },
    POOL_PLAY: { tone: "info", label: "Pool play" },
    BRACKET: { tone: "warn", label: "Bracket" },
    IN: { tone: "ok", label: "In" },
    OUT: { tone: "red", label: "Out" },
    MAYBE: { tone: "warn", label: "Maybe" },
    SENT: { tone: "ok", label: "Sent" },
    DELIVERED: { tone: "ok", label: "Delivered" },
    FAILED: { tone: "red", label: "Failed" },
    QUEUED: { tone: "warn", label: "Queued" },
    DEV: { tone: "info", label: "Dev outbox" },
  };
  const m = map[status] ?? { tone: "gray" as const, label: status };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function Logo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo-white.png" alt="All American Inline Hockey" className={cn("h-9 w-auto", className)} />;
}

export function Tabs({ items }: { items: { href: string; label: string; active?: boolean; count?: number }[] }) {
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b hairline">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-bold uppercase tracking-wider",
            t.active ? "border-red text-red" : "border-transparent text-ink-3 hover:text-ink"
          )}
        >
          {t.label}
          {t.count != null && t.count > 0 && <span className="ml-1.5 rounded-full bg-red px-1.5 py-0.5 text-[10px] text-white">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
