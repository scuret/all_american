import { Field } from "./ui";
import { SubmitButton } from "./submit-button";
import type { User } from "@/db/schema";
import { formatPhone } from "@/lib/phone";

const ROLES = [
  ["PLAYER", "Player", "Sees their schedule, RSVPs to games"],
  ["CAPTAIN", "Captain", "Manages a roster and team fee"],
  ["GOALIE", "Goalie", "In the pool for goalie invites"],
  ["REFEREE", "Referee", "Gets ref assignments"],
  ["STAFF", "Staff", "Rink office access"],
  ["ADMIN", "Admin", "Everything, including staff accounts"],
] as const;

export function PersonForm({ user, action, defaultRole, canGrantAdmin }: { user?: User; action: (f: FormData) => Promise<void>; defaultRole?: string; canGrantAdmin: boolean }) {
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <Field label="Full name"><input name="name" defaultValue={user?.name} className="input" required /></Field>
      <Field label="Birth year" hint="Optional. Used for youth divisions and Over 30."><input name="birthYear" type="number" defaultValue={user?.birthYear ?? ""} className="input" /></Field>
      <Field label="Mobile"><input name="phone" defaultValue={user ? formatPhone(user.phone) : ""} className="input" placeholder="(314) 555-0123" /></Field>
      <Field label="Email"><input name="email" type="email" defaultValue={user?.email ?? ""} className="input" /></Field>
      <div className="md:col-span-2">
        <span className="label">Roles</span>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROLES.map(([key, label, hint]) => (
            <label key={key} className={`flex items-start gap-2 rounded-md border hairline p-2.5 text-sm ${key === "ADMIN" && !canGrantAdmin ? "opacity-50" : ""}`}>
              <input type="checkbox" name={`role_${key}`} defaultChecked={user ? user.roles.includes(key) : defaultRole === key || (!defaultRole && key === "PLAYER")} disabled={key === "ADMIN" && !canGrantAdmin} className="mt-0.5 h-4 w-4" />
              <span><b>{label}</b><br /><span className="text-xs text-ink-3">{hint}</span></span>
            </label>
          ))}
        </div>
      </div>
      <Field label="Emergency contact"><input name="emergencyContact" defaultValue={user?.emergencyContact ?? ""} className="input" /></Field>
      <Field label="Notes"><input name="notes" defaultValue={user?.notes ?? ""} className="input" /></Field>
      {user && (
        <div className="flex flex-wrap gap-4 md:col-span-2 text-sm font-semibold">
          <label className="flex items-center gap-2"><input type="checkbox" name="smsOptIn" defaultChecked={user.smsOptIn} className="h-4 w-4" /> Text messages</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="emailOptIn" defaultChecked={user.emailOptIn} className="h-4 w-4" /> Emails</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={user.active} className="h-4 w-4" /> Active</label>
        </div>
      )}
      <div className="md:col-span-2"><SubmitButton>{user ? "Save" : "Add person"}</SubmitButton></div>
    </form>
  );
}
