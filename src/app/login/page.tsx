import { Logo } from "@/components/ui";
import { LoginForm } from "./login-form";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to All American Inline Hockey to see your schedule, confirm games, and get rink updates.",
  openGraph: { title: "Sign in · All American Inline Hockey", url: "/login" },
};

export default async function LoginPage() {
  const u = await getCurrentUser();
  if (u) redirect(u.roles.includes("ADMIN") || u.roles.includes("STAFF") ? "/admin" : "/me");
  return (
    <div className="flex min-h-dvh flex-col bg-red stripe">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <Link href="/" className="mb-8 self-center"><Logo className="h-14" /></Link>
        <div className="card card-pad shadow-xl">
          <h1 className="text-xl">Sign in</h1>
          <p className="mt-1 text-sm text-ink-3">Enter your mobile number for a text code, or your email for a sign-in link. No password needed.</p>
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-white/80">
          Not in the system yet? Call the rink at (314) 487-4625 or email allamericanhockey85@gmail.com.
        </p>
      </div>
    </div>
  );
}
