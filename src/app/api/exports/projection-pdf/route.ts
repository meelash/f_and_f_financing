import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import { NextResponse } from "next/server";
import { getPartnershipMonthlyData } from "@/lib/accounting/monthly-payment-data";
import { projectBuyoutTimeline } from "@/lib/projections/buyout";
import { requireSessionUser } from "@/lib/auth/session";
import { requireMembershipInPartnership } from "@/lib/auth/authorization";

export async function GET(request: Request) {
  try {
    const sessionUser = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const partnershipId = searchParams.get("partnershipId");
    const occupantMembershipId = searchParams.get("occupantMembershipId");
    const startMonth = searchParams.get("startMonth");
    const monthlyTotalPaidRaw = searchParams.get("monthlyTotalPaid");

    if (!partnershipId || !occupantMembershipId || !startMonth || !monthlyTotalPaidRaw) {
      return NextResponse.json(
        {
          error:
            "partnershipId, occupantMembershipId, startMonth, and monthlyTotalPaid are required query parameters.",
        },
        { status: 400 },
      );
    }

    await requireMembershipInPartnership(partnershipId, occupantMembershipId, sessionUser);

    const monthlyTotalPaid = Number(monthlyTotalPaidRaw);
    if (Number.isNaN(monthlyTotalPaid) || monthlyTotalPaid <= 0) {
      return NextResponse.json({ error: "monthlyTotalPaid must be a positive number." }, { status: 400 });
    }

    const monthDate = new Date(startMonth);
    if (Number.isNaN(monthDate.getTime())) {
      return NextResponse.json({ error: "startMonth must be a valid date string." }, { status: 400 });
    }

    const data = await getPartnershipMonthlyData({
      partnershipId,
      occupantMembershipId,
      paymentMonth: new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1)),
    });

    const projection = projectBuyoutTimeline({
      startMonth: monthDate,
      monthlyTotalPaid,
      agreedRent: data.agreedRent,
      propertyValuation: data.valuation,
      occupantMembershipId,
      ownerships: data.ownerships,
      taxSchedules: data.taxSchedules,
    });

    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];

    const pdfBufferPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    doc.fontSize(18).text("Friends & Family Projection Summary");
    doc.moveDown(0.6);
    doc.fontSize(11).text(`Partnership ID: ${partnershipId}`);
    doc.text(`Start Month: ${new Date(startMonth).toISOString().slice(0, 10)}`);
    doc.text(`Monthly Total Paid: $${monthlyTotalPaid.toFixed(2)}`);
    doc.text(`Agreed Rent: $${data.agreedRent.toFixed(2)}`);
    doc.text(`Valuation: $${data.valuation.toFixed(2)}`);
    doc.moveDown(0.8);

    doc.text(
      `Projected Buyout Month: ${projection.buyoutMonth ?? "Not reached within simulation horizon"}`,
    );
    doc.text(`Months Simulated: ${projection.monthsSimulated}`);
    doc.text(`Total Partner Dividend/Rent: $${projection.totalPartnerDividendRent.toFixed(2)}`);
    doc.text(`Total Ownership Purchase: $${projection.totalOwnershipPurchase.toFixed(2)}`);
    doc.moveDown(1);

    doc.fontSize(12).text("First 24 Months", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10);

    for (const month of projection.history.slice(0, 24)) {
      doc.text(
        `${month.month} | Purchase $${month.ownershipPurchase.toFixed(2)} | Partner Rent $${month.partnerRent.toFixed(2)} | Partner ${month.partnerOwnershipPct.toFixed(4)}% | Occupant ${month.occupantOwnershipPct.toFixed(4)}%`,
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
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Access denied for this partnership." }, { status: 403 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to export projection PDF.",
      },
      { status: 400 },
    );
  }
}
