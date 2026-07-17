"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export default function LoginPage() {
  const router = useRouter();
  const { login, loginAsGuest } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/fields");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGuest() {
    setError(null);
    setSubmitting(true);
    try {
      await loginAsGuest();
      router.push("/fields");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start guest session");
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
          <div className="text-[13px] leading-[1.9] text-ink-500" lang="ur">
            جدید کاشتکار — satellite farming intelligence
          </div>
        </Link>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3.5 rounded-card-lg border border-border bg-cream-card p-6.5 shadow-[0_2px_10px_rgba(27,67,50,.07)]"
        >
          <div className="text-base font-bold">Sign in to your farm</div>
          <Input
            id="email"
            label="Email"
            type="email"
            placeholder="ahmad@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <Input
              id="password"
              label="Password"
              type="password"
              placeholder="••••••••"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Link href="/forgot-password" className="self-end text-[11.5px] font-semibold text-forest-ink-700">
              Forgot password?
            </Link>
          </div>
          {error && (
            <div role="alert" className="text-xs font-medium text-alert-red-text">
              {error}
            </div>
          )}
          <Button type="submit" disabled={submitting} className="mt-1 w-full">
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
          <div className="text-center text-[12.5px] text-ink-500">
            New here?{" "}
            <Link href="/signup" className="font-bold text-forest-ink-700">
              Create an account
            </Link>
          </div>
        </form>

        <button
          onClick={handleGuest}
          disabled={submitting}
          className="flex cursor-pointer items-center gap-2.5 rounded-[14px] border border-dashed border-mint-border-strong bg-mint-100 px-4 py-3.5 text-left hover:bg-[#DFEEE3] disabled:cursor-not-allowed"
        >
          <svg width="16" height="16" viewBox="0 0 15 15" fill="none" stroke="#2D6A4F" strokeWidth="1.6">
            <path d="M2 4.5 L7.5 2 L13 4.5 L7.5 7 Z" />
            <path d="M2 8 L7.5 10.5 L13 8" opacity=".6" />
          </svg>
          <div className="text-[12.5px] leading-[1.4] text-forest-700">
            <b>Try without an account</b> — draw a field and analyze NDVI for free
          </div>
        </button>
      </div>
    </div>
  );
}
