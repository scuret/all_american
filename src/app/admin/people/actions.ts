"use server";
import { db } from "@/db";
import { users, type Role } from "@/db/schema";
import { requireStaff, requireAdmin } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const ROLES: Role[] = ["ADMIN", "STAFF", "CAPTAIN", "PLAYER", "REFEREE", "GOALIE"];
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function rolesFrom(form: FormData): Role[] {
  return ROLES.filter((r) => form.get(`role_${r}`) === "on");
}

export async function createPerson(form: FormData) {
  const me = await requireStaff();
  let roles = rolesFrom(form);
  if (roles.includes("ADMIN") && !me.roles.includes("ADMIN")) roles = roles.filter((r) => r !== "ADMIN");
  if (roles.length === 0) roles = ["PLAYER"];
  const phone = normalizePhone(str(form, "phone"));
  const email = str(form, "email").toLowerCase() || null;
  const [u] = await db.insert(users).values({ name: str(form, "name"), phone, email, roles, smsOptIn: !!phone && form.get("smsOptIn") !== "off", birthYear: Number(str(form, "birthYear")) || null, emergencyContact: str(form, "emergencyContact") || null, notes: str(form, "notes") || null }).returning();
  revalidatePath("/admin/people");
  redirect(`/admin/people/${u.id}`);
}

export async function updatePerson(id: string, form: FormData) {
  const me = await requireStaff();
  const existing = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!existing) return;
  let roles = rolesFrom(form);
  if (!me.roles.includes("ADMIN")) {
    // staff can't grant or revoke admin
    roles = roles.filter((r) => r !== "ADMIN");
    if (existing.roles.includes("ADMIN")) roles.push("ADMIN");
  }
  const phone = normalizePhone(str(form, "phone"));
  await db.update(users).set({
    name: str(form, "name"),
    phone,
    email: str(form, "email").toLowerCase() || null,
    roles,
    smsOptIn: form.get("smsOptIn") === "on" && !!phone,
    emailOptIn: form.get("emailOptIn") === "on",
    active: form.get("active") === "on",
    birthYear: Number(str(form, "birthYear")) || null,
    emergencyContact: str(form, "emergencyContact") || null,
    notes: str(form, "notes") || null,
  }).where(eq(users.id, id));
  revalidatePath(`/admin/people/${id}`);
  revalidatePath("/admin/people");
}

export async function deletePerson(id: string) {
  const me = await requireAdmin();
  if (me.id === id) return;
  await db.delete(users).where(eq(users.id, id));
  revalidatePath("/admin/people");
  redirect("/admin/people");
}
