import { db } from "@/db";
import { leagues, seasons, tournaments } from "@/db/schema";
import { asc, inArray } from "drizzle-orm";
import { PageHeader, Card, Field } from "@/components/ui";
import { sendBroadcast } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { resolveAudience, audienceLabel, type AudienceType } from "@/lib/audience";
import { ComposeForm } from "./compose-form";

export default async function NewMessagePage({ searchParams }: { searchParams: Promise<{ audience?: string; id?: string }> }) {
  const sp = await searchParams;
  const [lgs, activeSeasons, tourneys] = await Promise.all([
    db.query.leagues.findMany({ orderBy: [asc(leagues.sortOrder)] }),
    db.query.seasons.findMany({ where: inArray(seasons.status, ["ACTIVE", "REGISTRATION"]), with: { league: true, teams: { orderBy: (t, { asc }) => [asc(t.name)] } } }),
    db.query.tournaments.findMany({ orderBy: [asc(tournaments.startDate)] }),
  ]);
  const preset = sp.audience as AudienceType | undefined;
  const presetCount = preset ? (await resolveAudience(preset, sp.id)).length : null;
  const presetLabel = preset ? await audienceLabel(preset, sp.id) : null;
  const options: { value: string; label: string; group: string }[] = [
    { value: "ALL|", label: "Everyone in the system", group: "General" },
    { value: "REFEREES|", label: "All referees", group: "General" },
    { value: "GOALIES|", label: "Goalie pool", group: "General" },
    ...lgs.map((l) => ({ value: `LEAGUE|${l.id}`, label: l.name + " (all active rosters)", group: "Leagues" })),
    ...activeSeasons.flatMap((s) => [{ value: `SEASON|${s.id}`, label: `${s.league.name} · ${s.name}`, group: "Seasons" }, ...s.teams.map((t) => ({ value: `TEAM|${t.id}`, label: `${t.name} (${s.league.name})`, group: "Teams" }))]),
    ...tourneys.map((t) => ({ value: `TOURNAMENT|${t.id}`, label: `${t.name} team contacts`, group: "Tournaments" })),
  ];
  return (
    <>
      <PageHeader back={{ href: "/admin/messages", label: "Messages" }} title="New message" />
      <div className="mx-auto max-w-2xl">
        <Card>
          <ComposeForm action={sendBroadcast} options={options} preset={preset && sp.id !== undefined ? { value: `${preset}|${sp.id ?? ""}`, label: presetLabel ?? "", count: presetCount ?? 0 } : preset ? { value: `${preset}|`, label: presetLabel ?? "", count: presetCount ?? 0 } : undefined} />
        </Card>
        <p className="mt-3 text-xs text-ink-3">Texts go only to people with a mobile number who haven&apos;t replied STOP. Replies come back to the Inbox; YES/NO replies are matched to the person&apos;s most recent pending invite or their next game.</p>
      </div>
    </>
  );
}

