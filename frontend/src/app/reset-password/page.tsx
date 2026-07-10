"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { authApi } from "@/lib/api/resources";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Logo } from "@/components/ui/Logo";

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    if (!token) {
      setError("This reset link is missing its token");
      return;
    }
    setSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5 rounded-card-lg border border-border bg-white p-[26px] shadow-[0_2px_10px_rgba(27,67,50,.07)]">
      <div className="text-base font-bold">Choose a new password</div>

      {!token && (
        <div className="rounded-xl bg-alert-red-bg p-3 text-[12.5px] text-alert-red-text">
          This reset link is invalid — request a new one from the{" "}
          <Link href="/forgot-password" className="font-bold underline">
            forgot password
          </Link>{" "}
          page.
        </div>
      )}

      {token && done && (
        <div className="rounded-xl bg-mint-100 p-3 text-[12.5px] text-forest-700">
          Password updated — redirecting you to sign in…
        </div>
      )}

      {token && !done && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <Input
            id="password"
            label="New password"
            hint="(min 8 characters)"
            type="password"
            placeholder="••••••••"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            id="confirm"
            label="Confirm new password"
            type="password"
            placeholder="••••••••"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && <div className="text-xs font-medium text-alert-red-text">{error}</div>}
          <Button type="submit" disabled={submitting} className="mt-1 w-full">
            {submitting ? "Updating…" : "Update password"}
          </Button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-cream-bg p-6">
      <div className="flex w-full max-w-[400px] flex-col gap-[18px]">
        <Link href="/" className="mb-1.5 flex flex-col items-center gap-2">
          <div className="grid h-[52px] w-[52px] place-items-center rounded-[15px] bg-forest-900 shadow-[0_4px_14px_rgba(27,67,50,.25)]">
            <Logo size={26} />
          </div>
          <div className="text-xl font-extrabold tracking-tight text-forest-900">Jadeed Kashtkar</div>
        </Link>

        <Suspense fallback={<div className="text-center text-sm text-ink-400">Loading…</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
