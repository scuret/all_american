import Link from "next/link";
import { db } from "@/db";
import { users } from "@/db/schema";
import { asc, ilike, or, sql, and } from "drizzle-orm";
import { PageHeader, Card, Badge, Empty } from "@/components/ui";
import { formatPhone } from "@/lib/phone";

const ROLE_TONE: Record<string, "red" | "ok" | "warn" | "gray" | "info" | "ink"> = { ADMIN: "red", STAFF: "ink", CAPTAIN: "warn", PLAYER: "gray", REFEREE: "info", GOALIE: "ok" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string }> }) {
  const { q = "", role = "" } = await searchParams;
  const conds = [];
  if (q) conds.push(or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`), ilike(users.phone, `%${q.replace(/\D/g, "")}%`)));
  if (role) conds.push(sql`${users.roles} @> ARRAY[${role}]::role[]`);
  const list = await db.query.users.findMany({ where: conds.length ? and(...conds) : undefined, orderBy: [asc(users.name)], limit: 200, with: { roster: { with: { team: true } } } });
  const roles = ["ADMIN", "STAFF", "CAPTAIN", "PLAYER", "REFEREE", "GOALIE"];
  return (
    <>
      <PageHeader title="People" kicker="Players, captains, refs, goalies, staff" actions={<Link href="/admin/people/new" className="btn btn-primary">+ Add person</Link>} />
      <Card>
        <form className="mb-4 flex flex-wrap gap-2">
          <input name="q" defaultValue={q} placeholder="Search name, phone, email" className="input flex-1 min-w-48" />
          <select name="role" defaultValue={role} className="select w-44"><option value="">All roles</option>{roles.map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}</select>
          <button className="btn btn-secondary">Filter</button>
        </form>
        {list.length === 0 ? <Empty>No one matches.</Empty> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Roles</th><th>Teams</th><th>Mobile</th><th>Email</th><th>SMS</th></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className={!u.active ? "opacity-50" : ""}>
                  <td><Link href={`/admin/people/${u.id}`} className="font-bold hover:text-red">{u.name}</Link></td>
                  <td className="space-x-1">{u.roles.map((r) => <Badge key={r} tone={ROLE_TONE[r]}>{r.toLowerCase()}</Badge>)}</td>
                  <td className="text-xs">{u.roster.map((r) => <Link key={r.id} href={`/admin/teams/${r.teamId}`} className="mr-2 hover:text-red">{r.team.name}</Link>)}</td>
                  <td className="text-xs">{formatPhone(u.phone)}</td>
                  <td className="text-xs">{u.email}</td>
                  <td>{u.phone ? (u.smsOptIn ? <Badge tone="ok">on</Badge> : <Badge tone="red">off</Badge>) : <span className="text-ink-3">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {list.length === 200 && <p className="mt-2 text-xs text-ink-3">Showing the first 200. Narrow the search to see more.</p>}
      </Card>
    </>
  );
}
