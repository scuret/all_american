"use server";
import { db } from "@/db";
import { inboundMessages } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { broadcast, sendOne } from "@/lib/messaging";
import { resolveAudience, type AudienceType } from "@/lib/audience";
import { handleInboundReply } from "@/lib/assignments";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function sendBroadcast(form: FormData) {
  const me = await requireStaff();
  const channel = str(form, "channel") as "SMS" | "EMAIL";
  const audienceType = str(form, "audienceType") as AudienceType;
  const audienceId = str(form, "audienceId") || null;
  const body = str(form, "body");
  const subject = str(form, "subject") || undefined;
  if (!body) return;
  const recipients = await resolveAudience(audienceType, audienceId);
  const r = await broadcast({ channel, subject, body, audienceType, audienceId, sentById: me.id, recipients });
  revalidatePath("/admin/messages");
  redirect(`/admin/messages?sent=${r.sent}&failed=${r.failed}`);
}

export async function replyInbound(inboundId: string, form: FormData) {
  await requireStaff();
  const m = await db.query.inboundMessages.findFirst({ where: eq(inboundMessages.id, inboundId), with: { user: true } });
  if (!m) return;
  const body = str(form, "body");
  if (body) await sendOne({ channel: "SMS", to: m.user ?? { name: m.from, phone: m.from, smsOptIn: true }, body, context: { kind: "REPLY", inboundId } });
  await db.update(inboundMessages).set({ handled: true }).where(eq(inboundMessages.id, inboundId));
  revalidatePath("/admin/messages/inbox");
  revalidatePath("/admin");
}

export async function markHandled(inboundId: string) {
  await requireStaff();
  await db.update(inboundMessages).set({ handled: true }).where(eq(inboundMessages.id, inboundId));
  revalidatePath("/admin/messages/inbox");
  revalidatePath("/admin");
}

/** Dev helper: simulate an inbound text so the reply parsing can be tested without Twilio. */
export async function simulateInbound(form: FormData) {
  await requireStaff();
  const from = str(form, "from");
  const body = str(form, "body");
  const res = await handleInboundReply(from, body);
  await db.insert(inboundMessages).values({ from, body, userId: res.userId ?? null, handled: res.result !== "unparsed" && res.result !== "unknown number", result: res.result });
  if (res.userId) await sendOne({ channel: "SMS", to: { id: res.userId, name: "", phone: from, smsOptIn: true }, body: res.reply, context: { kind: "AUTO_REPLY" } });
  revalidatePath("/admin/messages/inbox");
  revalidatePath("/admin/outbox");
  revalidatePath("/admin");
  redirect(`/admin/messages/inbox?simulated=${encodeURIComponent(res.reply)}`);
}
