import {
  computeMonthlyPaymentPreview,
  type MonthlyPaymentPreview,
} from "@/lib/accounting/monthly-payment";
import { getPartnershipMonthlyData } from "@/lib/accounting/monthly-payment-data";

export type MonthlyPaymentPreviewRequest = {
  partnershipId: string;
  occupantMembershipId: string;
  paymentMonth: string;
  totalPaid: number;
  agreedRent?: number;
  propertyValuation?: number;
};

export async function buildMonthlyPaymentPreviewForPartnership(
  input: MonthlyPaymentPreviewRequest,
): Promise<MonthlyPaymentPreview> {
  const paymentMonth = parseMonthInput(input.paymentMonth);
  const data = await getPartnershipMonthlyData({
    partnershipId: input.partnershipId,
    occupantMembershipId: input.occupantMembershipId,
    paymentMonth,
    agreedRentOverride: input.agreedRent,
    valuationOverride: input.propertyValuation,
  });

  return computeMonthlyPaymentPreview({
    paymentMonth,
    totalPaid: input.totalPaid,
    agreedRent: data.agreedRent,
    propertyValuation: data.valuation,
    occupantMembershipId: input.occupantMembershipId,
    ownerships: data.ownerships,
    taxSchedules: data.taxSchedules,
    expenseSchedules: data.expenseSchedules,
  });
}

function parseMonthInput(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("paymentMonth must be a valid ISO date string.");
  }

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
}
