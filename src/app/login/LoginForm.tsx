"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { Icon } from "@/components/Icon";

export default function LoginForm({
  googleEnabled,
  initialError,
}: {
  googleEnabled: boolean;
  initialError?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאת התחברות");
        return;
      }
      router.replace(data.role === "ADMIN" ? "/admin" : "/app");
      router.refresh();
    } catch {
      setError("שגיאת תקשורת — נסו שוב");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <Field label="אימייל">
        <Input
          type="email"
          dir="ltr"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.co.il"
        />
      </Field>

      <Field label="סיסמה">
        <Input
          type="password"
          dir="ltr"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </Field>

      <Button type="submit" disabled={busy} className="mt-1 w-full">
        {busy ? "מתחבר..." : "התחברות"}
      </Button>

      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span className="h-px flex-1 bg-slate-100" />
            או
            <span className="h-px flex-1 bg-slate-100" />
          </div>
          <a
            href="/api/auth/google"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-cyan-500/50"
          >
            <Icon name="google" className="h-4 w-4" />
            התחברות עם Google
          </a>
        </>
      ) : null}
    </form>
  );
}
