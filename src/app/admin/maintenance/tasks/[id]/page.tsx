import { notFound } from "next/navigation";
import { db } from "@/db";
import { maintenanceTasks, users } from "@/db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import { PageHeader, Card, Field, Empty, Badge } from "@/components/ui";
import { updateTask, completeTask, deleteTask } from "../../actions";
import { SubmitButton } from "@/components/submit-button";
import { fmtDateTime, fmtYmd } from "@/lib/format";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await db.query.maintenanceTasks.findFirst({ where: eq(maintenanceTasks.id, id), with: { assignee: true, logs: { with: { completedBy: true }, orderBy: [desc(sql`completed_at`)], limit: 30 } } });
  if (!t) notFound();
  const staff = await db.query.users.findMany({ where: sql`${users.roles} && ARRAY['STAFF','ADMIN']::role[]`, orderBy: [asc(users.name)] });
  const overdue = t.active && t.nextDueAt < new Date();
  return (
    <>
      <PageHeader back={{ href: "/admin/maintenance", label: "Rink Ops" }} title={t.title} kicker={t.cadence.toLowerCase()} actions={overdue ? <Badge tone="red">Overdue</Badge> : <Badge tone="gray">Due {fmtDateTime(t.nextDueAt)}</Badge>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Complete this task">
            {t.checklist.length > 0 && (
              <ul className="mb-4 space-y-2">{t.checklist.map((c, i) => <li key={i} className="flex items-center gap-3 rounded-md border hairline p-3 text-sm"><input type="checkbox" className="h-5 w-5" /> {c}</li>)}</ul>
            )}
            {t.description && <p className="mb-4 text-sm text-ink-3">{t.description}</p>}
            <form action={completeTask.bind(null, t.id)} className="space-y-3">
              <Field label="Notes (optional)"><input name="notes" className="input" placeholder="Anything to flag?" /></Field>
              <SubmitButton className="btn-ok" pendingText="Logging…">✓ Mark complete</SubmitButton>
            </form>
          </Card>
          <Card title="History">
            {t.logs.length === 0 ? <Empty>Never completed.</Empty> : <ul className="divide-y hairline text-sm">{t.logs.map((l) => <li key={l.id} className="flex justify-between py-2"><span>{fmtDateTime(l.completedAt)}{l.notes && <span className="ml-2 text-ink-3">· {l.notes}</span>}</span><span className="text-xs text-ink-3">{l.completedBy?.name}</span></li>)}</ul>}
          </Card>
        </div>
        <div className="space-y-5">
          <Card title="Settings">
            <form action={updateTask.bind(null, t.id)} className="space-y-3">
              <Field label="Title"><input name="title" defaultValue={t.title} className="input" /></Field>
              <Field label="Cadence"><select name="cadence" defaultValue={t.cadence} className="select">{["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "ONCE"].map((c) => <option key={c} value={c}>{c.toLowerCase()}</option>)}</select></Field>
              <Field label="Next due"><input name="nextDueAt" type="date" defaultValue={fmtYmd(t.nextDueAt)} className="input" /></Field>
              <Field label="Assign to"><select name="assigneeId" defaultValue={t.assigneeId ?? ""} className="select"><option value="">Unassigned</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
              <Field label="Est. minutes"><input name="estimatedMinutes" type="number" defaultValue={t.estimatedMinutes ?? ""} className="input" /></Field>
              <Field label="Checklist (one per line)"><textarea name="checklist" defaultValue={t.checklist.join("\n")} className="textarea" rows={5} /></Field>
              <Field label="Notes"><textarea name="description" defaultValue={t.description ?? ""} className="textarea" rows={2} /></Field>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="active" defaultChecked={t.active} className="h-4 w-4" /> Active</label>
              <SubmitButton>Save</SubmitButton>
            </form>
          </Card>
          <Card title="Danger zone"><form action={deleteTask.bind(null, t.id)}><SubmitButton className="btn-danger btn-sm" confirm="Delete this task and its history?">Delete task</SubmitButton></form></Card>
        </div>
      </div>
    </>
  );
}
