import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/db";
import { users, loginTokens, type User, type Role } from "@/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";

const COOKIE = "aa_session";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret");

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const id = payload.sub as string;
    const user = await db.query.users.findFirst({ where: eq(users.id, id) });
    return user && user.active ? user : null;
  } catch {
    return null;
  }
});

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export function hasRole(u: User | null, ...roles: Role[]) {
  if (!u) return false;
  return roles.some((r) => u.roles.includes(r));
}

export function isStaff(u: User | null) {
  return hasRole(u, "ADMIN", "STAFF");
}

export async function requireStaff(): Promise<User> {
  const u = await requireUser();
  if (!isStaff(u)) redirect("/me");
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (!hasRole(u, "ADMIN")) redirect("/admin");
  return u;
}

// ---------- Login tokens ----------
export function sixDigit() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function issueLoginToken(userId: string, channel: "SMS" | "EMAIL") {
  const code = channel === "SMS" ? sixDigit() : createMagicCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const [row] = await db
    .insert(loginTokens)
    .values({ userId, code, channel, expiresAt })
    .returning();
  return row;
}

function createMagicCode() {
  // 32 chars, URL safe
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function consumeLoginToken(code: string, userId?: string) {
  const where = userId
    ? and(eq(loginTokens.code, code), eq(loginTokens.userId, userId), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, new Date()))
    : and(eq(loginTokens.code, code), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, new Date()));
  const row = await db.query.loginTokens.findFirst({ where });
  if (!row) return null;
  await db.update(loginTokens).set({ usedAt: new Date() }).where(eq(loginTokens.id, row.id));
  return row;
}
