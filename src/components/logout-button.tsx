"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onLogout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    setBusy(false);
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={busy}
      className="rounded border border-[var(--line)] px-3 py-1.5 text-xs font-medium"
    >
      {busy ? "Signing out..." : "Sign out"}
    </button>
  );
}
