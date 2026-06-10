"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type PartnershipContext = {
  exists: boolean;
  partnership?: { id: string; name: string; agreedRent: number };
  taxSettings?: {
    mode: "OUT_OF_POCKET" | "RESERVE" | null;
    coverageMonths: number;
    reserveBalance: number;
  };
  memberships?: Array<{ id: string; displayLabel: string; role: string; userName: string }>;
};

type AllocationRow = {
  membershipId: string;
  displayLabel: string;
  rentAmount: number;
  purchaseAmount: number;
  ownershipPctBefore: number;
  ownershipPctAfter: number;
};

type PreviewResult = {
  summary: {
    totalPaid: number;
    agreedRentApplied: number;
    taxReimbursement: number;
    appliedPurchaseAmount: number;
    partnershipBalanceIncrease: number;
    cashPaidToOtherPartners: number;
  };
  participants: AllocationRow[];
  warnings?: string[];
};

type PostedResult = { paymentId: string };
type ExpensePostedResult = {
  expenseId: string;
  entryType: "EXPENSE";
};

function fmt(n?: number | null) {
  if (typeof n !== "number" || Number.isNaN(n)) {
    return "—";
  }
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

function fmtPct(n?: number | null) {
  if (typeof n !== "number" || Number.isNaN(n)) {
    return "—";
  }
  const pct = Math.abs(n) <= 1 ? n * 100 : n;
  return `${pct.toFixed(4)}%`;
}

export default function MonthlyPage() {
  const [ctx, setCtx] = useState<PartnershipContext | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [posted, setPosted] = useState<PostedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [entryType, setEntryType] = useState<"RENT" | "EXPENSE">("RENT");
  const [expenseTreatment, setExpenseTreatment] = useState<
    "AMORTIZE_OFFSET" | "VALUATION_DILUTION"
  >("AMORTIZE_OFFSET");
  const [reimbursementInput, setReimbursementInput] = useState("0");

  useEffect(() => {
    fetch("/api/demo/context")
      .then((r) => r.json())
      .then((data: PartnershipContext) => {
        if (!data.exists) setCtxError("No partnership found for your account.");
        else {
          setCtx(data);
          setReimbursementInput(String(suggestedTaxReimbursement(data)));
        }
      })
      .catch(() => setCtxError("Failed to load partnership context."));
  }, []);

  const occupant = ctx?.memberships?.find((m) => m.role === "OCCUPANT");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ctx?.partnership || !occupant) return;
    setBusy(true);
    setError(null);

    const nativeSubmitEvent = event.nativeEvent as SubmitEvent;
    const action = (nativeSubmitEvent.submitter as HTMLButtonElement | null)?.value ?? "preview";

    const formData = new FormData(event.currentTarget);
    const basePayload = {
      entryType,
      partnershipId: ctx.partnership.id,
      occupantMembershipId: occupant.id,
      note: String(formData.get("note") ?? ""),
    };

    const payload =
      entryType === "EXPENSE"
        ? {
            ...basePayload,
            expenseAmount: Number(formData.get("expenseAmount")),
            expenseIncurredOn: String(formData.get("expenseIncurredOn")),
            expenseTreatment: expenseTreatment,
            expenseAmortizationMonths:
              expenseTreatment === "AMORTIZE_OFFSET"
                ? Number(formData.get("expenseAmortizationMonths"))
                : undefined,
          }
        : {
            ...basePayload,
            paymentMonth: String(formData.get("paymentMonth")),
            paidOn: String(formData.get("paymentMonth")),
            totalPaid: Number(formData.get("totalPaid")),
            reimbursementAmount: Number(formData.get("reimbursementAmount")),
          };

    if (entryType === "EXPENSE" && action === "preview") {
      setBusy(false);
      setError("Expense entries are posted directly and do not support preview.");
      return;
    }

    const endpoint = action === "post" ? "/api/monthly-payments" : "/api/monthly-payments/preview";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(data.error ?? `Failed to ${action} monthly payment.`);
      return;
    }

    if (action === "post") {
      if ((data as ExpensePostedResult).expenseId) {
        setPosted({ paymentId: (data as ExpensePostedResult).expenseId });
      } else {
        setPosted(data as PostedResult);
      }
      setPreview(null);
    } else {
      setPosted(null);
      setPreview(data as PreviewResult);
    }
  }

  if (ctxError) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="card p-6">
          <p className="text-sm text-red-700">{ctxError}</p>
        </section>
      </main>
    );
  }

  if (!ctx) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="card p-6">
          <p className="text-sm text-black/60">Loading partnership&hellip;</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="card p-6">
        <h1 className="text-2xl font-semibold">Monthly Record Entry</h1>
        <p className="mt-1 text-sm text-black/70">
          {ctx.partnership!.name} &mdash; Agreed rent:{" "}
          <strong>{fmt(ctx.partnership!.agreedRent)}/mo</strong>
        </p>
        <p className="mt-1 text-xs text-black/50">
          Occupant: {occupant?.userName ?? "—"}
        </p>
        <p className="mt-1 text-xs text-black/50">
          Tax reserve available: {fmt(ctx.taxSettings?.reserveBalance ?? 0)} • Coverage setting: {ctx.taxSettings?.coverageMonths ?? 12} months • Suggested tax/expense reimbursement: {fmt(suggestedTaxReimbursement(ctx))}
        </p>
      </section>

      <form className="card grid gap-4 p-6" onSubmit={onSubmit}>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-black/60">Entry type</label>
          <select
            value={entryType}
            onChange={(event) => {
              setEntryType(event.target.value as "RENT" | "EXPENSE");
              setPreview(null);
              setPosted(null);
              setError(null);
            }}
            className="rounded border border-[var(--line)] px-3 py-2"
          >
            <option value="RENT">Monthly rent payment</option>
            <option value="EXPENSE">Expense item</option>
          </select>
        </div>

        {entryType === "RENT" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-black/60">Payment date</label>
            <input name="paymentMonth" type="date" className="rounded border border-[var(--line)] px-3 py-2" required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-black/60">Total paid ($)</label>
            <input name="totalPaid" type="number" step="0.01" min="0" placeholder="e.g. 3000.00" className="rounded border border-[var(--line)] px-3 py-2" required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-black/60">Tax/expense reimbursement ($)</label>
            <input
              name="reimbursementAmount"
              type="number"
              step="0.01"
              min="0"
              value={reimbursementInput}
              onChange={(event) => setReimbursementInput(event.target.value)}
              className="rounded border border-[var(--line)] px-3 py-2"
              required
            />
          </div>
        </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-black/60">Expense date</label>
              <input
                name="expenseIncurredOn"
                type="date"
                className="rounded border border-[var(--line)] px-3 py-2"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-black/60">Expense amount ($)</label>
              <input
                name="expenseAmount"
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 450.00"
                className="rounded border border-[var(--line)] px-3 py-2"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-black/60">Treatment</label>
              <select
                name="expenseTreatment"
                value={expenseTreatment}
                onChange={(event) =>
                  setExpenseTreatment(
                    event.target.value as "AMORTIZE_OFFSET" | "VALUATION_DILUTION",
                  )
                }
                className="rounded border border-[var(--line)] px-3 py-2"
              >
                <option value="AMORTIZE_OFFSET">
                  Offset rent over months
                </option>
                <option value="VALUATION_DILUTION">
                  Buy additional share and increase valuation
                </option>
              </select>
            </div>
            {expenseTreatment === "AMORTIZE_OFFSET" ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-black/60">Offset over months</label>
                <input
                  name="expenseAmortizationMonths"
                  type="number"
                  min="1"
                  defaultValue="12"
                  className="rounded border border-[var(--line)] px-3 py-2"
                  required
                />
              </div>
            ) : null}
          </div>
        )}

        <p className="rounded bg-black/5 px-3 py-2 text-xs text-black/60">
          {entryType === "RENT"
            ? "Rent and valuation are managed in Ledger settings (Admin only) and are applied automatically here."
            : "Expense entries can either offset future rent (like out-of-pocket tax) or buy additional ownership by increasing property valuation."}
        </p>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-black/60">Note (optional)</label>
          <textarea name="note" placeholder="e.g. June payment — e-transfer ref 12345" className="rounded border border-[var(--line)] px-3 py-2" rows={2} />
        </div>

        <div className="flex flex-wrap gap-3">
          {entryType === "RENT" ? (
            <button value="preview" type="submit" disabled={busy} className="rounded bg-[var(--surface-strong)] px-4 py-2 font-medium text-white disabled:opacity-60">
              {busy ? "Calculating…" : "Preview allocation"}
            </button>
          ) : null}
          <button value="post" type="submit" disabled={busy || (entryType === "RENT" && !preview)} className="rounded border border-[var(--line)] px-4 py-2 font-medium disabled:opacity-40">
            {entryType === "RENT" ? "Post to ledger" : "Record expense"}
          </button>
        </div>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </form>

      {preview && entryType === "RENT" ? (
        <section className="card p-6">
          <h2 className="text-lg font-semibold">Allocation Preview</h2>
          <p className="mt-1 text-xs text-black/50">Review before posting. Nothing has been saved yet.</p>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div><dt className="text-black/50">Total paid</dt><dd className="font-medium">{fmt(preview.summary.totalPaid)}</dd></div>
            <div><dt className="text-black/50">Rent applied</dt><dd className="font-medium">{fmt(preview.summary.agreedRentApplied)}</dd></div>
            <div><dt className="text-black/50">Tax/expense reimbursement</dt><dd className="font-medium">{fmt(preview.summary.taxReimbursement)}</dd></div>
            <div><dt className="text-black/50">Ownership purchase</dt><dd className="font-medium">{fmt(preview.summary.appliedPurchaseAmount)}</dd></div>
            <div><dt className="text-black/50">Partnership balance increase</dt><dd className="font-medium">{fmt(preview.summary.partnershipBalanceIncrease)}</dd></div>
            <div><dt className="text-black/50">Cash paid to partners</dt><dd className="font-medium">{fmt(preview.summary.cashPaidToOtherPartners)}</dd></div>
          </dl>

          {preview.warnings && preview.warnings.length > 0 && (
            <ul className="mt-3 rounded bg-yellow-50 px-4 py-3 text-xs text-yellow-800">
              {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}

          <h3 className="mt-5 text-sm font-semibold">Per-member breakdown</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-black/50">
                  <th className="pb-2 pr-4">Member</th>
                  <th className="pb-2 pr-4 text-right">Rent</th>
                  <th className="pb-2 pr-4 text-right">Purchase</th>
                  <th className="pb-2 pr-4 text-right">Ownership before</th>
                  <th className="pb-2 text-right">Ownership after</th>
                </tr>
              </thead>
              <tbody>
                {preview.participants.map((row) => (
                  <tr key={row.membershipId} className="border-b border-[var(--line)]/40">
                    <td className="py-2 pr-4 font-medium">{row.displayLabel}</td>
                    <td className="py-2 pr-4 text-right">{fmt(row.rentAmount)}</td>
                    <td className="py-2 pr-4 text-right">{fmt(row.purchaseAmount)}</td>
                    <td className="py-2 pr-4 text-right">{fmtPct(row.ownershipPctBefore)}</td>
                    <td className="py-2 text-right font-semibold">{fmtPct(row.ownershipPctAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {posted ? (
        <section className="card p-6">
          <h2 className="text-lg font-semibold text-green-700">Entry posted ✓</h2>
          <p className="mt-2 text-sm text-black/70">Entry ID: <code className="text-xs">{posted.paymentId}</code></p>
          <Link href="/portal/ledger" className="mt-3 inline-block rounded border border-[var(--line)] px-4 py-2 text-sm font-medium">
            View ledger →
          </Link>
        </section>
      ) : null}
    </main>
  );
}

function suggestedTaxReimbursement(ctx: PartnershipContext) {
  const reserve = Number(ctx.taxSettings?.reserveBalance ?? 0);
  const coverageMonths = Number(ctx.taxSettings?.coverageMonths ?? 12);

  if (!Number.isFinite(reserve) || reserve <= 0 || !Number.isFinite(coverageMonths) || coverageMonths <= 0) {
    return 0;
  }

  return Math.round((reserve / coverageMonths) * 100) / 100;
}
