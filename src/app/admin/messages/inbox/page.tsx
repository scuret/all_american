import { db } from "@/db";
import { inboundMessages } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { PageHeader, Card, Empty, Badge, Tabs, Field } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { replyInbound, markHandled, simulateInbound } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { isDevMode } from "@/lib/messaging";
import Link from "next/link";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ simulated?: string }> }) {
  const sp = await searchParams;
  const list = await db.query.inboundMessages.findMany({ orderBy: [desc(inboundMessages.createdAt)], limit: 100, with: { user: true } });
  const unhandled = list.filter((m) => !m.handled);
  return (
    <>
      <PageHeader title="Inbox" kicker="Replies from players, refs, and goalies" />
      <Tabs items={[{ href: "/admin/messages", label: "Sent" }, { href: "/admin/messages/inbox", label: "Inbox", active: true, count: unhandled.length }, { href: "/admin/outbox", label: "Delivery log" }]} />
      {sp.simulated && <div className="mb-4 rounded-md bg-[#e3effa] p-3 text-sm text-info"><b>Auto-reply sent:</b> “{sp.simulated}”</div>}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Replies" className="lg:col-span-2">
          {list.length === 0 ? <Empty>No replies yet.</Empty> : (
            <ul className="divide-y hairline">
              {list.map((m) => (
                <li key={m.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold">{m.user ? <Link href={`/admin/people/${m.user.id}`} className="hover:text-red">{m.user.name}</Link> : <span className="text-ink-3">Unknown</span>} <span className="text-xs font-normal text-ink-3">{formatPhone(m.from)}</span></div>
                      <div className="mt-0.5 text-sm">“{m.body}”</div>
                      <div className="mt-0.5 text-[11px] text-ink-3">{fmtDateTime(m.createdAt)}{m.result && <> · auto: <Badge tone={m.result.includes("CONFIRMED") || m.result.includes("IN") || m.result.includes("opted") ? "ok" : m.result === "unparsed" || m.result === "unknown number" ? "warn" : "gray"}>{m.result}</Badge></>}</div>
                    </div>
                    {m.handled ? <Badge tone="gray">handled</Badge> : <Badge tone="red">needs reply</Badge>}
                  </div>
                  {!m.handled && (
                    <form action={replyInbound.bind(null, m.id)} className="mt-2 flex gap-2">
                      <input name="body" className="input flex-1" placeholder="Reply by text…" />
                      <SubmitButton className="btn-primary btn-sm">Send</SubmitButton>
                      <button formAction={markHandled.bind(null, m.id)} className="btn btn-ghost btn-sm">Dismiss</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-5">
          <Card title="How replies work">
            <ul className="space-y-2 text-sm text-ink-2">
              <li><b>YES / NO</b> from a goalie or ref with a pending invite confirms or declines it. A decline auto-invites the next person in the pool.</li>
              <li><b>YES / NO</b> from a player with no pending invite RSVPs to their next game.</li>
              <li><b>STOP</b> opts them out of texts; <b>START</b> opts back in.</li>
              <li>Anything else lands here for a human reply.</li>
            </ul>
          </Card>
          {isDevMode("SMS") && (
            <Card title="Simulate an inbound text (dev)">
              <form action={simulateInbound} className="space-y-3">
                <Field label="From (E.164)"><input name="from" className="input" placeholder="+13145550101" required /></Field>
                <Field label="Body"><input name="body" className="input" placeholder="YES" required /></Field>
                <SubmitButton className="btn-secondary">Simulate</SubmitButton>
              </form>
              <p className="mt-2 text-xs text-ink-3">In production, Twilio posts to <code>/api/webhooks/twilio</code> and this runs automatically.</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
