import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import LogoutButton from "@/components/logout-button";
import { prisma } from "@/lib/prisma";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  const activeMembership = await prisma.partnerMembership.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
    orderBy: { createdAt: "desc" },
    select: { role: true },
  });

  const canSeeEntriesTab = user.role === "ADMIN" || activeMembership?.role !== "INVESTOR";

  return (
    <div className="min-h-full">
      <header className="border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-10">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-xs font-semibold tracking-wide">F&amp;F Financing</p>
              <p className="text-xs text-black/50">{user.fullName}</p>
            </div>
            <nav className="flex gap-1">
              {canSeeEntriesTab ? (
                <Link href="/portal/monthly" className="rounded px-3 py-1.5 text-sm font-medium hover:bg-black/5">
                  Entries
                </Link>
              ) : null}
              <Link href="/portal/ledger" className="rounded px-3 py-1.5 text-sm font-medium hover:bg-black/5">
                Ledger
              </Link>
              {user.role === "ADMIN" ? (
                <Link href="/portal/setup" className="rounded px-3 py-1.5 text-sm font-medium text-black/40 hover:bg-black/5 hover:text-black">
                  Setup
                </Link>
              ) : null}
            </nav>
          </div>
          <LogoutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
