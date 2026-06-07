import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-10">
      <section className="card relative overflow-hidden p-6 sm:p-10">
        <div className="absolute -top-14 -right-10 h-36 w-36 rounded-full bg-[var(--accent-soft)] blur-2xl" />
        <div className="space-y-4">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-[var(--accent)]">
            Friends & Family Financing Portal
          </p>
          <h1 className="max-w-3xl text-3xl font-semibold leading-tight sm:text-5xl">
            Transparent ownership accounting from first contribution to buyout.
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-black/70 sm:text-base">
            This portal tracks capital contributions, monthly rent and tax
            reimbursements, share transfers, partner payouts, and buyout
            projections with complete audit history.
          </p>
        </div>
        <div className="mt-8 flex flex-wrap gap-3 text-sm">
          <Link href="/login" className="rounded-full border border-[var(--line)] bg-white px-5 py-2.5 font-medium transition hover:bg-white/80">
            Sign In
          </Link>
          <Link href="/portal/setup" className="rounded-full bg-[var(--surface-strong)] px-5 py-2.5 font-medium text-white transition hover:opacity-90">
            Begin Setup Wizard
          </Link>
          <Link href="/portal/monthly" className="rounded-full border border-[var(--line)] bg-white/40 px-5 py-2.5 font-medium transition hover:bg-white/80">
            Record Monthly Payment
          </Link>
          <Link href="/portal/ledger" className="rounded-full border border-[var(--line)] bg-white/40 px-5 py-2.5 font-medium transition hover:bg-white/80">
            Open Ledger & Projections
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Current Occupant Ownership",
            value: "50.00%",
            detail: "after initial contributions",
          },
          {
            label: "Partner Outstanding Position",
            value: "$142,650",
            detail: "to be bought out over time",
          },
          {
            label: "Projected Buyout Date",
            value: "Mar 2032",
            detail: "at current payment profile",
          },
          {
            label: "Partner Dividend Income",
            value: "$31,980",
            detail: "estimated through buyout",
          },
        ].map((item) => (
          <article key={item.label} className="card p-4 sm:p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-black/60">
              {item.label}
            </p>
            <p className="mt-3 font-mono text-3xl font-medium text-[var(--surface-strong)]">
              {item.value}
            </p>
            <p className="mt-2 text-xs text-black/60">{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="card p-5">
          <h2 className="text-lg font-semibold">Initial Setup Inputs</h2>
          <ul className="mt-4 space-y-2 text-sm text-black/80">
            <li>Property details and baseline valuation</li>
            <li>Partner roster and starting ownership percentages</li>
            <li>Contribution ledger for purchase and closing costs</li>
            <li>Rent policy effective date and monthly amount</li>
          </ul>
        </article>

        <article className="card p-5">
          <h2 className="text-lg font-semibold">Monthly Workflow</h2>
          <ul className="mt-4 space-y-2 text-sm text-black/80">
            <li>Log tax prepayment and reimbursement schedule</li>
            <li>Post rent + extra payment transaction</li>
            <li>Auto-split net rent by current ownership</li>
            <li>Apply reimbursement and extra to share purchase</li>
          </ul>
        </article>

        <article className="card p-5">
          <h2 className="text-lg font-semibold">Controls and Compliance</h2>
          <ul className="mt-4 space-y-2 text-sm text-black/80">
            <li>Configurable approval workflow (default off)</li>
            <li>Admin edit/delete with full change history</li>
            <li>Receipt uploads for payments and expenses</li>
            <li>CSV/PDF exports for partner reporting</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
