import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/session";
import { requirePartnershipAccess } from "@/lib/auth/authorization";
import { errorResponse } from "@/lib/http";
import { projectPartnership } from "@/lib/projections/partnership-projection";

export async function GET(request: Request) {
  try {
    const sessionUser = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const partnershipId = searchParams.get("partnershipId");
    if (!partnershipId) throw new Error("partnershipId is required.");
    await requirePartnershipAccess(partnershipId, sessionUser);

    const { inputs, ownerships, result } = await projectPartnership({
      partnershipId,
      monthlyTotalPaid: Number(searchParams.get("monthlyTotalPaid")),
    });

    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    const pdfBufferPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    doc.fontSize(18).text("Buyout Projection");
    doc.moveDown(0.6);
    doc.fontSize(11);
    doc.text(`Start month: ${inputs.startMonth.slice(0, 7)}`);
    doc.text(`Monthly payment: $${inputs.monthlyTotalPaid.toFixed(2)}`);
    doc.text(`Agreed rent: $${inputs.agreedRent.toFixed(2)}`);
    doc.text(`Valuation: $${inputs.valuation.toFixed(2)}`);
    if (inputs.taxPolicy) {
      doc.text(
        `Tax: $${inputs.taxPolicy.taxPerCycle.toFixed(2)} per ${inputs.taxPolicy.taxCycleMonths} months (${inputs.taxPolicy.mode === "RESERVE" ? "reserve" : "out of pocket"})`,
      );
    }
    doc.moveDown(0.8);
    doc.text(`Buyout month: ${result.buyoutMonth?.slice(0, 7) ?? "Not reached"}`);
    doc.text(`Months: ${result.monthsSimulated}`);
    doc.text(`Total investor dividends: $${result.totalInvestorDividends.toFixed(2)}`);
    doc.text(`Total equity purchased: $${result.totalOwnershipPurchase.toFixed(2)}`);
    doc.moveDown(1);

    doc.fontSize(12).text("First 24 months", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10);
    for (const month of result.history.slice(0, 24)) {
      const shares = ownerships
        .map((position) => `${position.displayLabel} ${(month.ownershipPctAfter[position.membershipId] ?? 0).toFixed(4)}%`)
        .join(" | ");
      doc.text(
        `${month.month.slice(0, 7)} | Dividends $${month.investorDividends.toFixed(2)} | Equity $${month.ownershipPurchase.toFixed(2)} | ${shares}`,
      );
    }

    doc.end();
    const pdfBuffer = await pdfBufferPromise;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=projection-${partnershipId}.pdf`,
      },
    });
  } catch (error) {
    return errorResponse(error, "Failed to export projection PDF.");
  }
}
