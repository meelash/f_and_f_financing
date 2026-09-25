import {
  effectivePolicy,
  findOccupant,
  loadPartnership,
  ownershipAsOf,
  toTaxPolicy,
} from "@/lib/accounting/partnership-data";
import { addMonths, monthStart } from "@/lib/accounting/tax";
import { projectBuyoutTimeline } from "@/lib/projections/buyout";

/** Projects from current ownership, starting the month after the latest recorded rent month. */
export async function projectPartnership(input: {
  partnershipId: string;
  monthlyTotalPaid: number;
  maxMonths?: number;
}) {
  if (!(input.monthlyTotalPaid > 0)) throw new Error("Monthly payment must be a positive number.");

  const partnership = await loadPartnership(input.partnershipId);
  if (!partnership) throw new Error("Partnership not found.");
  const occupant = findOccupant(partnership);

  const latestRentMonth = partnership.monthlyPayments
    .map((payment) => payment.paymentMonth)
    .sort((left, right) => right.getTime() - left.getTime())[0];
  const startMonth = latestRentMonth ? addMonths(latestRentMonth, 1) : monthStart(new Date());

  const policy = effectivePolicy(partnership, startMonth);
  const taxPolicy = toTaxPolicy(policy);
  const agreedRent = Number(policy.agreedRent);
  const valuation = Number(
    partnership.properties[0]?.currentValuation ?? partnership.properties[0]?.initialValuation ?? 0,
  );
  const ownerships = await ownershipAsOf(partnership, occupant.id, new Date(8.64e15));

  const result = projectBuyoutTimeline({
    startMonth,
    monthlyTotalPaid: input.monthlyTotalPaid,
    agreedRent,
    propertyValuation: valuation,
    ownerships,
    monthlyTax:
      taxPolicy && taxPolicy.taxPerCycle > 0
        ? { mode: taxPolicy.mode, amount: taxPolicy.taxPerCycle / taxPolicy.taxCycleMonths }
        : null,
    maxMonths: input.maxMonths,
  });

  return {
    inputs: {
      startMonth: startMonth.toISOString().slice(0, 10),
      agreedRent,
      valuation,
      monthlyTotalPaid: input.monthlyTotalPaid,
      taxPolicy,
    },
    ownerships,
    result,
  };
}
