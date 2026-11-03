"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";
import type { NavItem } from "./shell";

export function NavLinks({ items, variant }: { items: NavItem[]; variant: "side" | "bottom" }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/admin" || href === "/me" ? path === href : path.startsWith(href));
  if (variant === "side") {
    return (
      <nav className="flex flex-col gap-0.5 px-2">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-bold", isActive(i.href) ? "bg-white text-red" : "text-white/90 hover:bg-white/10")}>
            <span className="w-4 text-center opacity-80">{i.icon}</span>
            {i.label}
          </Link>
        ))}
      </nav>
    );
  }
  const shown = items.length > 5 ? [...items.slice(0, 4), { href: `${items[0].href}/more`, label: "More", icon: "⋯" }] : items;
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${shown.length}, 1fr)` }}>
      {shown.map((i) => (
        <Link key={i.href} href={i.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold uppercase tracking-wide", isActive(i.href) ? "text-red" : "text-ink-3")}>
          <span className="text-lg leading-none">{i.icon}</span>
          {i.label}
        </Link>
      ))}
    </div>
  );
}
