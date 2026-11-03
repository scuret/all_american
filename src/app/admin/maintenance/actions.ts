"use server";
import { db } from "@/db";
import { maintenanceTasks, maintenanceLogs, rinkBlocks, equipment, repairTickets } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromZonedTime } from "date-fns-tz";
import { addDays, addMonths } from "date-fns";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string, d = 0) => { const v = Number(f.get(k)); return Number.isFinite(v) ? v : d; };
const tz = "America/Chicago";
type Cadence = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "ONCE";

function nextDue(from: Date, cadence: Cadence) {
  switch (cadence) {
    case "DAILY": return addDays(from, 1);
    case "WEEKLY": return addDays(from, 7);
    case "BIWEEKLY": return addDays(from, 14);
    case "MONTHLY": return addMonths(from, 1);
    case "QUARTERLY": return addMonths(from, 3);
    default: return from;
  }
}

function taskFields(form: FormData) {
  return {
    title: str(form, "title"),
    description: str(form, "description") || null,
    checklist: str(form, "checklist").split("\n").map((s) => s.trim()).filter(Boolean),
    cadence: str(form, "cadence") as Cadence,
    assigneeId: str(form, "assigneeId") || null,
    nextDueAt: fromZonedTime(str(form, "nextDueAt") || new Date().toISOString().slice(0, 10), tz),
    estimatedMinutes: num(form, "estimatedMinutes") || null,
  };
}

export async function createTask(form: FormData) {
  await requireStaff();
  await db.insert(maintenanceTasks).values(taskFields(form));
  revalidatePath("/admin/maintenance");
}
export async function updateTask(id: string, form: FormData) {
  await requireStaff();
  await db.update(maintenanceTasks).set({ ...taskFields(form), active: form.get("active") === "on" }).where(eq(maintenanceTasks.id, id));
  revalidatePath(`/admin/maintenance/tasks/${id}`);
  revalidatePath("/admin/maintenance");
}
export async function completeTask(id: string, form: FormData) {
  const me = await requireStaff();
  const t = await db.query.maintenanceTasks.findFirst({ where: eq(maintenanceTasks.id, id) });
  if (!t) return;
  await db.insert(maintenanceLogs).values({ taskId: id, completedById: me.id, notes: str(form, "notes") || null });
  const base = t.nextDueAt < new Date() ? new Date() : t.nextDueAt;
  await db.update(maintenanceTasks).set({ nextDueAt: nextDue(base, t.cadence), active: t.cadence === "ONCE" ? false : t.active }).where(eq(maintenanceTasks.id, id));
  revalidatePath(`/admin/maintenance/tasks/${id}`);
  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
}
export async function deleteTask(id: string) {
  await requireStaff();
  await db.delete(maintenanceTasks).where(eq(maintenanceTasks.id, id));
  revalidatePath("/admin/maintenance");
  redirect("/admin/maintenance");
}

export async function createBlock(form: FormData) {
  await requireStaff();
  await db.insert(rinkBlocks).values({ title: str(form, "title"), kind: str(form, "kind") || "MAINTENANCE", startsAt: fromZonedTime(str(form, "startsAt"), tz), endsAt: fromZonedTime(str(form, "endsAt"), tz), notes: str(form, "notes") || null });
  revalidatePath("/admin/maintenance");
  revalidatePath("/admin/schedule");
}
export async function deleteBlock(id: string) {
  await requireStaff();
  await db.delete(rinkBlocks).where(eq(rinkBlocks.id, id));
  revalidatePath("/admin/maintenance");
  revalidatePath("/admin/schedule");
}

export async function createEquipment(form: FormData) {
  await requireStaff();
  await db.insert(equipment).values({ name: str(form, "name"), category: str(form, "category") || "Other", quantity: num(form, "quantity", 1), condition: str(form, "condition") || "GOOD", location: str(form, "location") || null, notes: str(form, "notes") || null });
  revalidatePath("/admin/maintenance");
}
export async function updateEquipment(id: string, form: FormData) {
  await requireStaff();
  await db.update(equipment).set({ name: str(form, "name"), category: str(form, "category") || "Other", quantity: num(form, "quantity", 1), condition: str(form, "condition") || "GOOD", location: str(form, "location") || null, notes: str(form, "notes") || null }).where(eq(equipment.id, id));
  revalidatePath("/admin/maintenance");
}
export async function deleteEquipment(id: string) {
  await requireStaff();
  await db.delete(equipment).where(eq(equipment.id, id));
  revalidatePath("/admin/maintenance");
}

export async function createTicket(form: FormData) {
  const me = await requireStaff();
  await db.insert(repairTickets).values({ equipmentId: str(form, "equipmentId") || null, title: str(form, "title"), description: str(form, "description") || null, priority: (str(form, "priority") || "NORMAL") as "LOW" | "NORMAL" | "HIGH" | "URGENT", reportedById: me.id, assigneeId: str(form, "assigneeId") || null });
  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
}
export async function updateTicket(id: string, form: FormData) {
  await requireStaff();
  const status = str(form, "status") as "OPEN" | "IN_PROGRESS" | "CLOSED";
  await db.update(repairTickets).set({ title: str(form, "title"), description: str(form, "description") || null, priority: str(form, "priority") as "LOW" | "NORMAL" | "HIGH" | "URGENT", status, assigneeId: str(form, "assigneeId") || null, equipmentId: str(form, "equipmentId") || null, resolvedAt: status === "CLOSED" ? new Date() : null }).where(eq(repairTickets.id, id));
  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
}
