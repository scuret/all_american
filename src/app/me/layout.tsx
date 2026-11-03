import { AppShell, PORTAL_NAV } from "@/components/shell";
import { requireUser } from "@/lib/auth";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell user={user} nav={PORTAL_NAV} title="Player Portal">
      {children}
    </AppShell>
  );
}
