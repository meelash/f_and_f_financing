"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type PartnershipContext = {
  exists: boolean;
  partnership?: { id: string; name: string; agreedRent: number };
  taxPolicy?: { mode: "OUT_OF_POCKET" | "RESERVE"; taxPerCycle: number; taxCycleMonths: number } | null;
  balances?: { owedToOccupant: number; reserveBalance: number };
};

type PaymentMode = "TOTAL" | "CASH_TO_INVESTORS";

type Participant = {
  membershipId: string;
  displayLabel: string;
  isOccupant: boolean;
  ownershipPctBefore: number;
  ownershipPctAfter: number;
  rentAmount: number;
  purchaseAmount: number;
};

type Expected = {
  total: number;
  cashToInvestors: number;
  investorDividendsDue: number;
  occupantDividend: number;
  taxReimbursement: number;
  reserveContribution: number;
};

type PreviewResponse = {
  error?: string;
  context: {
    agreedRent: number;
    taxPolicy: PartnershipContext["taxPolicy"];
    suggested: { taxReimbursement: number; reserveContribution: number };
    prior: { rentApplied: number };
  };
  expected: Expected;
  result: {
    summary: {
      totalPaid: number;
      cashToInvestors: number;
      investorDividends: number;
      dividendShortfall: number;
      taxReimbursement: number;
      reserveContribution: number;
      occupantRetained: number;
      ownershipPurchase: number;
    };
    participants: Participant[];
    notes: string[];
    warnings: string[];
  } | null;
};

function fmt(n?: number | null) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

function fmtPct(n?: number | null) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return `${n.toFixed(4)}%`;
}

function today() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Parses an input value; "" means "not entered". */
function num(value: string) {
  return value.trim() === "" ? undefined : Number(value);
}

export default function MonthlyPage() {
  const [ctx, setCtx] = useState<PartnershipContext | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [entryType, setEntryType] = useState<"RENT" | "EXPENSE">("RENT");

  useEffect(() => {
    fetch("/api/demo/context")
      .then((r) => r.json())
      .then((data: PartnershipContext) => {
        if (!data.exists) setCtxError("No partnership found for your account.");
        else setCtx(data);
      })
      .catch(() => setCtxError("Failed to load partnership context."));
  }, []);

  if (ctxError || !ctx?.partnership) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="card p-6">
          {ctxError ? (
            <p className="text-sm text-red-700">{ctxError}</p>
          ) : (
            <p className="text-sm text-black/60">Loading partnership&hellip;</p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="card p-6">
        <h1 className="text-2xl font-semibold">Monthly Record Entry</h1>
        <p className="mt-1 text-sm text-black/70">
          {ctx.partnership.name} &mdash; Agreed rent: <strong>{fmt(ctx.partnership.agreedRent)}/mo</strong>
        </p>
        <p className="mt-1 text-xs text-black/50">
          Owed to occupant for prepaid taxes/expenses: {fmt(ctx.balances?.owedToOccupant)}
          {ctx.taxPolicy?.mode === "RESERVE" || (ctx.balances?.reserveBalance ?? 0) !== 0
            ? ` • Tax reserve: ${fmt(ctx.balances?.reserveBalance)}`
            : ""}
        </p>
        <div className="mt-4 flex gap-2">
          {(["RENT", "EXPENSE"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setEntryType(type)}
              className={`rounded px-3 py-1.5 text-sm font-medium ${entryType === type ? "bg-[var(--surface-strong)] text-white" : "border border-[var(--line)]"}`}
            >
              {type === "RENT" ? "Rent payment" : "Expense"}
            </button>
          ))}
        </div>
      </section>

      {entryType === "RENT" ? (
        <RentEntry partnershipId={ctx.partnership.id} />
      ) : (
        <ExpenseEntry partnershipId={ctx.partnership.id} />
      )}
    </main>
  );
}

function RentEntry({ partnershipId }: { partnershipId: string }) {
  const [paidOn, setPaidOn] = useState(today);
  const [rentMonth, setRentMonth] = useState(() => today().slice(0, 7));
  const [mode, setMode] = useState<PaymentMode>("TOTAL");
  const [amount, setAmount] = useState("");
  // "" = use the suggested amount for the month.
  const [taxInput, setTaxInput] = useState("");
  const [reserveInput, setReserveInput] = useState("");
  const [takeDividend, setTakeDividend] = useState(false);
  const [takeReimbursement, setTakeReimbursement] = useState(false);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [postedId, setPostedId] = useState<string | null>(null);

  const payload = {
    partnershipId,
    rentMonth,
    paidOn,
    payment: num(amount) !== undefined ? { mode, amount: num(amount) } : undefined,
    taxReimbursement: num(taxInput),
    reserveContribution: num(reserveInput),
    takeDividend,
    takeReimbursement,
    note,
  };
  const payloadKey = JSON.stringify({ ...payload, note: undefined });

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/monthly-payments/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payloadKey,
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((data: PreviewResponse) => {
          if (data.error) {
            setError(data.error);
            setPreview(null);
          } else {
            setError(null);
            setPreview(data);
          }
        })
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [payloadKey]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/monthly-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? "Failed to post payment.");
      return;
    }
    setPostedId(data.paymentId);
    setAmount("");
    setTaxInput("");
    setReserveInput("");
    setTakeDividend(false);
    setTakeReimbursement(false);
    setNote("");
  }

  const context = preview?.context;
  const expected = preview?.expected;
  const result = preview?.result;
  const showReserve = context?.taxPolicy?.mode === "RESERVE" || num(reserveInput) !== undefined;
  const expectedAmount = mode === "TOTAL" ? expected?.total : expected?.cashToInvestors;

  return (
    <>
      <form className="card grid gap-4 p-6" onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Payment date">
            <input
              type="date"
              value={paidOn}
              onChange={(event) => {
                setPaidOn(event.target.value);
                if (event.target.value) setRentMonth(event.target.value.slice(0, 7));
              }}
              className="rounded border border-[var(--line)] px-3 py-2"
              required
            />
          </Field>
          <Field label="Rent month" hint="Which month's rent this counts toward (change it for late or early payments).">
            <input
              type="month"
              value={rentMonth}
              onChange={(event) => setRentMonth(event.target.value)}
              className="rounded border border-[var(--line)] px-3 py-2"
              required
            />
          </Field>
        </div>

        {expected && context ? (
          <div className="rounded bg-black/5 px-4 py-3 text-sm">
            <p className="font-medium">
              {context.prior.rentApplied > 0 ? "Still due" : "Full payment"} for this month: {fmt(expected.total)}
            </p>
            <p className="mt-1 text-xs text-black/60">
              Investor dividends {fmt(expected.investorDividendsDue)} + your dividend {fmt(expected.occupantDividend)}
              {expected.taxReimbursement > 0 ? ` + your tax reimbursement ${fmt(expected.taxReimbursement)}` : ""}
              {expected.reserveContribution > 0 ? ` + tax reserve ${fmt(expected.reserveContribution)}` : ""}
              {context.prior.rentApplied > 0 ? ` (earlier entries this month covered ${fmt(context.prior.rentApplied)} of rent)` : ""}
            </p>
            <p className="mt-1 text-xs text-black/60">
              Cash to send to investors: <strong>{fmt(expected.cashToInvestors)}</strong>
              {takeDividend || takeReimbursement ? " (after what you're keeping)" : ""}
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount entered as">
            <div className="flex overflow-hidden rounded border border-[var(--line)] text-sm">
              {(["TOTAL", "CASH_TO_INVESTORS"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={`flex-1 px-3 py-2 ${mode === option ? "bg-[var(--surface-strong)] text-white" : ""}`}
                >
                  {option === "TOTAL" ? "Total payment" : "Cash to investors"}
                </button>
              ))}
            </div>
          </Field>
          <Field label={mode === "TOTAL" ? "Total payment ($)" : "Cash sent to investors ($)"}>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={expectedAmount !== undefined ? expectedAmount.toFixed(2) : ""}
                className="w-full rounded border border-[var(--line)] px-3 py-2"
                required
              />
              {expectedAmount !== undefined ? (
                <button
                  type="button"
                  onClick={() => setAmount(expectedAmount.toFixed(2))}
                  className="whitespace-nowrap rounded border border-[var(--line)] px-3 py-2 text-xs"
                >
                  Use expected
                </button>
              ) : null}
            </div>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Tax/expense reimbursement to you ($)"
            hint={
              taxInput === ""
                ? "Suggested from your prepaid taxes/expenses."
                : `Suggested: ${fmt(context?.suggested.taxReimbursement)}`
            }
          >
            <SuggestedInput value={taxInput} suggested={context?.suggested.taxReimbursement} onChange={setTaxInput} />
          </Field>
          {showReserve ? (
            <Field
              label="Tax reserve contribution ($)"
              hint={reserveInput === "" ? "Suggested from the tax policy." : `Suggested: ${fmt(context?.suggested.reserveContribution)}`}
            >
              <SuggestedInput value={reserveInput} suggested={context?.suggested.reserveContribution} onChange={setReserveInput} />
            </Field>
          ) : null}
        </div>

        <fieldset className="grid gap-2 text-sm">
          <legend className="text-xs font-medium text-black/60">
            By default your dividend and reimbursement buy equity. Tick to take them in cash instead:
          </legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={takeDividend} onChange={(event) => setTakeDividend(event.target.checked)} />
            Take my dividend in cash{expected ? ` (${fmt(expected.occupantDividend)})` : ""}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={takeReimbursement}
              onChange={(event) => setTakeReimbursement(event.target.checked)}
            />
            Take my tax/expense reimbursement in cash{expected ? ` (${fmt(expected.taxReimbursement)})` : ""}
          </label>
        </fieldset>

        <Field label="Note (optional)">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. June payment — e-transfer ref 12345"
            className="rounded border border-[var(--line)] px-3 py-2"
            rows={2}
          />
        </Field>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !result}
            className="rounded bg-[var(--surface-strong)] px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {busy ? "Posting…" : "Post to ledger"}
          </button>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
      </form>

      {result ? (
        <section className="card p-6">
          <h2 className="text-lg font-semibold">Allocation</h2>
          <p className="mt-1 text-xs text-black/50">Updates as you type. Nothing is saved until you post.</p>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <Stat label="Total payment" value={result.summary.totalPaid} />
            <Stat label="Cash to investors" value={result.summary.cashToInvestors} />
            <Stat label="Investor dividends" value={result.summary.investorDividends} />
            <Stat label="Equity purchase" value={result.summary.ownershipPurchase} />
            <Stat label="Tax reimbursed to you" value={result.summary.taxReimbursement} />
            <Stat label="Kept by you" value={result.summary.occupantRetained} />
            {result.summary.reserveContribution > 0 ? (
              <Stat label="To tax reserve" value={result.summary.reserveContribution} />
            ) : null}
            {result.summary.dividendShortfall > 0 ? (
              <Stat label="Dividend still owed" value={result.summary.dividendShortfall} />
            ) : null}
          </dl>

          {result.warnings.length > 0 ? (
            <ul className="mt-4 grid gap-1 rounded bg-yellow-50 px-4 py-3 text-xs text-yellow-800">
              {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          ) : null}
          {result.notes.length > 0 ? (
            <ul className="mt-3 grid gap-1 rounded bg-black/5 px-4 py-3 text-xs text-black/70">
              {result.notes.map((line) => <li key={line}>{line}</li>)}
            </ul>
          ) : null}

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-black/50">
                  <th className="pb-2 pr-4">Member</th>
                  <th className="pb-2 pr-4 text-right">Dividend</th>
                  <th className="pb-2 pr-4 text-right">Equity bought / sold</th>
                  <th className="pb-2 pr-4 text-right">Ownership before</th>
                  <th className="pb-2 text-right">Ownership after</th>
                </tr>
              </thead>
              <tbody>
                {result.participants.map((row) => (
                  <tr key={row.membershipId} className="border-b border-[var(--line)]/40">
                    <td className="py-2 pr-4 font-medium">{row.displayLabel}</td>
                    <td className="py-2 pr-4 text-right">
                      {row.isOccupant ? (row.rentAmount > 0 ? `${fmt(row.rentAmount)} (cash)` : "→ equity") : fmt(row.rentAmount)}
                    </td>
                    <td className="py-2 pr-4 text-right">{fmt(Math.abs(row.purchaseAmount))}</td>
                    <td className="py-2 pr-4 text-right">{fmtPct(row.ownershipPctBefore)}</td>
                    <td className="py-2 text-right font-semibold">{fmtPct(row.ownershipPctAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {postedId ? <Posted id={postedId} /> : null}
    </>
  );
}

function ExpenseEntry({ partnershipId }: { partnershipId: string }) {
  const [treatment, setTreatment] = useState<"AMORTIZE_OFFSET" | "VALUATION_DILUTION">("AMORTIZE_OFFSET");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [postedId, setPostedId] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy(true);
    setError(null);
    const response = await fetch("/api/monthly-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entryType: "EXPENSE",
        partnershipId,
        expenseAmount: Number(formData.get("expenseAmount")),
        expenseIncurredOn: String(formData.get("expenseIncurredOn")),
        expenseTreatment: treatment,
        expenseAmortizationMonths:
          treatment === "AMORTIZE_OFFSET" ? Number(formData.get("expenseAmortizationMonths")) : undefined,
        note: String(formData.get("note") ?? ""),
      }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? "Failed to record expense.");
      return;
    }
    setPostedId(data.expenseId);
    form.reset();
  }

  return (
    <>
      <form className="card grid gap-4 p-6" onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Expense date">
            <input name="expenseIncurredOn" type="date" defaultValue={today()} className="rounded border border-[var(--line)] px-3 py-2" required />
          </Field>
          <Field label="Expense amount ($)">
            <input name="expenseAmount" type="number" step="0.01" min="0.01" className="rounded border border-[var(--line)] px-3 py-2" required />
          </Field>
          <Field label="Treatment">
            <select
              value={treatment}
              onChange={(event) => setTreatment(event.target.value as typeof treatment)}
              className="rounded border border-[var(--line)] px-3 py-2"
            >
              <option value="AMORTIZE_OFFSET">Reimburse me from rent over months</option>
              <option value="VALUATION_DILUTION">Add to property value (I own the added value)</option>
            </select>
          </Field>
          {treatment === "AMORTIZE_OFFSET" ? (
            <Field label="Reimburse over months">
              <input name="expenseAmortizationMonths" type="number" min="1" defaultValue="12" className="rounded border border-[var(--line)] px-3 py-2" required />
            </Field>
          ) : null}
        </div>
        <p className="rounded bg-black/5 px-3 py-2 text-xs text-black/60">
          {treatment === "AMORTIZE_OFFSET"
            ? "Works like prepaid taxes: it's added to what you're owed and suggested as a reimbursement on rent entries."
            : "The valuation goes up by this amount and you own that added value, diluting everyone else's percentage."}
        </p>
        <Field label="Note (optional)">
          <textarea name="note" className="rounded border border-[var(--line)] px-3 py-2" rows={2} />
        </Field>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className="rounded bg-[var(--surface-strong)] px-4 py-2 font-medium text-white disabled:opacity-50">
            {busy ? "Recording…" : "Record expense"}
          </button>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
      </form>
      {postedId ? <Posted id={postedId} /> : null}
    </>
  );
}

function SuggestedInput({
  value,
  suggested,
  onChange,
}: {
  value: string;
  suggested?: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex gap-2">
      <input
        type="number"
        step="0.01"
        min="0"
        value={value === "" ? (suggested?.toFixed(2) ?? "") : value}
        onChange={(event) => onChange(event.target.value === "" ? "0" : event.target.value)}
        className="w-full rounded border border-[var(--line)] px-3 py-2"
      />
      {value !== "" ? (
        <button type="button" onClick={() => onChange("")} className="whitespace-nowrap rounded border border-[var(--line)] px-3 py-2 text-xs">
          Reset
        </button>
      ) : null}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-black/60">{label}</label>
      {children}
      {hint ? <span className="text-xs text-black/40">{hint}</span> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-black/50">{label}</dt>
      <dd className="font-medium">{fmt(value)}</dd>
    </div>
  );
}

function Posted({ id }: { id: string }) {
  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold text-green-700">Entry posted ✓</h2>
      <p className="mt-2 text-sm text-black/70">
        Entry ID: <code className="text-xs">{id}</code>
      </p>
      <Link href="/portal/ledger" className="mt-3 inline-block rounded border border-[var(--line)] px-4 py-2 text-sm font-medium">
        View ledger →
      </Link>
    </section>
  );
}
