import { requireUser } from "@/lib/auth";
import { PageHeader, Card, Field, Badge } from "@/components/ui";
import { updateProfile } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { formatPhone } from "@/lib/phone";

export default async function ProfilePage() {
  const me = await requireUser();
  return (
    <>
      <PageHeader title="Profile" kicker={me.roles.map((r) => r.toLowerCase()).join(" · ")} />
      <div className="mx-auto max-w-xl space-y-5">
        <Card title="Contact">
          <form action={updateProfile} className="space-y-3">
            <Field label="Name"><input name="name" defaultValue={me.name} className="input" required /></Field>
            <Field label="Mobile" hint="Game reminders and goalie/ref invites come by text."><input name="phone" defaultValue={formatPhone(me.phone)} className="input" /></Field>
            <Field label="Email"><input name="email" type="email" defaultValue={me.email ?? ""} className="input" /></Field>
            <Field label="Emergency contact"><input name="emergencyContact" defaultValue={me.emergencyContact ?? ""} className="input" placeholder="Name and phone" /></Field>
            <div className="flex flex-wrap gap-4 text-sm font-semibold">
              <label className="flex items-center gap-2"><input type="checkbox" name="smsOptIn" defaultChecked={me.smsOptIn} className="h-4 w-4" /> Text me</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="emailOptIn" defaultChecked={me.emailOptIn} className="h-4 w-4" /> Email me</label>
            </div>
            <SubmitButton>Save</SubmitButton>
          </form>
        </Card>
        <Card title="Text commands">
          <p className="text-sm text-ink-2">You can answer any rink text directly:</p>
          <ul className="mt-2 space-y-1 text-sm"><li><Badge tone="ok">YES</Badge> confirm an invite or RSVP in</li><li><Badge tone="red">NO</Badge> decline or RSVP out</li><li><Badge tone="gray">STOP</Badge> opt out of texts</li></ul>
        </Card>
      </div>
    </>
  );
}
