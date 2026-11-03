import { consumeLoginToken, createSession } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const row = await consumeLoginToken(token);
  if (!row) return NextResponse.redirect(new URL("/login?expired=1", url.origin));
  await createSession(row.userId);
  const u = await db.query.users.findFirst({ where: eq(users.id, row.userId) });
  const dest = u && (u.roles.includes("ADMIN") || u.roles.includes("STAFF")) ? "/admin" : "/me";
  return NextResponse.redirect(new URL(dest, url.origin));
}
