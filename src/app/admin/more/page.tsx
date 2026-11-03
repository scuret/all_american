import Link from "next/link";
import { ADMIN_NAV } from "@/components/shell";
import { PageHeader } from "@/components/ui";

export default function MorePage() {
  return (
    <>
      <PageHeader title="Rink Office" kicker="All sections" />
      <div className="grid grid-cols-2 gap-3">
        {ADMIN_NAV.map((i) => (
          <Link key={i.href} href={i.href} className="card card-pad flex items-center gap-3 font-bold">
            <span className="text-xl text-red">{i.icon}</span>
            {i.label}
          </Link>
        ))}
        <Link href="/admin/outbox" className="card card-pad flex items-center gap-3 font-bold"><span className="text-xl text-red">⇄</span>Outbox</Link>
        <Link href="/me" className="card card-pad flex items-center gap-3 font-bold"><span className="text-xl text-red">☺</span>My Portal</Link>
      </div>
    </>
  );
}
