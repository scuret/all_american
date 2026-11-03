import { PageHeader, Card } from "@/components/ui";
import { PersonForm } from "@/components/person-form";
import { createPerson } from "../actions";
import { getCurrentUser } from "@/lib/auth";

export default async function NewPersonPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  const me = await getCurrentUser();
  return (
    <>
      <PageHeader back={{ href: "/admin/people", label: "People" }} title="Add a person" />
      <Card><PersonForm action={createPerson} defaultRole={role} canGrantAdmin={!!me?.roles.includes("ADMIN")} /></Card>
    </>
  );
}
