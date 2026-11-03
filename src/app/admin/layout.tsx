import { AppShell, ADMIN_NAV } from "@/components/shell";
import { requireStaff } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  return (
    <AppShell user={user} nav={ADMIN_NAV} title="Rink Office">
      {children}
    </AppShell>
  );
}
