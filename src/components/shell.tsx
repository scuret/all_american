import Link from "next/link";
import { Logo } from "./ui";
import type { User } from "@/db/schema";
import { NavLinks } from "./nav-links";

export interface NavItem {
  href: string;
  label: string;
  icon: string; // short glyph
}

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Today", icon: "◉" },
  { href: "/admin/leagues", label: "Leagues", icon: "▤" },
  { href: "/admin/schedule", label: "Calendar", icon: "▦" },
  { href: "/admin/goalies", label: "Goalies", icon: "◈" },
  { href: "/admin/referees", label: "Refs", icon: "◆" },
  { href: "/admin/tournaments", label: "Tournaments", icon: "♛" },
  { href: "/admin/people", label: "People", icon: "☺" },
  { href: "/admin/messages", label: "Messages", icon: "✉" },
  { href: "/admin/maintenance", label: "Rink Ops", icon: "⚙" },
];

export const PORTAL_NAV: NavItem[] = [
  { href: "/me", label: "My Games", icon: "◉" },
  { href: "/me/assignments", label: "Assignments", icon: "◈" },
  { href: "/me/team", label: "My Team", icon: "▤" },
  { href: "/me/profile", label: "Profile", icon: "☺" },
];

export function AppShell({ user, nav, children, title }: { user: User; nav: NavItem[]; children: React.ReactNode; title: string }) {
  const isStaff = user.roles.includes("ADMIN") || user.roles.includes("STAFF");
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col bg-red text-white md:flex stripe">
        <Link href="/" className="flex items-center px-4 py-4">
          <Logo className="h-10" />
        </Link>
        <div className="px-4 pb-2 text-[10px] font-bold uppercase tracking-[.2em] text-white/60">{title}</div>
        <NavLinks items={nav} variant="side" />
        <div className="mt-auto border-t border-white/15 p-4 text-xs">
          <div className="font-bold">{user.name}</div>
          <div className="text-white/70">{user.roles.map((r) => r.toLowerCase()).join(", ")}</div>
          <div className="mt-2 flex gap-3">
            {isStaff && title !== "Rink Office" && <Link href="/admin" className="underline">Office</Link>}
            {title !== "Player Portal" && <Link href="/me" className="underline">Portal</Link>}
            <form action="/logout" method="post"><button className="underline">Sign out</button></form>
          </div>
        </div>
      </aside>

      {/* Top bar (mobile) */}
      <header className="flex items-center justify-between bg-red px-3 py-2 text-white md:hidden stripe">
        <Link href="/"><Logo className="h-8" /></Link>
        <div className="flex items-center gap-3 text-xs">
          {isStaff && title !== "Rink Office" && <Link href="/admin" className="font-bold">Office</Link>}
          {title !== "Player Portal" && <Link href="/me" className="font-bold">Portal</Link>}
          <form action="/logout" method="post"><button className="text-white/80">Sign out</button></form>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 pb-24 md:px-8 md:py-7 md:pb-8 max-w-6xl w-full mx-auto">{children}</main>

      {/* Bottom nav (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t hairline bg-white md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <NavLinks items={nav} variant="bottom" />
      </nav>
    </div>
  );
}

export function PublicShell({ children, user }: { children: React.ReactNode; user: User | null }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-red text-white stripe">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/"><Logo className="h-9 md:h-11" /></Link>
          <nav className="flex items-center gap-4 text-xs font-bold uppercase tracking-wider">
            <Link href="/schedule" className="hover:underline">Schedules</Link>
            <Link href="/tournaments" className="hover:underline hidden sm:inline">Tournaments</Link>
            {user ? (
              <Link href={user.roles.includes("ADMIN") || user.roles.includes("STAFF") ? "/admin" : "/me"} className="rounded bg-white px-3 py-1.5 text-red">My Account</Link>
            ) : (
              <Link href="/login" className="rounded bg-white px-3 py-1.5 text-red">Sign in</Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t hairline bg-white py-6 text-center text-xs text-ink-3">
        All American Inline Hockey · All American Sports Mall · St. Louis, MO · (314) 487-4625
      </footer>
    </div>
  );
}
