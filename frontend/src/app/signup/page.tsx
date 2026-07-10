"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Logo } from "@/components/ui/Logo";

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    try {
      await signup(email, password);
      router.push("/fields");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create account");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-cream-bg p-6">
      <div className="flex w-full max-w-[400px] flex-col gap-[18px]">
        <Link href="/" className="mb-1.5 flex flex-col items-center gap-2">
          <div className="grid h-[52px] w-[52px] place-items-center rounded-[15px] bg-forest-900 shadow-[0_4px_14px_rgba(27,67,50,.25)]">
            <Logo size={26} />
          </div>
          <div className="text-xl font-extrabold tracking-tight text-forest-900">Create your account</div>
          <div className="text-[12.5px] text-ink-500">Your fields, weather and mandi rates in one place</div>
        </Link>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3.5 rounded-card-lg border border-border bg-white p-[26px] shadow-[0_2px_10px_rgba(27,67,50,.07)]"
        >
          <Input
            id="email"
            label="Email"
            type="email"
            placeholder="ahmad@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            id="password"
            label="Password"
            hint="(min 8 characters)"
            type="password"
            placeholder="••••••••"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <div className="text-xs font-medium text-alert-red-text">{error}</div>}
          <Button type="submit" disabled={submitting} className="mt-1 w-full">
            {submitting ? "Creating account…" : "Create account"}
          </Button>
          <div className="text-center text-[12.5px] text-ink-500">
            Already registered?{" "}
            <Link href="/login" className="font-bold text-forest-700">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
