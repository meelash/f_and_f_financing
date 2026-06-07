"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isProduction = process.env.NODE_ENV === "production";
  const [hasExistingPartnership, setHasExistingPartnership] = useState<boolean | null>(
    isProduction ? null : false,
  );
  const router = useRouter();
  const searchParams = useSearchParams();
  const showSetupSuccess = searchParams.get("setup") === "success";

  useEffect(() => {
    if (!isProduction) {
      return;
    }

    queueMicrotask(async () => {
      const response = await fetch("/api/setup/status");
      const data = (await response.json()) as { exists?: boolean };
      setHasExistingPartnership(Boolean(data.exists));
    });
  }, [isProduction]);

  const showCreatePartnershipLink = !isProduction || hasExistingPartnership === false;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = (await response.json()) as {
      error?: string;
      requiresPasswordChange?: boolean;
    };

    if (!response.ok) {
      setError(data.error ?? "Unable to sign in.");
      setBusy(false);
      return;
    }

    setBusy(false);

    if (data.requiresPasswordChange) {
      router.push("/change-password");
      router.refresh();
      return;
    }

    // Check if user already has a partnership and route accordingly
    const contextResponse = await fetch("/api/demo/context");
    const context = (await contextResponse.json()) as { exists: boolean };
    router.push(context.exists ? "/portal/ledger" : "/portal/setup");
    router.refresh();
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <section className="card p-6">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-black/70">
          Sign in with credentials created in setup or seed data.
        </p>
        {showSetupSuccess ? (
          <p className="mt-2 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            Setup completed and saved. Sign in with your newly created credentials.
          </p>
        ) : null}
        {showCreatePartnershipLink ? (
          <p className="mt-2 text-sm text-black/60">
            First time here?{" "}
            <Link href="/setup" className="font-medium text-black underline underline-offset-2">
              Create your first partnership
            </Link>
          </p>
        ) : null}

        <form className="mt-5 grid gap-3" onSubmit={onSubmit}>
          <input
            name="email"
            type="email"
            placeholder="you@example.com"
            className="rounded border border-[var(--line)] px-3 py-2"
            required
          />
          <input
            name="password"
            type="password"
            placeholder="Your password"
            className="rounded border border-[var(--line)] px-3 py-2"
            required
            minLength={8}
          />
          <button
            disabled={busy}
            className="rounded bg-[var(--surface-strong)] px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      </section>
    </main>
  );
}
