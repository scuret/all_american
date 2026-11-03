"use server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { issueLoginToken, consumeLoginToken, createSession } from "@/lib/auth";
import { isEmail, normalizePhone } from "@/lib/phone";
import { sendOne, isDevMode } from "@/lib/messaging";
import { redirect } from "next/navigation";

export type LoginState = { error?: string; sent?: "SMS" | "EMAIL"; userId?: string; devCode?: string; to?: string };

export async function requestLogin(_prev: LoginState, form: FormData): Promise<LoginState> {
  const identifier = String(form.get("identifier") ?? "").trim();
  if (!identifier) return { error: "Enter your email or mobile number." };
  const phone = normalizePhone(identifier);
  const email = isEmail(identifier) ? identifier.toLowerCase() : null;
  if (!phone && !email) return { error: "That doesn't look like an email or a US mobile number." };

  const user = await db.query.users.findFirst({ where: phone ? eq(users.phone, phone) : eq(users.email, email!) });
  if (!user || !user.active) return { error: "We couldn't find an account with that contact. Ask the rink office to add you, or check for a typo." };

  const channel = phone ? "SMS" : "EMAIL";
  const token = await issueLoginToken(user.id, channel);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  if (channel === "SMS") {
    await sendOne({ channel: "SMS", to: { ...user, smsOptIn: true }, body: `Your All American sign-in code is ${token.code}. It expires in 15 minutes.`, context: { kind: "LOGIN" } });
  } else {
    const link = `${appUrl}/login/verify?token=${token.code}`;
    await sendOne({ channel: "EMAIL", to: { ...user, emailOptIn: true }, subject: "Your All American sign-in link", body: `Hi ${user.name.split(" ")[0]},\n\nClick to sign in to All American Inline Hockey:\n${link}\n\nThis link expires in 15 minutes. If you didn't request it, you can ignore this email.`, context: { kind: "LOGIN" } });
  }
  return { sent: channel, userId: user.id, to: phone ?? email!, devCode: isDevMode(channel) ? token.code : undefined };
}

export async function verifyCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const userId = String(form.get("userId") ?? "");
  const code = String(form.get("code") ?? "").trim();
  const row = await consumeLoginToken(code, userId);
  if (!row) return { error: "That code is wrong or expired. Request a new one.", sent: "SMS", userId };
  await createSession(row.userId);
  const u = await db.query.users.findFirst({ where: eq(users.id, row.userId) });
  redirect(u && (u.roles.includes("ADMIN") || u.roles.includes("STAFF")) ? "/admin" : "/me");
}
