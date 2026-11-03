import Link from "next/link";
import { db } from "@/db";
import { leagues } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader, Card, Badge, StatusBadge, Field } from "@/components/ui";
import { DAY_NAMES } from "@/lib/schedule";
import { createLeague } from "./actions";
import { SubmitButton } from "@/components/submit-button";

export default async function LeaguesPage() {
  const list = await db.query.leagues.findMany({ orderBy: [asc(leagues.sortOrder), asc(leagues.name)], with: { seasons: { with: { teams: true } } } });
  const adult = list.filter((l) => l.type === "ADULT");
  const youth = list.filter((l) => l.type === "YOUTH");
  const section = (title: string, items: typeof list) => (
    <Card title={title}>
      <table className="table">
        <thead><tr><th>League</th><th>Night</th><th>Level</th><th>Current season</th><th className="text-right">Teams</th></tr></thead>
        <tbody>
          {items.map((l) => {
            const cur = l.seasons.find((s) => s.status === "ACTIVE") ?? l.seasons.find((s) => s.status === "REGISTRATION") ?? l.seasons[l.seasons.length - 1];
            return (
              <tr key={l.id} className={!l.active ? "opacity-50" : ""}>
                <td><Link href={`/admin/leagues/${l.id}`} className="font-bold hover:text-red">{l.name}</Link>{!l.active && <Badge tone="gray">inactive</Badge>}</td>
                <td>{DAY_NAMES[l.dayOfWeek]}</td>
                <td className="text-ink-3">{l.skillLevel}</td>
                <td>{cur ? <Link href={`/admin/seasons/${cur.id}`} className="hover:text-red">{cur.name} <StatusBadge status={cur.status} /></Link> : <span className="text-ink-3">none</span>}</td>
                <td className="text-right tabular-nums">{cur?.teams.length ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
  return (
    <>
      <PageHeader title="Leagues" kicker="Adult and youth" />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {section("Adult leagues", adult)}
          {section("Youth leagues", youth)}
        </div>
        <Card title="Add a league">
          <form action={createLeague} className="space-y-3">
            <Field label="Name"><input name="name" className="input" placeholder="Friday Adult C" required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type"><select name="type" className="select"><option value="ADULT">Adult</option><option value="YOUTH">Youth</option></select></Field>
              <Field label="Night"><select name="dayOfWeek" className="select">{DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></Field>
            </div>
            <Field label="Level / division"><input name="skillLevel" className="input" placeholder="All Levels, B/C, 12U…" /></Field>
            <Field label="Description"><textarea name="description" className="textarea" rows={2} /></Field>
            <input type="hidden" name="sortOrder" value="50" />
            <SubmitButton>Create league</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
