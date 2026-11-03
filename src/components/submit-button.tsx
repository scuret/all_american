"use client";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/format";

export function SubmitButton({ children, className = "btn-primary", pendingText, confirm }: { children: React.ReactNode; className?: string; pendingText?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn("btn", className)}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? pendingText ?? "Working…" : children}
    </button>
  );
}
