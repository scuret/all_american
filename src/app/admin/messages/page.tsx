import Link from "next/link";
import { db } from "@/db";
import { messages, inboundMessages } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { PageHeader, Card, Empty, Badge, Tabs } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { audienceLabel } from "@/lib/audience";
import { isDevMode } from "@/lib/messaging";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ sent?: string; failed?: string }> }) {
  const sp = await searchParams;
  const [list, unhandled] = await Promise.all([
    db.query.messages.findMany({ orderBy: [desc(messages.createdAt)], limit: 50, with: { sentBy: true, deliveries: true } }),
    db.select({ id: inboundMessages.id }).from(inboundMessages).where(eq(inboundMessages.handled, false)),
  ]);
  const labels = await Promise.all(list.map((m) => audienceLabel(m.audienceType, m.audienceId)));
  return (
    <>
      <PageHeader title="Messages" kicker="Texts and emails" actions={<Link href="/admin/messages/new" className="btn btn-primary">✉ New message</Link>} />
      <Tabs items={[{ href: "/admin/messages", label: "Sent", active: true }, { href: "/admin/messages/inbox", label: "Inbox", count: unhandled.length }, { href: "/admin/outbox", label: "Delivery log" }]} />
      {sp.sent && <div className="mb-4 rounded-md bg-[#e3f4e8] p-3 text-sm font-semibold text-ok">Sent to {sp.sent} recipient{sp.sent === "1" ? "" : "s"}{Number(sp.failed) > 0 ? `, ${sp.failed} couldn't be delivered (no contact on file or opted out)` : ""}.</div>}
      {(isDevMode("SMS") || isDevMode("EMAIL")) && <div className="mb-4 rounded-md border border-dashed border-info bg-[#e3effa] p-3 text-xs text-info"><b>Dev mode:</b> {isDevMode("SMS") && "Twilio isn't configured, so texts land in the delivery log instead of sending. "}{isDevMode("EMAIL") && "Resend isn't configured, so emails land in the delivery log instead of sending."}</div>}
      <Card>
        {list.length === 0 ? <Empty>Nothing sent yet.</Empty> : (
          <table className="table">
            <thead><tr><th>When</th><th>Channel</th><th>To</th><th>Message</th><th className="text-right">Delivered</th></tr></thead>
            <tbody>
              {list.map((m, i) => {
                const ok = m.deliveries.filter((d) => d.status === "SENT" || d.status === "DELIVERED" || d.status === "DEV").length;
                const bad = m.deliveries.filter((d) => d.status === "FAILED").length;
                return (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap text-xs">{fmtDateTime(m.createdAt)}<div className="text-ink-3">{m.sentBy?.name}</div></td>
                    <td><Badge tone={m.channel === "SMS" ? "info" : "gray"}>{m.channel}</Badge></td>
                    <td className="text-xs font-semibold">{labels[i]}</td>
                    <td className="max-w-md text-sm">{m.subject && <div className="font-bold">{m.subject}</div>}<div className="line-clamp-2 text-ink-2">{m.body}</div></td>
                    <td className="text-right text-xs tabular-nums">{ok}/{m.recipientCount}{bad > 0 && <span className="ml-1 text-red">({bad} failed)</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
