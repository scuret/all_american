"use client";
import { useActionState } from "react";
import { requestLogin, verifyCode, type LoginState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

export function LoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(requestLogin, {});
  const [vstate, vaction] = useActionState<LoginState, FormData>(verifyCode, {});

  if (state.sent === "SMS" && state.userId) {
    return (
      <form action={vaction} className="mt-5 space-y-4">
        <input type="hidden" name="userId" value={state.userId} />
        <div className="rounded-md bg-ice p-3 text-sm">We texted a 6-digit code to <b>{state.to}</b>.</div>
        {state.devCode && (
          <div className="rounded-md border border-dashed border-info bg-[#e3effa] p-3 text-xs text-info">
            <b>Dev mode:</b> texting isn&apos;t configured, so here&apos;s your code: <span className="font-mono text-base">{state.devCode}</span>
          </div>
        )}
        <label className="block">
          <span className="label">Code</span>
          <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="input text-center text-2xl tracking-[.4em] font-mono" autoFocus required />
        </label>
        {vstate.error && <p className="text-sm font-semibold text-red">{vstate.error}</p>}
        <SubmitButton className="btn-primary w-full" pendingText="Checking…">Sign in</SubmitButton>
      </form>
    );
  }
  if (state.sent === "EMAIL") {
    return (
      <div className="mt-5 space-y-3 text-sm">
        <div className="rounded-md bg-ice p-3">We emailed a sign-in link to <b>{state.to}</b>. Open it on this device.</div>
        {state.devCode && (
          <div className="rounded-md border border-dashed border-info bg-[#e3effa] p-3 text-xs text-info">
            <b>Dev mode:</b> email isn&apos;t configured. <a className="underline" href={`/login/verify?token=${state.devCode}`}>Click here to sign in.</a>
          </div>
        )}
      </div>
    );
  }
  return (
    <form action={action} className="mt-5 space-y-4">
      <label className="block">
        <span className="label">Mobile number or email</span>
        <input name="identifier" className="input" placeholder="(314) 555-0123 or you@email.com" autoComplete="username" autoFocus required />
      </label>
      {state.error && <p className="text-sm font-semibold text-red">{state.error}</p>}
      <SubmitButton className="btn-primary w-full" pendingText="Sending…">Continue</SubmitButton>
    </form>
  );
}
