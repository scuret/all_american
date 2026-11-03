import Link from "next/link";
import { db } from "@/db";
import { maintenanceTasks, rinkBlocks, equipment, repairTickets, users } from "@/db/schema";
import { asc, desc, gte, sql } from "drizzle-orm";
import { PageHeader, Card, StatusBadge, Field, Empty, Tabs, Badge, Stat } from "@/components/ui";
import { createTask, completeTask, createBlock, deleteBlock, createEquipment, updateEquipment, deleteEquipment, createTicket, updateTicket } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { fmtDate, fmtDateTime, fmtInputDateTime, fmtYmd } from "@/lib/format";

const CADENCE_LABEL: Record<string, string> = { DAILY: "Daily", WEEKLY: "Weekly", BIWEEKLY: "Every 2 weeks", MONTHLY: "Monthly", QUARTERLY: "Quarterly", ONCE: "One time" };
const COND_TONE: Record<string, "ok" | "warn" | "red" | "gray"> = { GOOD: "ok", FAIR: "warn", POOR: "red", OUT_OF_SERVICE: "gray" };
const PRI_TONE: Record<string, "gray" | "info" | "warn" | "red"> = { LOW: "gray", NORMAL: "info", HIGH: "warn", URGENT: "red" };

export default async function MaintenancePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "tasks" } = await searchParams;
  const now = new Date();
  const [tasks, blocks, gear, tickets, staff] = await Promise.all([
    db.query.maintenanceTasks.findMany({ orderBy: [asc(maintenanceTasks.nextDueAt)], with: { assignee: true, logs: { orderBy: [desc(sql`completed_at`)], limit: 1 } } }),
    db.select().from(rinkBlocks).where(gte(rinkBlocks.endsAt, now)).orderBy(asc(rinkBlocks.startsAt)),
    db.select().from(equipment).orderBy(asc(equipment.category), asc(equipment.name)),
    db.query.repairTickets.findMany({ orderBy: [desc(repairTickets.createdAt)], with: { equipment: true, reportedBy: true, assignee: true } }),
    db.query.users.findMany({ where: sql`${users.roles} && ARRAY['STAFF','ADMIN']::role[]`, orderBy: [asc(users.name)] }),
  ]);
  const staffList = staff;
  const overdue = tasks.filter((t) => t.active && t.nextDueAt < now);
  const dueSoon = tasks.filter((t) => t.active && t.nextDueAt >= now && t.nextDueAt < new Date(now.getTime() + 3 * 86400000));
  const openTickets = tickets.filter((t) => t.status !== "CLOSED");
  const base = "/admin/maintenance";

  return (
    <>
      <PageHeader title="Rink Ops" kicker="Maintenance, rink time, equipment" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Overdue tasks" value={overdue.length} tone={overdue.length ? "red" : "ok"} />
        <Stat label="Due in 3 days" value={dueSoon.length} tone={dueSoon.length ? "warn" : "ok"} />
        <Stat label="Open tickets" value={openTickets.length} tone={openTickets.length ? "warn" : "ok"} />
        <Stat label="Upcoming blocks" value={blocks.length} />
      </div>
      <Tabs items={[
        { href: `${base}?tab=tasks`, label: "Recurring tasks", active: tab === "tasks", count: overdue.length },
        { href: `${base}?tab=blocks`, label: "Rink time blocks", active: tab === "blocks" },
        { href: `${base}?tab=equipment`, label: "Equipment", active: tab === "equipment" },
        { href: `${base}?tab=tickets`, label: "Repair tickets", active: tab === "tickets", count: openTickets.length },
      ]} />

      {tab === "tasks" && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Task schedule" className="lg:col-span-2">
            <table className="table">
              <thead><tr><th>Task</th><th>Cadence</th><th>Assigned</th><th>Due</th><th>Last done</th><th></th></tr></thead>
              <tbody>
                {tasks.map((t) => {
                  const isOver = t.active && t.nextDueAt < now;
                  return (
                    <tr key={t.id} className={!t.active ? "opacity-50" : ""}>
                      <td><Link href={`/admin/maintenance/tasks/${t.id}`} className="font-bold hover:text-red">{t.title}</Link>{t.checklist.length > 0 && <div className="text-xs text-ink-3">{t.checklist.length} checklist items{t.estimatedMinutes ? ` · ~${t.estimatedMinutes} min` : ""}</div>}</td>
                      <td className="text-xs">{CADENCE_LABEL[t.cadence]}</td>
                      <td className="text-xs">{t.assignee?.name ?? <span className="text-ink-3">Unassigned</span>}</td>
                      <td>{isOver ? <Badge tone="red">Overdue · {fmtDate(t.nextDueAt)}</Badge> : <span className="text-xs">{fmtDate(t.nextDueAt)}</span>}</td>
                      <td className="text-xs text-ink-3">{t.logs[0] ? fmtDate(t.logs[0].completedAt) : "never"}</td>
                      <td className="text-right"><form action={completeTask.bind(null, t.id)}><SubmitButton className="btn-ok btn-sm" pendingText="…">✓ Done</SubmitButton></form></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <Card title="New recurring task">
            <form action={createTask} className="space-y-3">
              <Field label="Title"><input name="title" className="input" required /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cadence"><select name="cadence" className="select">{Object.entries(CADENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="First due"><input name="nextDueAt" type="date" defaultValue={fmtYmd(now)} className="input" /></Field>
              </div>
              <Field label="Assign to"><select name="assigneeId" className="select"><option value="">Unassigned</option>{staffList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
              <Field label="Est. minutes"><input name="estimatedMinutes" type="number" className="input" /></Field>
              <Field label="Checklist (one per line)"><textarea name="checklist" className="textarea" rows={4} /></Field>
              <Field label="Notes"><textarea name="description" className="textarea" rows={2} /></Field>
              <SubmitButton>Add task</SubmitButton>
            </form>
          </Card>
        </div>
      )}

      {tab === "blocks" && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Upcoming blocks" className="lg:col-span-2">
            <p className="mb-3 text-xs text-ink-3">The schedule generator skips any game slot that overlaps a block. Existing games are not moved automatically; check the calendar.</p>
            {blocks.length === 0 ? <Empty>No upcoming blocks.</Empty> : (
              <table className="table"><thead><tr><th>Block</th><th>Type</th><th>From</th><th>To</th><th></th></tr></thead><tbody>
                {blocks.map((b) => <tr key={b.id}><td><div className="font-bold">{b.title}</div>{b.notes && <div className="text-xs text-ink-3">{b.notes}</div>}</td><td><Badge tone={b.kind === "CLOSED" ? "red" : b.kind === "MAINTENANCE" ? "warn" : "info"}>{b.kind.toLowerCase()}</Badge></td><td className="text-xs">{fmtDateTime(b.startsAt)}</td><td className="text-xs">{fmtDateTime(b.endsAt)}</td><td className="text-right"><form action={deleteBlock.bind(null, b.id)}><button className="text-xs text-ink-3 hover:text-red">Remove</button></form></td></tr>)}
              </tbody></table>
            )}
          </Card>
          <Card title="Block rink time">
            <form action={createBlock} className="space-y-3">
              <Field label="Title"><input name="title" className="input" placeholder="Floor resurfacing, private rental…" required /></Field>
              <Field label="Type"><select name="kind" className="select"><option value="MAINTENANCE">Maintenance</option><option value="RENTAL">Rental</option><option value="EVENT">Event</option><option value="CLOSED">Closed</option></select></Field>
              <Field label="From"><input name="startsAt" type="datetime-local" className="input" defaultValue={fmtInputDateTime(now)} required /></Field>
              <Field label="To"><input name="endsAt" type="datetime-local" className="input" defaultValue={fmtInputDateTime(new Date(now.getTime() + 2 * 3600000))} required /></Field>
              <Field label="Notes"><input name="notes" className="input" /></Field>
              <SubmitButton>Add block</SubmitButton>
            </form>
          </Card>
        </div>
      )}

      {tab === "equipment" && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Inventory" className="lg:col-span-2">
            <table className="table"><thead><tr><th>Item</th><th>Category</th><th>Qty</th><th>Condition</th><th>Location</th><th></th></tr></thead><tbody>
              {gear.map((e) => (
                <tr key={e.id}>
                  <td colSpan={6} className="!p-0">
                    <details className="group">
                      <summary className="grid cursor-pointer list-none grid-cols-[2fr_1fr_.5fr_1fr_1fr_auto] items-center gap-2 px-3 py-2.5 text-sm">
                        <span className="font-bold">{e.name}</span><span className="text-xs">{e.category}</span><span className="tabular-nums">{e.quantity}</span><span><Badge tone={COND_TONE[e.condition] ?? "gray"}>{e.condition.replace("_", " ").toLowerCase()}</Badge></span><span className="text-xs text-ink-3">{e.location}</span><span className="text-ink-3">▾</span>
                      </summary>
                      <form action={updateEquipment.bind(null, e.id)} className="grid gap-3 border-t hairline bg-paper-2 p-3 md:grid-cols-3">
                        <Field label="Name"><input name="name" defaultValue={e.name} className="input" /></Field>
                        <Field label="Category"><input name="category" defaultValue={e.category} className="input" /></Field>
                        <Field label="Quantity"><input name="quantity" type="number" defaultValue={e.quantity} className="input" /></Field>
                        <Field label="Condition"><select name="condition" defaultValue={e.condition} className="select"><option value="GOOD">Good</option><option value="FAIR">Fair</option><option value="POOR">Poor</option><option value="OUT_OF_SERVICE">Out of service</option></select></Field>
                        <Field label="Location"><input name="location" defaultValue={e.location ?? ""} className="input" /></Field>
                        <Field label="Notes"><input name="notes" defaultValue={e.notes ?? ""} className="input" /></Field>
                        <div className="flex items-center gap-3 md:col-span-3"><SubmitButton className="btn-secondary btn-sm">Save</SubmitButton><button formAction={deleteEquipment.bind(null, e.id)} className="text-xs text-ink-3 hover:text-red">Delete</button></div>
                      </form>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody></table>
          </Card>
          <Card title="Add equipment">
            <form action={createEquipment} className="space-y-3">
              <Field label="Name"><input name="name" className="input" required /></Field>
              <Field label="Category"><input name="category" className="input" list="cats" /><datalist id="cats">{[...new Set(gear.map((g) => g.category))].map((c) => <option key={c} value={c} />)}</datalist></Field>
              <div className="grid grid-cols-2 gap-3"><Field label="Quantity"><input name="quantity" type="number" defaultValue={1} className="input" /></Field><Field label="Condition"><select name="condition" className="select"><option value="GOOD">Good</option><option value="FAIR">Fair</option><option value="POOR">Poor</option><option value="OUT_OF_SERVICE">Out of service</option></select></Field></div>
              <Field label="Location"><input name="location" className="input" /></Field>
              <Field label="Notes"><input name="notes" className="input" /></Field>
              <SubmitButton>Add</SubmitButton>
            </form>
          </Card>
        </div>
      )}

      {tab === "tickets" && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Repair tickets" className="lg:col-span-2">
            {tickets.length === 0 ? <Empty>No tickets.</Empty> : tickets.map((t) => (
              <details key={t.id} className="group border-b hairline py-3 last:border-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <div><div className="font-bold">{t.title}</div><div className="text-xs text-ink-3">{t.equipment?.name ? `${t.equipment.name} · ` : ""}reported by {t.reportedBy?.name ?? "staff"} {fmtDate(t.createdAt)}{t.assignee ? ` · assigned to ${t.assignee.name}` : ""}</div></div>
                  <div className="flex items-center gap-2"><Badge tone={PRI_TONE[t.priority]}>{t.priority.toLowerCase()}</Badge><StatusBadge status={t.status} /><span className="text-ink-3">▾</span></div>
                </summary>
                <form action={updateTicket.bind(null, t.id)} className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="md:col-span-2"><Field label="Title"><input name="title" defaultValue={t.title} className="input" /></Field></div>
                  <Field label="Status"><select name="status" defaultValue={t.status} className="select"><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="CLOSED">Closed</option></select></Field>
                  <Field label="Priority"><select name="priority" defaultValue={t.priority} className="select"><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></Field>
                  <Field label="Assign to"><select name="assigneeId" defaultValue={t.assigneeId ?? ""} className="select"><option value="">Unassigned</option>{staffList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
                  <Field label="Equipment"><select name="equipmentId" defaultValue={t.equipmentId ?? ""} className="select"><option value="">None</option>{gear.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
                  <div className="md:col-span-3"><Field label="Description"><textarea name="description" defaultValue={t.description ?? ""} className="textarea" rows={2} /></Field></div>
                  <div className="md:col-span-3"><SubmitButton className="btn-secondary btn-sm">Save</SubmitButton></div>
                </form>
              </details>
            ))}
          </Card>
          <Card title="Report a problem">
            <form action={createTicket} className="space-y-3">
              <Field label="What's wrong?"><input name="title" className="input" required /></Field>
              <Field label="Equipment"><select name="equipmentId" className="select"><option value="">Not equipment-specific</option>{gear.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
              <div className="grid grid-cols-2 gap-3"><Field label="Priority"><select name="priority" className="select" defaultValue="NORMAL"><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></Field><Field label="Assign to"><select name="assigneeId" className="select"><option value="">Unassigned</option>{staffList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field></div>
              <Field label="Details"><textarea name="description" className="textarea" rows={3} /></Field>
              <SubmitButton>Open ticket</SubmitButton>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
