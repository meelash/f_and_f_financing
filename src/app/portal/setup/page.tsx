"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type SetupResult = {
  partnershipId: string;
  propertyId: string;
  occupantMembershipId: string;
  investorMembershipId: string;
};

export default function SetupPage() {
  const router = useRouter();
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SetupResult | null>(null);
  const [manualOwnership, setManualOwnership] = useState(false);
  const [occupantContribution, setOccupantContribution] = useState("");
  const [investorContribution, setInvestorContribution] = useState("");
  const [occupantOwnershipPct, setOccupantOwnershipPct] = useState("50");
  const [investorOwnershipPct, setInvestorOwnershipPct] = useState("50");

  function calculateOwnershipPct(
    occupantAmountRaw: string,
    investorAmountRaw: string,
    decimals: number,
  ) {
    const occupantAmount = Number(occupantAmountRaw);
    const investorAmount = Number(investorAmountRaw);
    const total = occupantAmount + investorAmount;

    if (total <= 0) {
      return null;
    }

    return {
      occupant: Number(((occupantAmount / total) * 100).toFixed(decimals)),
      investor: Number(((investorAmount / total) * 100).toFixed(decimals)),
    };
  }

  function recalculateOwnership(occupantAmountRaw: string, investorAmountRaw: string) {
    const calculated = calculateOwnershipPct(occupantAmountRaw, investorAmountRaw, 4);

    if (!calculated) {
      setOccupantOwnershipPct("50");
      setInvestorOwnershipPct("50");
      return;
    }

    setOccupantOwnershipPct(calculated.occupant.toFixed(4));
    setInvestorOwnershipPct(calculated.investor.toFixed(4));
  }

  function onOccupantContributionChange(value: string) {
    setOccupantContribution(value);
    if (!manualOwnership) {
      recalculateOwnership(value, investorContribution);
    }
  }

  function onInvestorContributionChange(value: string) {
    setInvestorContribution(value);
    if (!manualOwnership) {
      recalculateOwnership(occupantContribution, value);
    }
  }

  function onManualOwnershipToggle(checked: boolean) {
    setManualOwnership(checked);
    if (!checked) {
      recalculateOwnership(occupantContribution, investorContribution);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    const autoOwnership =
      !manualOwnership
        ? calculateOwnershipPct(
            String(payload.occupantContribution ?? ""),
            String(payload.investorContribution ?? ""),
            6,
          )
        : null;

    const response = await fetch("/api/setup/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        startDate,
        initialValuation: Number(payload.initialValuation),
        agreedRent: Number(payload.agreedRent),
        occupantOwnershipPct: autoOwnership?.occupant ?? Number(payload.occupantOwnershipPct),
        investorOwnershipPct: autoOwnership?.investor ?? Number(payload.investorOwnershipPct),
        occupantContribution: Number(payload.occupantContribution),
        investorContribution: Number(payload.investorContribution),
        taxMode: payload.taxAmount ? String(payload.taxMode) : undefined,
        taxAmount: payload.taxAmount ? Number(payload.taxAmount) : undefined,
        taxCoverageMonths: payload.taxAmount ? Number(payload.taxCoverageMonths) : undefined,
      }),
    });

    const data = (await response.json()) as SetupResult & { error?: string };

    if (!response.ok) {
      setError(data.error ?? "Failed to initialize setup.");
      setBusy(false);
      return;
    }

    setResult(data);
    setBusy(false);
    router.push("/portal/ledger");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="card p-6">
        <h1 className="text-2xl font-semibold">Setup Wizard</h1>
        <p className="mt-2 text-sm text-black/70">
          Initialize a partnership, property profile, starting ownership, and initial
          contributions.
        </p>
      </section>

      <form className="card grid gap-4 p-6" onSubmit={onSubmit}>
        <input name="partnershipName" placeholder="Partnership name" className="rounded border border-[var(--line)] px-3 py-2" required />
        <input name="propertyName" placeholder="Property name" className="rounded border border-[var(--line)] px-3 py-2" required />
        <input
          name="startDate"
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          className="rounded border border-[var(--line)] px-3 py-2"
          required
        />
        <input name="addressLine1" placeholder="Address line" className="rounded border border-[var(--line)] px-3 py-2" />
        <div className="grid gap-3 sm:grid-cols-3">
          <input name="city" placeholder="City" className="rounded border border-[var(--line)] px-3 py-2" />
          <input name="stateProvince" placeholder="State/Province" className="rounded border border-[var(--line)] px-3 py-2" />
          <input name="country" placeholder="Country" defaultValue="Canada" className="rounded border border-[var(--line)] px-3 py-2" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="initialValuation" type="number" step="0.01" placeholder="Initial valuation" className="rounded border border-[var(--line)] px-3 py-2" required />
          <input name="agreedRent" type="number" step="0.01" placeholder="Monthly agreed rent" className="rounded border border-[var(--line)] px-3 py-2" required />
        </div>

        <h2 className="mt-2 text-lg font-medium">Tax Policy</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <select name="taxMode" className="rounded border border-[var(--line)] px-3 py-2" defaultValue="OUT_OF_POCKET">
            <option value="OUT_OF_POCKET">Reimburse occupant (paid out of pocket)</option>
            <option value="RESERVE">Build partnership reserve (negative reimbursement)</option>
          </select>
          <input name="taxAmount" type="number" step="0.01" placeholder="Tax amount per cycle" className="rounded border border-[var(--line)] px-3 py-2" />
          <select name="taxCoverageMonths" className="rounded border border-[var(--line)] px-3 py-2" defaultValue="12">
            <option value="6">6 months</option>
            <option value="12">12 months</option>
          </select>
        </div>

        <h2 className="mt-2 text-lg font-medium">Occupant</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="occupantName" placeholder="Name" className="rounded border border-[var(--line)] px-3 py-2" required />
          <input name="occupantEmail" type="email" placeholder="Email" className="rounded border border-[var(--line)] px-3 py-2" required />
        </div>
        <input
          name="occupantPassword"
          type="password"
          minLength={8}
          placeholder="Occupant temporary password (min 8 chars)"
          className="rounded border border-[var(--line)] px-3 py-2"
          required
        />

        <h2 className="mt-2 text-lg font-medium">Investor Partner</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="investorName" placeholder="Name" className="rounded border border-[var(--line)] px-3 py-2" required />
          <input name="investorEmail" type="email" placeholder="Email" className="rounded border border-[var(--line)] px-3 py-2" required />
        </div>
        <input
          name="investorPassword"
          type="password"
          minLength={8}
          placeholder="Investor temporary password (min 8 chars)"
          className="rounded border border-[var(--line)] px-3 py-2"
          required
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            name="occupantContribution"
            type="number"
            step="0.01"
            placeholder="Occupant contribution"
            className="rounded border border-[var(--line)] px-3 py-2"
            value={occupantContribution}
            onChange={(event) => onOccupantContributionChange(event.target.value)}
            required
          />
          <input
            name="investorContribution"
            type="number"
            step="0.01"
            placeholder="Investor contribution"
            className="rounded border border-[var(--line)] px-3 py-2"
            value={investorContribution}
            onChange={(event) => onInvestorContributionChange(event.target.value)}
            required
          />
        </div>

        <label className="mt-1 flex items-center gap-2 text-sm text-black/70">
          <input
            type="checkbox"
            checked={manualOwnership}
            onChange={(event) => onManualOwnershipToggle(event.target.checked)}
          />
          Set ownership percentages manually (non-proportional to contributions)
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            name="occupantOwnershipPct"
            type="number"
            step="0.0001"
            placeholder="Occupant ownership %"
            className="rounded border border-[var(--line)] px-3 py-2"
            value={occupantOwnershipPct}
            onChange={(event) => setOccupantOwnershipPct(event.target.value)}
            readOnly={!manualOwnership}
            required
          />
          <input
            name="investorOwnershipPct"
            type="number"
            step="0.0001"
            placeholder="Investor ownership %"
            className="rounded border border-[var(--line)] px-3 py-2"
            value={investorOwnershipPct}
            onChange={(event) => setInvestorOwnershipPct(event.target.value)}
            readOnly={!manualOwnership}
            required
          />
        </div>

        <button disabled={busy} className="mt-2 rounded bg-[var(--surface-strong)] px-4 py-2 font-medium text-white disabled:opacity-60">
          {busy ? "Initializing..." : "Initialize Partnership"}
        </button>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </form>

      {result ? (
        <section className="card p-6">
          <h2 className="text-lg font-semibold">Setup Complete</h2>
          <p className="mt-2 text-sm text-black/70">Redirecting to the ledger&hellip;</p>
        </section>
      ) : null}
    </main>
  );
}
