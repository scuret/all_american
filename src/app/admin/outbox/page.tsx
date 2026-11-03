import Link from "next/link";
import { db } from "@/db";
import { deliveries } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader, Card, Empty, StatusBadge, Tabs, Badge } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { isDevMode } from "@/lib/messaging";

export default async function OutboxPage() {
  const list = await db.query.deliveries.findMany({ orderBy: [desc(deliveries.createdAt)], limit: 150, with: { user: true } });
  return (
    <>
      <PageHeader title="Delivery log" kicker="Every text and email, including automatic ones" />
      <Tabs items={[{ href: "/admin/messages", label: "Sent" }, { href: "/admin/messages/inbox", label: "Inbox" }, { href: "/admin/outbox", label: "Delivery log", active: true }]} />
      {(isDevMode("SMS") || isDevMode("EMAIL")) && <div className="mb-4 rounded-md border border-dashed border-info bg-[#e3effa] p-3 text-xs text-info"><b>Dev mode:</b> entries marked “Dev outbox” were not actually sent. Add Twilio and Resend keys to go live.</div>}
      <Card>
        {list.length === 0 ? <Empty>Nothing yet.</Empty> : (
          <table className="table">
            <thead><tr><th>When</th><th>Ch</th><th>To</th><th>Message</th><th>Kind</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id}>
                  <td className="whitespace-nowrap text-xs">{fmtDateTime(d.createdAt)}</td>
                  <td><Badge tone={d.channel === "SMS" ? "info" : "gray"}>{d.channel}</Badge></td>
                  <td className="text-xs">{d.user ? <Link href={`/admin/people/${d.user.id}`} className="font-semibold hover:text-red">{d.user.name}</Link> : null}<div className="text-ink-3">{d.to}</div></td>
                  <td className="max-w-md text-xs">{d.subject && <div className="font-bold">{d.subject}</div>}<div className="whitespace-pre-wrap text-ink-2">{d.body}</div>{d.error && <div className="text-red">{d.error}</div>}</td>
                  <td className="text-[10px] uppercase tracking-wider text-ink-3">{d.context?.kind?.replace("_", " ").toLowerCase()}</td>
                  <td><StatusBadge status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
