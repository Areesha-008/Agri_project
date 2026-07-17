"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { authApi } from "@/lib/api/resources";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await authApi.forgotPassword(email);
      setDevResetUrl(res.dev_reset_url);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not request a reset link");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-cream-bg p-6">
      <ThemeToggle className="fixed right-5 top-5" />
      <div className="flex w-full max-w-[400px] flex-col gap-4.5">
        <Link href="/" className="mb-1.5 flex flex-col items-center gap-2">
          <div className="grid h-[52px] w-[52px] place-items-center rounded-[15px] bg-forest-900 shadow-[0_4px_14px_rgba(27,67,50,.25)]">
            <Logo size={26} />
          </div>
          <div className="text-xl font-extrabold tracking-tight text-forest-ink-900">Jadeed Kashtkar</div>
        </Link>

        <div className="flex flex-col gap-3.5 rounded-card-lg border border-border bg-cream-card p-6.5 shadow-[0_2px_10px_rgba(27,67,50,.07)]">
          <div>
            <div className="text-base font-bold">Reset your password</div>
            <div className="mt-1 text-[12.5px] text-ink-500">
              Enter the email on your account and we&apos;ll send you a reset link.
            </div>
          </div>

          {sent ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl bg-mint-100 p-3 text-[12.5px] leading-relaxed text-forest-700">
                If that email is registered, a reset link has been sent.
              </div>
              {devResetUrl && (
                <Link
                  href={devResetUrl.replace(/^https?:\/\/[^/]+/, "")}
                  className="rounded-[14px] border border-dashed border-mint-border-strong bg-mint-100 px-4 py-3 text-center text-[12.5px] font-semibold text-forest-700 hover:bg-[#DFEEE3]"
                >
                  No email server configured — open your reset link
                </Link>
              )}
              <Link href="/login" className="text-center text-[12.5px] font-bold text-forest-ink-700">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              <Input
                id="email"
                label="Email"
                type="email"
                placeholder="ahmad@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {error && <div className="text-xs font-medium text-alert-red-text">{error}</div>}
              <Button type="submit" disabled={submitting} className="mt-1 w-full">
                {submitting ? "Sending…" : "Send reset link"}
              </Button>
              <div className="text-center text-[12.5px] text-ink-500">
                <Link href="/login" className="font-bold text-forest-ink-700">
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
