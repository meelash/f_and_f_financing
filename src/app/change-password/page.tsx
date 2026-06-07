"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SessionResponse = {
  authenticated: boolean;
  user?: {
    mustChangePassword?: boolean;
  };
};

export default function ChangePasswordPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(async () => {
      const response = await fetch("/api/auth/session");
      const data = (await response.json()) as SessionResponse;

      if (!data.authenticated) {
        router.replace("/login");
        return;
      }

      if (!data.user?.mustChangePassword) {
        router.replace("/portal/ledger");
      }
    });
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      setBusy(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      setBusy(false);
      return;
    }

    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });

    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(data.error ?? "Unable to change password.");
      setBusy(false);
      return;
    }

    setMessage("Password updated. Redirecting to your portal...");
    setBusy(false);
    router.push("/portal/ledger");
    router.refresh();
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <section className="card p-6">
        <h1 className="text-2xl font-semibold">Change Temporary Password</h1>
        <p className="mt-2 text-sm text-black/70">
          Your account requires a one-time password change before you can continue.
        </p>

        <form className="mt-5 grid gap-3" onSubmit={onSubmit}>
          <input
            name="newPassword"
            type="password"
            placeholder="New password"
            className="rounded border border-[var(--line)] px-3 py-2"
            required
            minLength={8}
          />
          <input
            name="confirmPassword"
            type="password"
            placeholder="Confirm new password"
            className="rounded border border-[var(--line)] px-3 py-2"
            required
            minLength={8}
          />
          <button
            disabled={busy}
            className="rounded bg-[var(--surface-strong)] px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            {busy ? "Updating..." : "Save new password"}
          </button>
        </form>

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-green-700">{message}</p> : null}
      </section>
    </main>
  );
}
