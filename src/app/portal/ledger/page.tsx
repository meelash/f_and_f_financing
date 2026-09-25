"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type TaxPolicy = { mode: "OUT_OF_POCKET" | "RESERVE"; taxPerCycle: number; taxCycleMonths: number };

type PartnershipContext = {
  exists: boolean;
  isAdmin?: boolean;
  currentUser?: { id: string; role: "ADMIN" | "PARTNER" };
  partnership?: { id: string; name: string; agreedRent: number; currentValuation: number };
  taxPolicy?: TaxPolicy | null;
  balances?: { owedToOccupant: number; reserveBalance: number };
  memberships?: Array<{
    id: string;
    displayLabel: string;
    role: string;
    userId?: string;
    userName?: string;
    userEmail?: string;
  }>;
};

type RentRecord = {
  id: string;
  type: "MONTHLY_RENT";
  date: string;
  rentMonth: string;
  amount: number;
  cashToInvestors: number;
  dividends: number;
  ownershipPurchase: number;
  taxReimbursement: number;
  reserveContribution: number;
  occupantRetained: number;
  note?: string | null;
  allocations: Array<{ membershipId: string; rentAmount: number; purchaseAmount: number }>;
};

type OtherRecord = {
  id: string;
  type: "TAX_OUT_OF_POCKET" | "TAX_FROM_RESERVE" | "EXPENSE_OFFSET" | "EXPENSE_DILUTION";
  date: string;
  amount: number;
  months?: number | null;
  note?: string | null;
};

type LedgerRecord = RentRecord | OtherRecord;

type OwnershipPoint = {
  asOf: string;
  membershipId: string;
  displayLabel: string;
  ownershipPct: number;
  equityValue: number;
};

type LedgerData = { records: LedgerRecord[]; ownershipTimeline: OwnershipPoint[] };

type ProjectionMonth = {
  month: string;
  ownershipPctBefore: Record<string, number>;
  ownershipPctAfter: Record<string, number>;
  dividends: Record<string, number>;
  purchases: Record<string, number>;
  investorDividends: number;
  ownershipPurchase: number;
};

type ProjectionResponse = {
  error?: string;
  inputs: { startMonth: string; valuation: number; monthlyTotalPaid: number };
  result: {
    completed: boolean;
    buyoutMonth: string | null;
    monthsSimulated: number;
    totalInvestorDividends: number;
    history: ProjectionMonth[];
  };
};

const RECORD_LABELS: Record<OtherRecord["type"], string> = {
  TAX_OUT_OF_POCKET: "Tax paid out of pocket",
  TAX_FROM_RESERVE: "Tax paid from reserve",
  EXPENSE_OFFSET: "Expense (reimbursed)",
  EXPENSE_DILUTION: "Expense (adds value)",
};

function fmt(n?: number | null) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

function fmtPct(n?: number | null) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}%`;
}

function fmtDate(s: string | null | undefined, style: "month" | "day") {
  if (!s) return "—";
  const date = new Date(s);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: style === "month" ? "short" : "long",
    ...(style === "day" ? { day: "numeric" } : {}),
    timeZone: "UTC",
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export default function LedgerPage() {
  const [ctx, setCtx] = useState<PartnershipContext | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const data = (await (await fetch("/api/demo/context")).json()) as PartnershipContext;
    if (!data.exists || !data.partnership?.id) {
      setCtxError("No partnership found. Complete setup first.");
      return;
    }
    setCtxError(null);
    setCtx(data);

    const ledgerData = (await (await fetch(`/api/ledger/${data.partnership.id}`)).json()) as LedgerData & {
      error?: string;
    };
    if (ledgerData.error) {
      setLedgerError(ledgerData.error);
      return;
    }
    setLedgerError(null);
    setLedger(ledgerData);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      fetchAll().catch(() => setCtxError("Failed to load partnership context."));
    });
  }, [fetchAll]);

  if (ctxError || !ctx?.partnership) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="card p-6">
          {ctxError ? (
            <p className="text-sm text-red-700">{ctxError}</p>
          ) : (
            <p className="text-sm text-black/60">Loading ledger&hellip;</p>
          )}
        </section>
      </main>
    );
  }

  const partnership = ctx.partnership;
  const occupant = ctx.memberships?.find((m) => m.role === "OCCUPANT");
  const records = ledger?.records ?? [];
  const ownershipTimeline = ledger?.ownershipTimeline ?? [];
  const latestOwnership = [...ownershipTimeline]
    .reverse()
    .filter((row, index, rows) => rows.findIndex((r) => r.membershipId === row.membershipId) === index);
  const currentMembership = ctx.memberships?.find((m) => m.userId === ctx.currentUser?.id);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="card p-6">
        <h1 className="text-2xl font-semibold">Ledger &amp; Projections</h1>
        <p className="mt-1 text-sm text-black/70">{partnership.name}</p>
        <p className="mt-1 text-xs text-black/50">
          Rent: {fmt(partnership.agreedRent)} / month • Valuation: {fmt(partnership.currentValuation)}
        </p>
        <p className="mt-1 text-xs text-black/50">
          {ctx.taxPolicy
            ? `Tax: ${fmt(ctx.taxPolicy.taxPerCycle)} per ${ctx.taxPolicy.taxCycleMonths} months, ${ctx.taxPolicy.mode === "RESERVE" ? "paid from a reserve" : "paid out of pocket by the occupant"}`
            : "Tax policy: not set"}
          {" • "}Owed to occupant: {fmt(ctx.balances?.owedToOccupant)}
          {" • "}Tax reserve: {fmt(ctx.balances?.reserveBalance)}
        </p>
        {latestOwnership.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-4">
            {latestOwnership.map((row) => (
              <div key={row.membershipId} className="text-sm">
                <span className="text-black/50">{row.displayLabel}: </span>
                <strong>{fmtPct(row.ownershipPct)}</strong>
                <span className="ml-1 text-black/40">({fmt(row.equityValue)})</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {ctx.isAdmin ? <AdminSettings ctx={ctx} onSaved={fetchAll} /> : null}

      <section className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Payment History</h2>
          <a
            href={`/api/exports/ledger?partnershipId=${encodeURIComponent(partnership.id)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-[var(--line)] px-3 py-1.5 text-xs font-medium"
          >
            Export CSV
          </a>
        </div>
        {ledgerError && <p className="mt-3 text-sm text-red-700">{ledgerError}</p>}
        {ledger && records.length === 0 && (
          <p className="mt-3 text-sm text-black/50">No records yet. Use the Entries tab to post the first entry.</p>
        )}
        {records.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-black/50">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4 text-right">Amount</th>
                  <th className="pb-2 pr-4 text-right">Dividends</th>
                  <th className="pb-2 pr-4 text-right">Equity purchase</th>
                  <th className="pb-2 pr-4 text-right">Tax reimb. / reserve</th>
                  <th className="pb-2 pr-4 text-right">Kept</th>
                  <th className="pb-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={`${record.type}:${record.id}`} className="border-b border-[var(--line)]/40">
                    <td className="py-2 pr-4 font-medium" title={fmtDate(record.date, "day")}>
                      {fmtDate(record.date, "day")}
                    </td>
                    {record.type === "MONTHLY_RENT" ? (
                      <>
                        <td className="py-2 pr-4">Rent — {fmtDate(record.rentMonth, "month")}</td>
                        <td className="py-2 pr-4 text-right">{fmt(record.amount)}</td>
                        <td className="py-2 pr-4 text-right">{fmt(record.dividends)}</td>
                        <td className="py-2 pr-4 text-right">{fmt(record.ownershipPurchase)}</td>
                        <td className="py-2 pr-4 text-right">
                          {record.reserveContribution > 0
                            ? `${fmt(record.taxReimbursement)} / ${fmt(record.reserveContribution)}`
                            : fmt(record.taxReimbursement)}
                        </td>
                        <td className="py-2 pr-4 text-right">{record.occupantRetained > 0 ? fmt(record.occupantRetained) : "—"}</td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-4">
                          {RECORD_LABELS[record.type]}
                          {record.months && record.type !== "EXPENSE_DILUTION" ? ` (${record.months}m)` : ""}
                        </td>
                        <td className="py-2 pr-4 text-right">{fmt(record.amount)}</td>
                        <td className="py-2 pr-4 text-right">—</td>
                        <td className="py-2 pr-4 text-right">{record.type === "EXPENSE_DILUTION" ? fmt(record.amount) : "—"}</td>
                        <td className="py-2 pr-4 text-right">—</td>
                        <td className="py-2 pr-4 text-right">—</td>
                      </>
                    )}
                    <td className="py-2 text-black/70">{record.note?.trim() || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {ownershipTimeline.length > 0 && (
        <section className="card p-6">
          <h2 className="text-lg font-semibold">Ownership Timeline</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-black/50">
                  <th className="pb-2 pr-4">As of</th>
                  <th className="pb-2 pr-4">Member</th>
                  <th className="pb-2 pr-4 text-right">Ownership %</th>
                  <th className="pb-2 text-right">Equity value</th>
                </tr>
              </thead>
              <tbody>
                {ownershipTimeline.map((row, i) => (
                  <tr key={i} className="border-b border-[var(--line)]/40">
                    <td className="py-2 pr-4">{fmtDate(row.asOf, "day")}</td>
                    <td className="py-2 pr-4 font-medium">{row.displayLabel}</td>
                    <td className="py-2 pr-4 text-right">{fmtPct(row.ownershipPct)}</td>
                    <td className="py-2 text-right">{fmt(row.equityValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {currentMembership ? (
        <Projection
          partnershipId={partnership.id}
          membershipId={currentMembership.id}
          isOccupant={currentMembership.id === occupant?.id}
          records={records}
        />
      ) : null}
    </main>
  );
}

function Projection({
  partnershipId,
  membershipId,
  isOccupant,
  records,
}: {
  partnershipId: string;
  membershipId: string;
  isOccupant: boolean;
  records: LedgerRecord[];
}) {
  const [monthly, setMonthly] = useState("3000");
  const [maxMonths, setMaxMonths] = useState("360");
  const [projection, setProjection] = useState<ProjectionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/projections/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnershipId, monthlyTotalPaid: Number(monthly), maxMonths: Number(maxMonths) }),
    });
    const data = (await response.json()) as ProjectionResponse;
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? "Failed to run projection.");
      return;
    }
    setProjection(data);
  }

  const rentRecords = records.filter((record): record is RentRecord => record.type === "MONTHLY_RENT");
  // Occupant: the real cost of living there is the dividend paid to investors. Investor: dividends received.
  const actualDividends = roundMoney(
    rentRecords.reduce(
      (sum, record) =>
        sum +
        (isOccupant
          ? record.dividends
          : record.allocations.find((allocation) => allocation.membershipId === membershipId)?.rentAmount ?? 0),
      0,
    ),
  );

  const valuation = projection?.inputs.valuation ?? 0;
  const rows = projectionRows(projection?.result.history ?? [], membershipId, isOccupant, valuation);
  const cumulative = rows.at(-1)?.cumulative ?? 0;
  const exportQuery = `partnershipId=${encodeURIComponent(partnershipId)}&monthlyTotalPaid=${encodeURIComponent(monthly)}`;

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold">Buyout Projection</h2>
      <p className="mt-1 text-sm text-black/60">
        How long until the occupant owns 100%, paying the same total every month. Uses current ownership,
        rent, valuation and tax policy, starting the month after the latest recorded rent month.
      </p>

      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={run}>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-black/60">Monthly total payment ($)</label>
          <input
            type="number"
            step="0.01"
            value={monthly}
            onChange={(event) => setMonthly(event.target.value)}
            className="rounded border border-[var(--line)] px-3 py-2 text-sm"
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-black/60">Max months</label>
          <input
            type="number"
            value={maxMonths}
            onChange={(event) => setMaxMonths(event.target.value)}
            className="rounded border border-[var(--line)] px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <button type="submit" disabled={busy} className="rounded bg-[var(--surface-strong)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {busy ? "Calculating…" : "Run projection"}
          </button>
          {projection ? (
            <>
              <a href={`/api/exports/projection?${exportQuery}`} target="_blank" rel="noreferrer" className="rounded border border-[var(--line)] px-3 py-2 text-xs font-medium">
                Export CSV
              </a>
              <a href={`/api/exports/projection-pdf?${exportQuery}`} target="_blank" rel="noreferrer" className="rounded border border-[var(--line)] px-3 py-2 text-xs font-medium">
                Export PDF
              </a>
            </>
          ) : null}
        </div>
        {error && <p className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      </form>

      {projection ? (
        <div className="mt-5">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-black/50">Buyout in</dt>
              <dd className="font-semibold">
                {projection.result.completed
                  ? `${rows.length} months (${(rows.length / 12).toFixed(1)} years) — ${fmtDate(projection.result.buyoutMonth, "month")}`
                  : "Not reached at this payment"}
              </dd>
            </div>
            <div>
              <dt className="text-black/50">{isOccupant ? "Rent paid to investors so far" : "Dividends received so far"}</dt>
              <dd className="font-semibold">{fmt(actualDividends)}</dd>
            </div>
            <div>
              <dt className="text-black/50">{isOccupant ? "Rent paid (so far + projected)" : "Dividends (so far + projected)"}</dt>
              <dd className="font-semibold">{fmt(roundMoney(actualDividends + cumulative))}</dd>
            </div>
          </dl>

          <div className="mt-4 max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-[var(--line)] text-left text-black/50">
                  <th className="pb-2 pr-4">Month</th>
                  <th className="pb-2 pr-4 text-right">Starting equity</th>
                  <th className="pb-2 pr-4 text-right">{isOccupant ? "Rent paid (dividends)" : "Dividend"}</th>
                  <th className="pb-2 pr-4 text-right">{isOccupant ? "Equity bought" : "Equity sold"}</th>
                  <th className="pb-2 pr-4 text-right">Ending equity</th>
                  <th className="pb-2 text-right">{isOccupant ? "Total rent paid" : "Total dividends"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.number} className="border-b border-[var(--line)]/40">
                    <td className="py-1.5 pr-4">{row.number} <span className="text-black/40">({fmtDate(row.month, "month")})</span></td>
                    <td className="py-1.5 pr-4 text-right">{fmt(row.startingEquity)}</td>
                    <td className="py-1.5 pr-4 text-right">{fmt(row.dividend)}</td>
                    <td className="py-1.5 pr-4 text-right">{fmt(row.equityChange)}</td>
                    <td className="py-1.5 pr-4 text-right">{fmt(row.endingEquity)}</td>
                    <td className="py-1.5 text-right">{fmt(row.cumulative)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function projectionRows(history: ProjectionMonth[], membershipId: string, isOccupant: boolean, valuation: number) {
  const rows = [];
  let cumulative = 0;
  for (const [index, month] of history.entries()) {
    const dividend = isOccupant ? month.investorDividends : month.dividends[membershipId] ?? 0;
    cumulative = roundMoney(cumulative + dividend);
    rows.push({
      number: index + 1,
      month: month.month,
      startingEquity: roundMoney(((month.ownershipPctBefore[membershipId] ?? 0) / 100) * valuation),
      dividend,
      equityChange: isOccupant ? month.ownershipPurchase : month.purchases[membershipId] ?? 0,
      endingEquity: roundMoney(((month.ownershipPctAfter[membershipId] ?? 0) / 100) * valuation),
      cumulative,
    });
  }
  return rows;
}

function AdminSettings({ ctx, onSaved }: { ctx: PartnershipContext; onSaved: () => Promise<void> }) {
  const [rent, setRent] = useState(String(ctx.partnership?.agreedRent ?? ""));
  const [valuation, setValuation] = useState(String(ctx.partnership?.currentValuation ?? ""));
  const [taxMode, setTaxMode] = useState<TaxPolicy["mode"]>(ctx.taxPolicy?.mode ?? "OUT_OF_POCKET");
  const [taxPerCycle, setTaxPerCycle] = useState(ctx.taxPolicy ? String(ctx.taxPolicy.taxPerCycle) : "");
  const [taxCycle, setTaxCycle] = useState(String(ctx.taxPolicy?.taxCycleMonths ?? 12));

  const settings = useSubmit(async () => {
    await post(`/api/partnerships/${ctx.partnership!.id}/settings`, "PATCH", {
      agreedRent: Number(rent),
      currentValuation: Number(valuation),
      ...(taxPerCycle
        ? { taxMode, taxPerCycle: Number(taxPerCycle), taxCycleMonths: Number(taxCycle) }
        : {}),
    });
    await onSaved();
    return "Settings saved.";
  });

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold">Settings</h2>
      <p className="mt-1 text-sm text-black/60">Changes take effect from the current month.</p>

      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={settings.submit}>
        <LabeledInput label="Agreed rent ($)" value={rent} onChange={setRent} required />
        <LabeledInput label="Current valuation ($)" value={valuation} onChange={setValuation} required />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-black/60">How taxes are paid</label>
          <select
            value={taxMode}
            onChange={(event) => setTaxMode(event.target.value as TaxPolicy["mode"])}
            className="rounded border border-[var(--line)] px-3 py-2 text-sm"
          >
            <option value="OUT_OF_POCKET">Occupant pays, reimbursed from rent</option>
            <option value="RESERVE">Set aside a reserve from rent each month</option>
          </select>
        </div>
        <LabeledInput label="Expected tax per cycle ($)" value={taxPerCycle} onChange={setTaxPerCycle} />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-black/60">Tax cycle length</label>
          <select value={taxCycle} onChange={(event) => setTaxCycle(event.target.value)} className="rounded border border-[var(--line)] px-3 py-2 text-sm">
            <option value="6">6 months</option>
            <option value="12">12 months</option>
          </select>
        </div>
        <SubmitRow state={settings} label="Save settings" className="sm:col-span-2" />
      </form>

      <TaxPaymentForm
        partnershipId={ctx.partnership!.id}
        kind="OUT_OF_POCKET"
        title="Record tax paid out of pocket by the occupant"
        hint="Reimbursed from rent over the months you pick; it's suggested automatically on rent entries."
        onSaved={onSaved}
      />
      {taxMode === "RESERVE" || (ctx.balances?.reserveBalance ?? 0) > 0 ? (
        <TaxPaymentForm
          partnershipId={ctx.partnership!.id}
          kind="RESERVE_PAYMENT"
          title="Record tax paid from the reserve"
          hint={`Reserve balance: ${fmt(ctx.balances?.reserveBalance)}`}
          onSaved={onSaved}
        />
      ) : null}

      <PasswordReset ctx={ctx} />
    </section>
  );
}

function TaxPaymentForm({
  partnershipId,
  kind,
  title,
  hint,
  onSaved,
}: {
  partnershipId: string;
  kind: "OUT_OF_POCKET" | "RESERVE_PAYMENT";
  title: string;
  hint: string;
  onSaved: () => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [months, setMonths] = useState("6");
  const state = useSubmit(async () => {
    await post(`/api/partnerships/${partnershipId}/tax-payments`, "POST", {
      kind,
      amount: Number(amount),
      paidOn,
      coverageMonths: Number(months),
    });
    setAmount("");
    await onSaved();
    return "Recorded.";
  });

  return (
    <form className="mt-6 grid gap-3 sm:grid-cols-4" onSubmit={state.submit}>
      <h3 className="text-sm font-semibold sm:col-span-4">
        {title}
        <span className="ml-2 font-normal text-black/50">{hint}</span>
      </h3>
      <input
        type="number"
        step="0.01"
        min="0.01"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        placeholder="Amount paid"
        className="rounded border border-[var(--line)] px-3 py-2 text-sm"
        required
      />
      <input
        type="date"
        value={paidOn}
        onChange={(event) => setPaidOn(event.target.value)}
        className="rounded border border-[var(--line)] px-3 py-2 text-sm"
        required
      />
      {kind === "OUT_OF_POCKET" ? (
        <select value={months} onChange={(event) => setMonths(event.target.value)} className="rounded border border-[var(--line)] px-3 py-2 text-sm">
          <option value="6">Reimburse over 6 months</option>
          <option value="12">Reimburse over 12 months</option>
        </select>
      ) : (
        <div />
      )}
      <SubmitRow state={state} label="Record" />
    </form>
  );
}

function PasswordReset({ ctx }: { ctx: PartnershipContext }) {
  const [userId, setUserId] = useState(ctx.memberships?.[0]?.userId ?? "");
  const [password, setPassword] = useState("");
  const state = useSubmit(async () => {
    await post(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, "POST", {
      temporaryPassword: password,
    });
    setPassword("");
    return "Temporary password set. The user must change it after their next sign in.";
  });

  return (
    <form className="mt-6 grid gap-3 sm:grid-cols-4" onSubmit={state.submit}>
      <h3 className="text-sm font-semibold sm:col-span-4">Reset user password to temporary</h3>
      <select value={userId} onChange={(event) => setUserId(event.target.value)} className="rounded border border-[var(--line)] px-3 py-2 text-sm" required>
        {ctx.memberships?.map((membership) => (
          <option key={membership.id} value={membership.userId ?? ""}>
            {membership.userName ?? membership.displayLabel} ({membership.userEmail ?? "No email"})
          </option>
        ))}
      </select>
      <input
        type="password"
        minLength={8}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Temporary password (min 8 chars)"
        className="rounded border border-[var(--line)] px-3 py-2 text-sm"
        required
      />
      <div />
      <SubmitRow state={state} label="Set temporary password" />
    </form>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-black/60">{label}</label>
      <input
        type="number"
        step="0.01"
        min="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded border border-[var(--line)] px-3 py-2 text-sm"
        required={required}
      />
    </div>
  );
}

type SubmitState = ReturnType<typeof useSubmit>;

/** Busy/message/error handling for a small admin form. */
function useSubmit(action: () => Promise<string>) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      setMessage(await action());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, error, submit };
}

function SubmitRow({ state, label, className = "" }: { state: SubmitState; label: string; className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <button type="submit" disabled={state.busy} className="rounded border border-[var(--line)] px-4 py-2 text-sm font-medium disabled:opacity-60">
        {state.busy ? "Saving…" : label}
      </button>
      {state.message ? <span className="text-xs text-green-700">{state.message}</span> : null}
      {state.error ? <span className="text-xs text-red-700">{state.error}</span> : null}
    </div>
  );
}

async function post(url: string, method: "POST" | "PATCH", body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}
