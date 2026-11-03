"use client";
import { useState } from "react";
import { Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const TEMPLATES = [
  { label: "Game reminder", body: "Reminder: your game is {day} at {time} at All American. Reply YES if you're in, NO if you're out." },
  { label: "Fees due", body: "Team fees are due by week 3. Pay at the front desk or call (314) 487-4625. Thanks!" },
  { label: "Schedule change", body: "Schedule change: {details}. Check the updated schedule at {link}." },
  { label: "Rink closed", body: "The rink is closed {day} for {reason}. Games that night will be rescheduled; we'll text the new dates." },
  { label: "Goalie needed", body: "We need a goalie for {team} on {day} at {time}. Reply YES if you can play." },
];

export function ComposeForm({ action, options, preset }: { action: (f: FormData) => Promise<void>; options: { value: string; label: string; group: string }[]; preset?: { value: string; label: string; count: number } }) {
  const [channel, setChannel] = useState<"SMS" | "EMAIL">("SMS");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState(preset?.value ?? "ALL|");
  const groups = [...new Set(options.map((o) => o.group))];
  const [type, id] = audience.split("|");
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="audienceType" value={type} />
      <input type="hidden" name="audienceId" value={id} />
      <Field label="Send to">
        {preset && audience === preset.value ? (
          <div className="flex items-center justify-between rounded-md border hairline bg-paper-2 px-3 py-2.5 text-sm"><span className="font-semibold">{preset.label} <span className="text-ink-3">· {preset.count} people</span></span><button type="button" className="text-xs text-red" onClick={() => setAudience("ALL|")}>change</button></div>
        ) : (
          <select className="select" value={audience} onChange={(e) => setAudience(e.target.value)}>
            {groups.map((g) => <optgroup key={g} label={g}>{options.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>)}
          </select>
        )}
      </Field>
      <Field label="Channel">
        <div className="grid grid-cols-2 gap-2">
          {(["SMS", "EMAIL"] as const).map((c) => (
            <label key={c} className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-bold ${channel === c ? "border-red bg-[#fde8e8] text-red" : "hairline"}`}>
              <input type="radio" name="channel" value={c} checked={channel === c} onChange={() => setChannel(c)} className="sr-only" />{c === "SMS" ? "Text message" : "Email"}
            </label>
          ))}
        </div>
      </Field>
      {channel === "EMAIL" && <Field label="Subject"><input name="subject" className="input" required /></Field>}
      <Field label="Message">
        <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} className="textarea" rows={5} required maxLength={channel === "SMS" ? 480 : 5000} />
        <div className="mt-1 flex items-center justify-between text-xs text-ink-3"><span>{channel === "SMS" ? `${body.length}/160 per segment · ${Math.max(1, Math.ceil(body.length / 160))} segment${body.length > 160 ? "s" : ""}` : `${body.length} characters`}</span></div>
      </Field>
      <div className="flex flex-wrap gap-1.5">{TEMPLATES.map((t) => <button key={t.label} type="button" onClick={() => setBody(t.body)} className="rounded-full border hairline bg-white px-2.5 py-1 text-xs font-semibold hover:border-red hover:text-red">{t.label}</button>)}</div>
      <SubmitButton className="btn-primary w-full" pendingText="Sending…" confirm={`Send this ${channel === "SMS" ? "text" : "email"} now?`}>Send {channel === "SMS" ? "text" : "email"}</SubmitButton>
    </form>
  );
}
