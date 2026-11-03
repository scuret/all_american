import "server-only";
import { db } from "@/db";
import { deliveries, messages, users, type User } from "@/db/schema";
import { eq } from "drizzle-orm";

export type Channel = "SMS" | "EMAIL";

export interface SendOptions {
  channel: Channel;
  to: User | { id?: string; name: string; email?: string | null; phone?: string | null; smsOptIn?: boolean; emailOptIn?: boolean };
  subject?: string;
  body: string;
  messageId?: string | null;
  context?: Record<string, string>;
}

const SMS_FOOTER = "\nReply STOP to opt out.";

function twilioConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}
function resendConfigured() {
  return !!process.env.RESEND_API_KEY;
}

/** Whether we're in "dev outbox" mode for a channel: nothing is actually sent, it just lands in the Outbox page. */
export function isDevMode(channel: Channel) {
  return channel === "SMS" ? !twilioConfigured() : !resendConfigured();
}

export async function sendOne(opts: SendOptions) {
  const { channel, to } = opts;
  const address = channel === "SMS" ? to.phone : to.email;
  const optedIn = channel === "SMS" ? to.smsOptIn !== false : to.emailOptIn !== false;

  const [row] = await db
    .insert(deliveries)
    .values({
      messageId: opts.messageId ?? null,
      userId: to.id ?? null,
      channel,
      to: address ?? "(none)",
      subject: opts.subject ?? null,
      body: opts.body,
      status: "QUEUED",
      context: opts.context ?? null,
    })
    .returning();

  if (!address) {
    await db.update(deliveries).set({ status: "FAILED", error: `No ${channel === "SMS" ? "phone" : "email"} on file` }).where(eq(deliveries.id, row.id));
    return { ok: false, id: row.id, error: "no address" };
  }
  if (!optedIn) {
    await db.update(deliveries).set({ status: "FAILED", error: "Opted out" }).where(eq(deliveries.id, row.id));
    return { ok: false, id: row.id, error: "opted out" };
  }

  if (isDevMode(channel)) {
    await db.update(deliveries).set({ status: "DEV" }).where(eq(deliveries.id, row.id));
    return { ok: true, id: row.id, dev: true };
  }

  try {
    let providerId: string | undefined;
    if (channel === "SMS") {
      const twilio = (await import("twilio")).default;
      const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
      const res = await client.messages.create({
        from: process.env.TWILIO_FROM_NUMBER!,
        to: address,
        body: opts.body + (opts.body.includes("STOP") ? "" : SMS_FOOTER),
      });
      providerId = res.sid;
    } else {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY!);
      const res = await resend.emails.send({
        from: process.env.EMAIL_FROM ?? "All American Inline Hockey <noreply@example.com>",
        to: address,
        subject: opts.subject ?? "All American Inline Hockey",
        text: opts.body,
        html: textToHtml(opts.body),
      });
      providerId = res.data?.id;
      if (res.error) throw new Error(res.error.message);
    }
    await db.update(deliveries).set({ status: "SENT", providerId }).where(eq(deliveries.id, row.id));
    return { ok: true, id: row.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(deliveries).set({ status: "FAILED", error: msg }).where(eq(deliveries.id, row.id));
    return { ok: false, id: row.id, error: msg };
  }
}

/** Send to a user on their best channel: SMS if they have a phone and opted in, else email. */
export async function notifyUser(user: User, opts: { subject?: string; body: string; context?: Record<string, string>; prefer?: Channel }) {
  const canSms = !!user.phone && user.smsOptIn;
  const canEmail = !!user.email && user.emailOptIn;
  const channel: Channel | null =
    opts.prefer === "EMAIL" && canEmail ? "EMAIL" : canSms ? "SMS" : canEmail ? "EMAIL" : null;
  if (!channel) return { ok: false, error: "no channel" };
  return sendOne({ channel, to: user, subject: opts.subject, body: opts.body, context: opts.context });
}

/** Broadcast a message to a list of users and record it. */
export async function broadcast(opts: {
  channel: Channel;
  subject?: string;
  body: string;
  audienceType: (typeof messages.$inferInsert)["audienceType"];
  audienceId?: string | null;
  sentById?: string | null;
  recipients: User[];
}) {
  const [msg] = await db
    .insert(messages)
    .values({
      channel: opts.channel,
      subject: opts.subject ?? null,
      body: opts.body,
      audienceType: opts.audienceType,
      audienceId: opts.audienceId ?? null,
      sentById: opts.sentById ?? null,
      recipientCount: opts.recipients.length,
    })
    .returning();
  let sent = 0;
  let failed = 0;
  for (const u of opts.recipients) {
    const r = await sendOne({ channel: opts.channel, to: u, subject: opts.subject, body: opts.body, messageId: msg.id, context: { kind: "BROADCAST", messageId: msg.id } });
    if (r.ok) sent++;
    else failed++;
  }
  return { messageId: msg.id, sent, failed };
}

export function textToHtml(text: string) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const linked = esc.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" style="color:#B00000">$1</a>');
  return `<!doctype html><html><body style="font-family:'Open Sans',Arial,sans-serif;color:#333;line-height:1.5">
<div style="background:#B00000;padding:14px 20px;color:#fff;font-weight:800;letter-spacing:.08em;text-transform:uppercase">All American Inline Hockey</div>
<div style="padding:20px;white-space:pre-wrap">${linked}</div>
<div style="padding:12px 20px;color:#888;font-size:12px">All American Sports Mall · St. Louis, MO · (314) 487-4625</div>
</body></html>`;
}

export async function findUserByPhone(phone: string) {
  return db.query.users.findFirst({ where: eq(users.phone, phone) });
}
