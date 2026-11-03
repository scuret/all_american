import { NextResponse } from "next/server";
import { db } from "@/db";
import { inboundMessages } from "@/db/schema";
import { handleInboundReply } from "@/lib/assignments";

/**
 * Twilio inbound SMS webhook. Configure in Twilio Console:
 *   Messaging > your number > "A message comes in" > Webhook (HTTP POST) > https://<app>/api/webhooks/twilio
 * Validates the X-Twilio-Signature when TWILIO_AUTH_TOKEN is set.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  const from = params.From ?? "";
  const body = params.Body ?? "";
  const sid = params.MessageSid ?? null;

  if (process.env.TWILIO_AUTH_TOKEN) {
    const twilio = (await import("twilio")).default;
    const sig = req.headers.get("x-twilio-signature") ?? "";
    const url = `${process.env.APP_URL ?? new URL(req.url).origin}/api/webhooks/twilio`;
    const valid = twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, sig, url, params);
    if (!valid) return new NextResponse("Invalid signature", { status: 403 });
  }

  const res = await handleInboundReply(from, body);
  await db.insert(inboundMessages).values({ from, body, userId: res.userId ?? null, handled: res.result !== "unparsed" && res.result !== "unknown number", result: res.result, providerId: sid });

  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(res.reply)}</Message></Response>`;
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
