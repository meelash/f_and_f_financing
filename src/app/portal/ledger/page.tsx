"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type PartnershipContext = {
  exists: boolean;
  isAdmin?: boolean;
  currentUser?: { id: string; role: "ADMIN" | "PARTNER" };
  partnership?: { id: string; name: string; agreedRent: number; currentValuation: number };
  taxSettings?: {
    mode: "OUT_OF_POCKET" | "RESERVE" | null;
    amount: number;
    coverageMonths: number;
    monthlyAmount: number;
    reserveBalance: number;
  };
  memberships?: Array<{
    id: string;
    displayLabel: string;
    role: string;
    userId?: string;
    userName?: string;
    userEmail?: string;
  }>;
};

type Payment = {
  id: string;
  paymentMonth: string;
  totalPaid: number;
  agreedRentApplied: number;
  taxReimbursement: number;
  ownershipPurchase: number;
  allocations: Array<{
    membershipId: string;
    displayLabel: string;
    ownershipPctBefore: number;
    rentAmount: number;
    purchaseAmount: number;
  }>;
};

type LedgerRecord = {
  id: string;
  type: "MONTHLY_RENT" | "TAX_OUT_OF_POCKET" | "HOME_EXPENSE";
  occurredOn: string;
  paidOn?: string | null;
  amount: number;
  agreedRentApplied: number;
  taxReimbursement: number;
  ownershipPurchase: number;
  treatment?: "AMORTIZE_OFFSET" | "VALUATION_DILUTION";
  amortizationMonths?: number | null;
  note?: string | null;
};

type OwnershipPoint = {
  asOf: string;
  membershipId: string;
  displayLabel: string;
  ownershipPct: number;
  equityValue: number;
};

type LedgerData = {
  records: LedgerRecord[];
  payments: Payment[];
  ownershipTimeline: OwnershipPoint[];
};

type ProjectionMonth = {
  month: string;
  ownershipPurchase: number;
  partnerRent: number;
  agreedRentApplied: number;
  sharedTaxAmount: number;
  rentForDividend: number;
  extraAfterRent: number;
  ownershipPctBeforeByMembership: Record<string, number>;
};

type ProjectionResult = {
  completed: boolean;
  buyoutMonth: string | null;
  monthsSimulated: number;
  totalPartnerDividendRent: number;
  totalOwnershipPurchase: number;
  history: ProjectionMonth[];
};

type ProjectionEstimateResponse = {
  inputs?: {
    startMonth: string;
    agreedRent: number;
    valuation: number;
    monthlyTotalPaid: number;
  };
  result?: ProjectionResult;
  error?: string;
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
  return `${pct.toFixed(2)}%`;
}

function fmtFullDate(s?: string | null) {
  if (!s) {
    return "—";
  }
  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const date = isoDateOnly
    ? new Date(Date.UTC(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3])))
    : new Date(s);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fmtMonth(s?: string | null) {
  if (!s) {
    return "—";
  }

  // Parse YYYY-MM-DD as UTC to avoid local timezone shifting the month backwards.
  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const date = isoDateOnly
    ? new Date(Date.UTC(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3])))
    : new Date(s);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function LedgerPage() {
  const [ctx, setCtx] = useState<PartnershipContext | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [projection, setProjection] = useState<ProjectionResult | null>(null);
  const [projectionInputs, setProjectionInputs] = useState<{
    startMonth: string;
    agreedRent: number;
    valuation: number;
    monthlyTotalPaid: number;
  } | null>(null);
  const [projError, setProjError] = useState<string | null>(null);
  const [projBusy, setProjBusy] = useState(false);
  const [settingsRent, setSettingsRent] = useState("");
  const [settingsValuation, setSettingsValuation] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsTaxMode, setSettingsTaxMode] = useState<"OUT_OF_POCKET" | "RESERVE">("OUT_OF_POCKET");
  const [settingsTaxAmount, setSettingsTaxAmount] = useState("");
  const [settingsTaxCoverage, setSettingsTaxCoverage] = useState("12");
  const [reservePaymentAmount, setReservePaymentAmount] = useState("");
  const [reservePaymentDate, setReservePaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reservePaymentBusy, setReservePaymentBusy] = useState(false);
  const [reservePaymentError, setReservePaymentError] = useState<string | null>(null);
  const [reservePaymentMessage, setReservePaymentMessage] = useState<string | null>(null);
  const [oopAmount, setOopAmount] = useState("");
  const [oopDate, setOopDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [oopCoverage, setOopCoverage] = useState("12");
  const [oopBusy, setOopBusy] = useState(false);
  const [oopError, setOopError] = useState<string | null>(null);
  const [oopMessage, setOopMessage] = useState<string | null>(null);
  const [passwordResetUserId, setPasswordResetUserId] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [passwordResetBusy, setPasswordResetBusy] = useState(false);
  const [passwordResetError, setPasswordResetError] = useState<string | null>(null);
  const [passwordResetMessage, setPasswordResetMessage] = useState<string | null>(null);

  const fetchContext = useCallback(async () => {
    const contextResponse = await fetch("/api/demo/context");
    const data = (await contextResponse.json()) as PartnershipContext;

    if (!data.exists || !data.partnership?.id) {
      setCtxError("No partnership found. Complete setup first.");
      return;
    }

    setCtxError(null);
    setCtx(data);
    setSettingsRent(String(data.partnership.agreedRent ?? ""));
    setSettingsValuation(String(data.partnership.currentValuation ?? ""));
    setSettingsTaxMode(data.taxSettings?.mode === "RESERVE" ? "RESERVE" : "OUT_OF_POCKET");
    setSettingsTaxAmount(data.taxSettings?.amount ? String(data.taxSettings.amount) : "");
    setSettingsTaxCoverage(String(data.taxSettings?.coverageMonths ?? 12));
    if (data.memberships?.length) {
      const defaultUserId = data.memberships[0]?.userId;
      if (defaultUserId) {
        setPasswordResetUserId((previous) => previous || defaultUserId);
      }
    }

    const ledgerResponse = await fetch(`/api/ledger/${data.partnership.id}`);
    const ledgerData = (await ledgerResponse.json()) as LedgerData & { error?: string };
    if (ledgerData.error) {
      setLedgerError(ledgerData.error);
      return;
    }

    setLedgerError(null);
    setLedger(ledgerData);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      fetchContext()
        .catch(() => setCtxError("Failed to load partnership context."));
    });
  }, [fetchContext]);

  async function runProjection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ctx?.partnership) return;
    setProjBusy(true);
    setProjError(null);

    const occupant = ctx.memberships?.find((m) => m.role === "OCCUPANT");
    const formData = new FormData(event.currentTarget);
    const payload = {
      partnershipId: ctx.partnership.id,
      occupantMembershipId: occupant?.id,
      monthlyTotalPaid: Number(formData.get("monthlyTotalPaid")),
      maxMonths: Number(formData.get("maxMonths") || 360),
    };

    const response = await fetch("/api/projections/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as ProjectionEstimateResponse;
    setProjBusy(false);

    if (!response.ok) {
      setProjError(data.error ?? "Failed to run projection.");
      return;
    }

    if (!data.result) {
      setProjError("Projection response was missing result data.");
      return;
    }

    setProjectionInputs(data.inputs ?? null);
    setProjection(data.result);
  }

  async function recordReservePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ctx?.partnership) return;

    setReservePaymentBusy(true);
    setReservePaymentError(null);
    setReservePaymentMessage(null);

    const response = await fetch(
      `/api/partnerships/${ctx.partnership.id}/tax-reserve-payment`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(reservePaymentAmount),
          paidOn: reservePaymentDate,
        }),
      },
    );

    const data = (await response.json()) as { error?: string };
    setReservePaymentBusy(false);

    if (!response.ok) {
      setReservePaymentError(data.error ?? "Failed to record reserve payment.");
      return;
    }

    setReservePaymentMessage("Reserve tax payment recorded.");
    setReservePaymentAmount("");
    await fetchContext();
  }

  async function recordOutOfPocketPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ctx?.partnership) return;

    setOopBusy(true);
    setOopError(null);
    setOopMessage(null);

    const response = await fetch(
      `/api/partnerships/${ctx.partnership.id}/tax-out-of-pocket-payment`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(oopAmount),
          paidOn: oopDate,
          coverageMonths: Number(oopCoverage),
        }),
      },
    );

    const data = (await response.json()) as { error?: string };
    setOopBusy(false);

    if (!response.ok) {
      setOopError(data.error ?? "Failed to record out-of-pocket tax payment.");
      return;
    }

    setOopMessage("Out-of-pocket tax payment recorded.");
    setOopAmount("");
    await fetchContext();
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ctx?.partnership) return;

    setSettingsBusy(true);
    setSettingsError(null);
    setSettingsMessage(null);

    const response = await fetch(
      `/api/partnerships/${ctx.partnership.id}/settings`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agreedRent: Number(settingsRent),
          currentValuation: Number(settingsValuation),
          taxMode: settingsTaxAmount ? settingsTaxMode : undefined,
          taxAmount: settingsTaxAmount ? Number(settingsTaxAmount) : undefined,
          taxCoverageMonths: settingsTaxAmount ? Number(settingsTaxCoverage) : undefined,
        }),
      },
    );

    const data = (await response.json()) as {
      error?: string;
      settings?: { agreedRent: number; currentValuation: number };
    };

    setSettingsBusy(false);

    if (!response.ok) {
      setSettingsError(data.error ?? "Failed to save settings.");
      return;
    }

    setCtx((previous) => {
      if (!previous?.partnership || !data.settings) {
        return previous;
      }

      return {
        ...previous,
        partnership: {
          ...previous.partnership,
          agreedRent: data.settings.agreedRent,
          currentValuation: data.settings.currentValuation,
        },
      };
    });

    setSettingsMessage("Settings updated. Monthly entries now use these values.");
  }

  async function resetMemberPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ctx?.isAdmin || !passwordResetUserId) {
      return;
    }

    setPasswordResetBusy(true);
    setPasswordResetError(null);
    setPasswordResetMessage(null);

    const response = await fetch(`/api/admin/users/${encodeURIComponent(passwordResetUserId)}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ temporaryPassword }),
    });

    const data = (await response.json()) as { error?: string };
    setPasswordResetBusy(false);

    if (!response.ok) {
      setPasswordResetError(data.error ?? "Failed to reset user password.");
      return;
    }

    setTemporaryPassword("");
    setPasswordResetMessage(
      "Temporary password set. The user must change it after their next sign in.",
    );
  }

  if (ctxError) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="card p-6"><p className="text-sm text-red-700">{ctxError}</p></section>
      </main>
    );
  }

  if (!ctx) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="card p-6"><p className="text-sm text-black/60">Loading ledger&hellip;</p></section>
      </main>
    );
  }

  const occupant = ctx.memberships?.find((m) => m.role === "OCCUPANT");
  const partnershipId = ctx.partnership!.id;
  const payments = Array.isArray(ledger?.payments) ? ledger.payments : [];
  const records = Array.isArray(ledger?.records) ? ledger.records : [];
  const ownershipTimeline = Array.isArray(ledger?.ownershipTimeline)
    ? ledger.ownershipTimeline
    : [];
  const projectionHistory = Array.isArray(projection?.history)
    ? projection.history
    : [];
  const currentMembership = ctx.memberships?.find(
    (membership) => membership.userId === ctx.currentUser?.id,
  );
  const userIsOccupant = currentMembership?.role === "OCCUPANT";
  const projectionMembershipId = currentMembership?.id;
  const projectionValuation = projectionInputs?.valuation ?? ctx.partnership?.currentValuation ?? 0;
  const latestRecordedPaymentMonth = payments.length > 0 ? payments[payments.length - 1].paymentMonth : null;
  const defaultProjectionStartMonth = latestRecordedPaymentMonth
    ? nextMonthIso(latestRecordedPaymentMonth)
    : toUtcMonthStartIso(new Date());
  const projectedStartMonth = projectionInputs?.startMonth ?? defaultProjectionStartMonth;

  const alreadyReceivedDividends = roundMoney(
    payments.reduce((sum, payment) => {
      const allocation = payment.allocations.find(
        (entry) => entry.membershipId === currentMembership?.id,
      );
      return sum + Number(allocation?.rentAmount ?? 0);
    }, 0),
  );

  const alreadyPaidRent = roundMoney(
    payments.reduce((sum, payment) => sum + Number(payment.agreedRentApplied), 0),
  );

  let previousEndingEquity: number | null = null;
  let cumulativeValue = 0;
  const projectionTableRows: Array<{
    monthNumber: number;
    startingEquity: number;
    monthlyValue: number;
    transactionAmount: number;
    endingEquity: number;
    cumulativeValue: number;
  }> = [];

  for (const [index, row] of projectionHistory.entries()) {
    const startingPct = projectionMembershipId
      ? Number(row.ownershipPctBeforeByMembership?.[projectionMembershipId] ?? 0)
      : 0;
    const startingEquity =
      index === 0
        ? roundMoney((startingPct / 100) * projectionValuation)
        : previousEndingEquity ?? 0;

    const monthlyTotal = roundMoney(row.agreedRentApplied + row.extraAfterRent);
    const dividendAmount = row.partnerRent;
    const equityAmount = roundMoney(monthlyTotal - dividendAmount);

    if (userIsOccupant) {
      const endingEquity = roundMoney(Math.min(projectionValuation, startingEquity + equityAmount));
      previousEndingEquity = endingEquity;
      cumulativeValue = roundMoney(cumulativeValue + dividendAmount);

      projectionTableRows.push({
        monthNumber: index + 1,
        startingEquity,
        monthlyValue: dividendAmount,
        transactionAmount: equityAmount,
        endingEquity,
        cumulativeValue,
      });

      if (endingEquity >= projectionValuation) break;
    } else {
      const endingEquity = roundMoney(Math.max(0, startingEquity - equityAmount));
      previousEndingEquity = endingEquity;
      cumulativeValue = roundMoney(cumulativeValue + dividendAmount);

      projectionTableRows.push({
        monthNumber: index + 1,
        startingEquity,
        monthlyValue: dividendAmount,
        transactionAmount: equityAmount,
        endingEquity,
        cumulativeValue,
      });

      if (endingEquity <= 0) break;
    }
  }
  const displayedBuyoutMonths = projectionTableRows.length;

  // Latest ownership per member from timeline
  const latestOwnership = ownershipTimeline.length
    ? [...ownershipTimeline]
        .reverse()
        .filter((row, idx, arr) => arr.findIndex((r) => r.membershipId === row.membershipId) === idx)
    : [];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <section className="card p-6">
        <h1 className="text-2xl font-semibold">Ledger &amp; Projections</h1>
        <p className="mt-1 text-sm text-black/70">{ctx.partnership!.name}</p>
        <p className="mt-1 text-xs text-black/50">
          Current rent: {fmt(ctx.partnership?.agreedRent)} / month • Current valuation: {fmt(ctx.partnership?.currentValuation)}
        </p>
        <p className="mt-1 text-xs text-black/50">
          Tax mode: {ctx.taxSettings?.mode ?? "Not set"} • Tax cycle: {ctx.taxSettings?.coverageMonths ?? 12} months • Tax per cycle: {fmt(ctx.taxSettings?.amount)} • Reserve balance: {fmt(ctx.taxSettings?.reserveBalance)}
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

      {ctx.isAdmin ? (
        <section className="card p-6">
          <h2 className="text-lg font-semibold">Settings</h2>
          <p className="mt-1 text-sm text-black/60">
            Update persisted rent and property valuation used by monthly postings and projections.
          </p>

          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={saveSettings}>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-black/60">Agreed rent ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={settingsRent}
                onChange={(event) => setSettingsRent(event.target.value)}
                className="rounded border border-[var(--line)] px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-black/60">Current valuation ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={settingsValuation}
                onChange={(event) => setSettingsValuation(event.target.value)}
                className="rounded border border-[var(--line)] px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-black/60">Tax mode</label>
              <select
                value={settingsTaxMode}
                onChange={(event) => setSettingsTaxMode(event.target.value as "OUT_OF_POCKET" | "RESERVE")}
                className="rounded border border-[var(--line)] px-3 py-2 text-sm"
              >
                <option value="OUT_OF_POCKET">Reimburse occupant (out of pocket)</option>
                <option value="RESERVE">Build partnership reserve</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-black/60">Tax amount per cycle ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={settingsTaxAmount}
                onChange={(event) => setSettingsTaxAmount(event.target.value)}
                className="rounded border border-[var(--line)] px-3 py-2 text-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-black/60">Tax cycle length</label>
              <select
                value={settingsTaxCoverage}
                onChange={(event) => setSettingsTaxCoverage(event.target.value)}
                className="rounded border border-[var(--line)] px-3 py-2 text-sm"
              >
                <option value="6">6 months</option>
                <option value="12">12 months</option>
              </select>
            </div>

            <div className="sm:col-span-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={settingsBusy}
                className="rounded bg-[var(--surface-strong)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {settingsBusy ? "Saving..." : "Save settings"}
              </button>
              {settingsMessage ? <span className="text-xs text-green-700">{settingsMessage}</span> : null}
              {settingsError ? <span className="text-xs text-red-700">{settingsError}</span> : null}
            </div>
          </form>

          {settingsTaxMode === "RESERVE" ? (
            <form className="mt-6 grid gap-3 sm:grid-cols-3" onSubmit={recordReservePayment}>
              <h3 className="sm:col-span-3 text-sm font-semibold">Record tax paid from reserve</h3>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={reservePaymentAmount}
                onChange={(event) => setReservePaymentAmount(event.target.value)}
                placeholder="Amount paid"
                className="rounded border border-[var(--line)] px-3 py-2 text-sm"
                required
              />
              <input
                type="date"
                value={reservePaymentDate}
                onChange={(event) => setReservePaymentDate(event.target.value)}
                className="rounded border border-[var(--line)] px-3 py-2 text-sm"
                required
              />
              <button
                type="submit"
                disabled={reservePaymentBusy}
                className="rounded border border-[var(--line)] px-4 py-2 text-sm font-medium"
              >
                {reservePaymentBusy ? "Recording..." : "Record payment"}
              </button>
              {reservePaymentMessage ? <p className="sm:col-span-3 text-xs text-green-700">{reservePaymentMessage}</p> : null}
              {reservePaymentError ? <p className="sm:col-span-3 text-xs text-red-700">{reservePaymentError}</p> : null}
            </form>
          ) : null}

          <form className="mt-6 grid gap-3 sm:grid-cols-4" onSubmit={recordOutOfPocketPayment}>
            <h3 className="sm:col-span-4 text-sm font-semibold">Record out-of-pocket tax payment (adds to reserve balance)</h3>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={oopAmount}
              onChange={(event) => setOopAmount(event.target.value)}
              placeholder="Amount paid"
              className="rounded border border-[var(--line)] px-3 py-2 text-sm"
              required
            />
            <input
              type="date"
              value={oopDate}
              onChange={(event) => setOopDate(event.target.value)}
              className="rounded border border-[var(--line)] px-3 py-2 text-sm"
              required
            />
            <select
              value={oopCoverage}
              onChange={(event) => setOopCoverage(event.target.value)}
              className="rounded border border-[var(--line)] px-3 py-2 text-sm"
            >
              <option value="6">6-month spread</option>
              <option value="12">12-month spread</option>
            </select>
            <button
              type="submit"
              disabled={oopBusy}
              className="rounded border border-[var(--line)] px-4 py-2 text-sm font-medium"
            >
              {oopBusy ? "Recording..." : "Record out-of-pocket"}
            </button>
            {oopMessage ? <p className="sm:col-span-4 text-xs text-green-700">{oopMessage}</p> : null}
            {oopError ? <p className="sm:col-span-4 text-xs text-red-700">{oopError}</p> : null}
          </form>

          <form className="mt-6 grid gap-3 sm:grid-cols-4" onSubmit={resetMemberPassword}>
            <h3 className="sm:col-span-4 text-sm font-semibold">Reset user password to temporary (admin only)</h3>
            <select
              value={passwordResetUserId}
              onChange={(event) => setPasswordResetUserId(event.target.value)}
              className="rounded border border-[var(--line)] px-3 py-2 text-sm"
              required
            >
              {ctx.memberships?.map((membership) => (
                <option key={membership.id} value={membership.userId ?? ""}>
                  {membership.userName ?? membership.displayLabel} ({membership.userEmail ?? "No email"})
                </option>
              ))}
            </select>
            <input
              type="password"
              minLength={8}
              value={temporaryPassword}
              onChange={(event) => setTemporaryPassword(event.target.value)}
              placeholder="Temporary password (min 8 chars)"
              className="rounded border border-[var(--line)] px-3 py-2 text-sm"
              required
            />
            <div className="sm:col-span-2" />
            <button
              type="submit"
              disabled={passwordResetBusy}
              className="rounded border border-[var(--line)] px-4 py-2 text-sm font-medium"
            >
              {passwordResetBusy ? "Resetting..." : "Set temporary password"}
            </button>
            {passwordResetMessage ? (
              <p className="sm:col-span-4 text-xs text-green-700">{passwordResetMessage}</p>
            ) : null}
            {passwordResetError ? (
              <p className="sm:col-span-4 text-xs text-red-700">{passwordResetError}</p>
            ) : null}
          </form>
        </section>
      ) : null}

      {/* Payment history */}
      <section className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Payment History</h2>
          <a
            href={`/api/exports/ledger?partnershipId=${encodeURIComponent(partnershipId)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-[var(--line)] px-3 py-1.5 text-xs font-medium"
          >
            Export CSV
          </a>
        </div>

        {ledgerError && <p className="mt-3 text-sm text-red-700">{ledgerError}</p>}

        {ledger && records.length === 0 && (
          <p className="mt-3 text-sm text-black/50">No records posted yet. Use the Entries tab to post the first entry.</p>
        )}

        {ledger && records.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-black/50">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4 text-right">Amount</th>
                  <th className="pb-2 pr-4 text-right">Balance Increase</th>
                  <th className="pb-2 pr-4 text-right">Dividend</th>
                  <th className="pb-2 pr-4 text-right">Ownership Purchase</th>
                  <th className="pb-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={`${record.type}:${record.id}`} className="border-b border-[var(--line)]/40">
                    <td className="py-2 pr-4 font-medium">
                      <span title={fmtFullDate(record.paidOn ?? record.occurredOn)} className="cursor-help">
                        {fmtMonth(record.occurredOn)}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {record.type === "MONTHLY_RENT"
                        ? "Monthly rent"
                        : record.type === "TAX_OUT_OF_POCKET"
                          ? "Tax out-of-pocket"
                          : record.treatment === "VALUATION_DILUTION"
                            ? "Expense dilution"
                            : `Expense offset${record.amortizationMonths ? ` (${record.amortizationMonths}m)` : ""}`}
                    </td>
                    <td className="py-2 pr-4 text-right">{fmt(record.amount)}</td>
                    <td className="py-2 pr-4 text-right">
                      {record.type === "TAX_OUT_OF_POCKET" ? fmt(record.amount) : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {record.type === "MONTHLY_RENT" ? (
                        <span
                          title="(Monthly Rent − Tax) × ownership %"
                          className="cursor-help"
                        >
                          {fmt(
                            payments
                              .find((p) => p.id === record.id)
                              ?.allocations.find((a) => a.membershipId !== occupant?.id)
                              ?.rentAmount ?? null
                          )}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right">{fmt(record.ownershipPurchase)}</td>
                    <td className="py-2 text-black/70">{record.note?.trim() ? record.note : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Ownership timeline */}
      {ledger && ownershipTimeline.length > 0 && (
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
                    <td className="py-2 pr-4">{fmtMonth(row.asOf)}</td>
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

      {/* Projection runner */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold">Buyout Projection</h2>
        <p className="mt-1 text-sm text-black/60">Simulate how long until the occupant reaches 100% ownership at a given monthly payment.</p>
        <p className="mt-1 text-xs text-black/50">
          Projection starts from month after latest recorded payment: {fmtMonth(projectedStartMonth)}
        </p>

        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={runProjection}>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-black/60">Monthly payment ($)</label>
            <input name="monthlyTotalPaid" type="number" step="0.01" defaultValue="3000" className="rounded border border-[var(--line)] px-3 py-2 text-sm" required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-black/60">Max months</label>
            <input name="maxMonths" type="number" defaultValue="360" className="rounded border border-[var(--line)] px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-3 flex flex-wrap gap-3">
            <button type="submit" disabled={projBusy} className="rounded bg-[var(--surface-strong)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {projBusy ? "Calculating…" : "Run projection"}
            </button>
            {projection && (
              <>
                <a
                  href={`/api/exports/projection?partnershipId=${encodeURIComponent(partnershipId)}&occupantMembershipId=${encodeURIComponent(occupant?.id ?? "")}&startMonth=${encodeURIComponent(projectedStartMonth)}&monthlyTotalPaid=${encodeURIComponent(String(projectionInputs?.monthlyTotalPaid ?? 3000))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-[var(--line)] px-3 py-2 text-xs font-medium"
                >
                  Export CSV
                </a>
                <a
                  href={`/api/exports/projection-pdf?partnershipId=${encodeURIComponent(partnershipId)}&occupantMembershipId=${encodeURIComponent(occupant?.id ?? "")}&startMonth=${encodeURIComponent(projectedStartMonth)}&monthlyTotalPaid=${encodeURIComponent(String(projectionInputs?.monthlyTotalPaid ?? 3000))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-[var(--line)] px-3 py-2 text-xs font-medium"
                >
                  Export PDF
                </a>
              </>
            )}
          </div>
          {projError && <p className="sm:col-span-3 text-sm text-red-700">{projError}</p>}
        </form>

        {projection && (
          <div className="mt-5">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-black/50">Buyout in</dt>
                <dd className="font-semibold">
                  {`${displayedBuyoutMonths} months (${(displayedBuyoutMonths / 12).toFixed(1)} years)`}
                </dd>
              </div>
              {userIsOccupant ? (
                <>
                  <div>
                    <dt className="text-black/50">Rent paid (actual)</dt>
                    <dd className="font-semibold">{fmt(alreadyPaidRent)}</dd>
                  </div>
                  <div>
                    <dt className="text-black/50">Rent paid (actual + projected)</dt>
                    <dd className="font-semibold">
                      {fmt(roundMoney(alreadyPaidRent + (projectionTableRows.at(-1)?.cumulativeValue ?? 0)))}
                    </dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt className="text-black/50">Dividends received (actual)</dt>
                    <dd className="font-semibold">{fmt(alreadyReceivedDividends)}</dd>
                  </div>
                  <div>
                    <dt className="text-black/50">Dividends received (actual + projected)</dt>
                    <dd className="font-semibold">
                      {fmt(roundMoney(alreadyReceivedDividends + projection.totalPartnerDividendRent))}
                    </dd>
                  </div>
                </>
              )}
            </dl>

            <div className="mt-4 max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-[var(--line)] text-left text-black/50">
                    <th className="pb-2 pr-4">Month</th>
                    <th className="pb-2 pr-4 text-right">Starting equity</th>
                    <th className="pb-2 pr-4 text-right">{userIsOccupant ? "Monthly rent paid" : "Monthly dividend"}</th>
                    <th className="pb-2 pr-4 text-right">{userIsOccupant ? "Equity gained" : "Buyout amount"}</th>
                    <th className="pb-2 pr-4 text-right">Ending equity</th>
                    <th className="pb-2 text-right">{userIsOccupant ? "Total rent paid" : "Total dividend"}</th>
                  </tr>
                </thead>
                <tbody>
                  {projectionTableRows.map((row) => (
                    <tr key={row.monthNumber} className="border-b border-[var(--line)]/40">
                      <td className="py-1.5 pr-4">{row.monthNumber}</td>
                      <td className="py-1.5 pr-4 text-right">{fmt(row.startingEquity)}</td>
                      <td className="py-1.5 pr-4 text-right">{fmt(row.monthlyValue)}</td>
                      <td className="py-1.5 pr-4 text-right">{fmt(row.transactionAmount)}</td>
                      <td className="py-1.5 pr-4 text-right">{fmt(row.endingEquity)}</td>
                      <td className="py-1.5 text-right">{fmt(row.cumulativeValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function toUtcMonthStartIso(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function nextMonthIso(isoDate: string) {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return toUtcMonthStartIso(new Date());
  }
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}
