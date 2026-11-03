"use server";
import { db } from "@/db";
import { rsvps, users, rosterEntries, teams } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { respondGoalie, respondRef } from "@/lib/assignments";
import { normalizePhone } from "@/lib/phone";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function setRsvp(gameId: string, status: "IN" | "OUT" | "MAYBE") {
  const me = await requireUser();
  await db.insert(rsvps).values({ gameId, userId: me.id, status }).onConflictDoUpdate({ target: [rsvps.gameId, rsvps.userId], set: { status, updatedAt: new Date() } });
  revalidatePath("/me");
}

export async function respondGoalieAction(assignmentId: string, accept: boolean) {
  const me = await requireUser();
  await respondGoalie(assignmentId, me.id, accept);
  revalidatePath("/me/assignments");
  revalidatePath("/me");
}

export async function respondRefAction(assignmentId: string, accept: boolean) {
  const me = await requireUser();
  await respondRef(assignmentId, me.id, accept);
  revalidatePath("/me/assignments");
  revalidatePath("/me");
}

export async function updateProfile(form: FormData) {
  const me = await requireUser();
  const phone = normalizePhone(str(form, "phone"));
  await db.update(users).set({
    name: str(form, "name") || me.name,
    phone,
    email: str(form, "email").toLowerCase() || null,
    smsOptIn: form.get("smsOptIn") === "on" && !!phone,
    emailOptIn: form.get("emailOptIn") === "on",
    emergencyContact: str(form, "emergencyContact") || null,
  }).where(eq(users.id, me.id));
  revalidatePath("/me/profile");
}

/** Captain: toggle "team brings own goalie" and name the goalie from the roster. */
export async function captainUpdateTeam(teamId: string, form: FormData) {
  const me = await requireUser();
  const t = await db.query.teams.findFirst({ where: eq(teams.id, teamId) });
  if (!t || (t.captainId !== me.id && !me.roles.includes("ADMIN") && !me.roles.includes("STAFF"))) return;
  const hasOwnGoalie = form.get("hasOwnGoalie") === "on";
  const goalieUserId = str(form, "goalieUserId") || null;
  await db.update(teams).set({ hasOwnGoalie, goalieUserId: hasOwnGoalie ? goalieUserId : null }).where(eq(teams.id, teamId));
  revalidatePath("/me/team");
}

export async function captainAddPlayer(teamId: string, form: FormData) {
  const me = await requireUser();
  const t = await db.query.teams.findFirst({ where: eq(teams.id, teamId) });
  if (!t || t.captainId !== me.id) return;
  const name = str(form, "name");
  const phone = normalizePhone(str(form, "phone"));
  const email = str(form, "email").toLowerCase() || null;
  if (!name) return;
  let u = phone ? await db.query.users.findFirst({ where: eq(users.phone, phone) }) : null;
  if (!u && email) u = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!u) [u] = await db.insert(users).values({ name, phone, email, roles: ["PLAYER"], smsOptIn: !!phone }).returning();
  await db.insert(rosterEntries).values({ teamId, userId: u.id, jerseyNumber: str(form, "jerseyNumber") || null, position: str(form, "position") || null }).onConflictDoNothing();
  revalidatePath("/me/team");
}

export async function captainRemovePlayer(teamId: string, userId: string) {
  const me = await requireUser();
  const t = await db.query.teams.findFirst({ where: eq(teams.id, teamId) });
  if (!t || t.captainId !== me.id || userId === me.id) return;
  await db.delete(rosterEntries).where(and(eq(rosterEntries.teamId, teamId), eq(rosterEntries.userId, userId)));
  revalidatePath("/me/team");
}
