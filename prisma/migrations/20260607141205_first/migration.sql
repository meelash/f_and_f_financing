-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PARTNER');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OCCUPANT', 'INVESTOR', 'PARTNER');

-- CreateEnum
CREATE TYPE "ApprovalMode" AS ENUM ('NO_APPROVAL', 'REQUIRE_COUNTERPARTY');

-- CreateEnum
CREATE TYPE "MonthlyPaymentStatus" AS ENUM ('PENDING', 'POSTED', 'DISPUTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ExpenseTreatment" AS ENUM ('AMORTIZE_OFFSET', 'VALUATION_DILUTION');

-- CreateEnum
CREATE TYPE "ContributionKind" AS ENUM ('PURCHASE', 'CLOSING_COST', 'ROOF', 'APPLIANCES', 'REPAIR', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditableEntity" AS ENUM ('PARTNERSHIP', 'PROPERTY', 'MEMBERSHIP', 'CONTRIBUTION', 'MONTHLY_POLICY', 'TAX_PAYMENT', 'MONTHLY_PAYMENT', 'PAYMENT_ALLOCATION', 'HOME_EXPENSE', 'OWNERSHIP_SNAPSHOT', 'ATTACHMENT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AttachmentEntity" AS ENUM ('MONTHLY_PAYMENT', 'TAX_PAYMENT', 'HOME_EXPENSE', 'CONTRIBUTION', 'AUDIT_LOG');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'PARTNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partnership" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "approvalMode" "ApprovalMode" NOT NULL DEFAULT 'NO_APPROVAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" UUID NOT NULL,
    "partnershipId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "stateProvince" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "acquiredOn" TIMESTAMP(3),
    "initialValuation" DECIMAL(14,2),
    "currentValuation" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerMembership" (
    "id" UUID NOT NULL,
    "partnershipId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'PARTNER',
    "displayLabel" TEXT NOT NULL,
    "initialOwnershipPct" DECIMAL(7,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitalContribution" (
    "id" UUID NOT NULL,
    "partnershipId" UUID NOT NULL,
    "propertyId" UUID,
    "membershipId" UUID,
    "kind" "ContributionKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapitalContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyPolicy" (
    "id" UUID NOT NULL,
    "partnershipId" UUID NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "agreedRent" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxPayment" (
    "id" UUID NOT NULL,
    "partnershipId" UUID NOT NULL,
    "paidByUserId" UUID,
    "paidByMembershipId" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "coverageMonths" INTEGER NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "reimbursementStart" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyPayment" (
    "id" UUID NOT NULL,
    "partnershipId" UUID NOT NULL,
    "fromUserId" UUID,
    "toUserId" UUID,
    "fromMembershipId" UUID,
    "toMembershipId" UUID,
    "paymentMonth" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalPaid" DECIMAL(14,2) NOT NULL,
    "agreedRentApplied" DECIMAL(14,2) NOT NULL,
    "taxReimbursement" DECIMAL(14,2) NOT NULL,
    "netRentForSplit" DECIMAL(14,2) NOT NULL,
    "rentDistributionTotal" DECIMAL(14,2) NOT NULL,
    "ownershipPurchase" DECIMAL(14,2) NOT NULL,
    "status" "MonthlyPaymentStatus" NOT NULL DEFAULT 'POSTED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyPaymentAllocation" (
    "id" UUID NOT NULL,
    "partnershipId" UUID NOT NULL,
    "monthlyPaymentId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "ownershipPctBefore" DECIMAL(7,4) NOT NULL,
    "rentAmount" DECIMAL(14,2) NOT NULL,
    "purchaseAmount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeExpense" (
    "id" UUID NOT NULL,
    "partnershipId" UUID NOT NULL,
    "propertyId" UUID,
    "paidByUserId" UUID,
    "paidByMembershipId" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "incurredOn" TIMESTAMP(3) NOT NULL,
    "treatment" "ExpenseTreatment" NOT NULL,
    "amortizationMonths" INTEGER,
    "offsetStartMonth" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnershipSnapshot" (
    "id" UUID NOT NULL,
    "partnershipId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "ownershipPct" DECIMAL(7,4) NOT NULL,
    "equityValue" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnershipSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "partnershipId" UUID NOT NULL,
    "uploadedById" UUID,
    "entityType" "AttachmentEntity" NOT NULL,
    "entityId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "partnershipId" UUID NOT NULL,
    "actorId" UUID,
    "entityType" "AuditableEntity" NOT NULL,
    "entityId" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Property_partnershipId_idx" ON "Property"("partnershipId");

-- CreateIndex
CREATE INDEX "PartnerMembership_partnershipId_idx" ON "PartnerMembership"("partnershipId");

-- CreateIndex
CREATE INDEX "PartnerMembership_userId_idx" ON "PartnerMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerMembership_partnershipId_userId_key" ON "PartnerMembership"("partnershipId", "userId");

-- CreateIndex
CREATE INDEX "CapitalContribution_partnershipId_effectiveDate_idx" ON "CapitalContribution"("partnershipId", "effectiveDate");

-- CreateIndex
CREATE INDEX "CapitalContribution_membershipId_idx" ON "CapitalContribution"("membershipId");

-- CreateIndex
CREATE INDEX "CapitalContribution_propertyId_idx" ON "CapitalContribution"("propertyId");

-- CreateIndex
CREATE INDEX "MonthlyPolicy_partnershipId_effectiveFrom_idx" ON "MonthlyPolicy"("partnershipId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "TaxPayment_partnershipId_paidOn_idx" ON "TaxPayment"("partnershipId", "paidOn");

-- CreateIndex
CREATE INDEX "TaxPayment_paidByMembershipId_idx" ON "TaxPayment"("paidByMembershipId");

-- CreateIndex
CREATE INDEX "MonthlyPayment_partnershipId_paymentMonth_idx" ON "MonthlyPayment"("partnershipId", "paymentMonth");

-- CreateIndex
CREATE INDEX "MonthlyPayment_fromMembershipId_idx" ON "MonthlyPayment"("fromMembershipId");

-- CreateIndex
CREATE INDEX "MonthlyPayment_toMembershipId_idx" ON "MonthlyPayment"("toMembershipId");

-- CreateIndex
CREATE INDEX "MonthlyPaymentAllocation_partnershipId_idx" ON "MonthlyPaymentAllocation"("partnershipId");

-- CreateIndex
CREATE INDEX "MonthlyPaymentAllocation_monthlyPaymentId_idx" ON "MonthlyPaymentAllocation"("monthlyPaymentId");

-- CreateIndex
CREATE INDEX "MonthlyPaymentAllocation_membershipId_idx" ON "MonthlyPaymentAllocation"("membershipId");

-- CreateIndex
CREATE INDEX "HomeExpense_partnershipId_incurredOn_idx" ON "HomeExpense"("partnershipId", "incurredOn");

-- CreateIndex
CREATE INDEX "HomeExpense_paidByMembershipId_idx" ON "HomeExpense"("paidByMembershipId");

-- CreateIndex
CREATE INDEX "OwnershipSnapshot_partnershipId_asOf_idx" ON "OwnershipSnapshot"("partnershipId", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "OwnershipSnapshot_partnershipId_membershipId_asOf_key" ON "OwnershipSnapshot"("partnershipId", "membershipId", "asOf");

-- CreateIndex
CREATE INDEX "Attachment_partnershipId_uploadedAt_idx" ON "Attachment"("partnershipId", "uploadedAt");

-- CreateIndex
CREATE INDEX "Attachment_entityType_entityId_idx" ON "Attachment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_partnershipId_createdAt_idx" ON "AuditLog"("partnershipId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerMembership" ADD CONSTRAINT "PartnerMembership_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerMembership" ADD CONSTRAINT "PartnerMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitalContribution" ADD CONSTRAINT "CapitalContribution_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitalContribution" ADD CONSTRAINT "CapitalContribution_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitalContribution" ADD CONSTRAINT "CapitalContribution_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "PartnerMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPolicy" ADD CONSTRAINT "MonthlyPolicy_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxPayment" ADD CONSTRAINT "TaxPayment_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxPayment" ADD CONSTRAINT "TaxPayment_paidByUserId_fkey" FOREIGN KEY ("paidByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxPayment" ADD CONSTRAINT "TaxPayment_paidByMembershipId_fkey" FOREIGN KEY ("paidByMembershipId") REFERENCES "PartnerMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPayment" ADD CONSTRAINT "MonthlyPayment_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPayment" ADD CONSTRAINT "MonthlyPayment_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPayment" ADD CONSTRAINT "MonthlyPayment_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPayment" ADD CONSTRAINT "MonthlyPayment_fromMembershipId_fkey" FOREIGN KEY ("fromMembershipId") REFERENCES "PartnerMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPayment" ADD CONSTRAINT "MonthlyPayment_toMembershipId_fkey" FOREIGN KEY ("toMembershipId") REFERENCES "PartnerMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPaymentAllocation" ADD CONSTRAINT "MonthlyPaymentAllocation_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPaymentAllocation" ADD CONSTRAINT "MonthlyPaymentAllocation_monthlyPaymentId_fkey" FOREIGN KEY ("monthlyPaymentId") REFERENCES "MonthlyPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPaymentAllocation" ADD CONSTRAINT "MonthlyPaymentAllocation_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "PartnerMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeExpense" ADD CONSTRAINT "HomeExpense_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeExpense" ADD CONSTRAINT "HomeExpense_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeExpense" ADD CONSTRAINT "HomeExpense_paidByUserId_fkey" FOREIGN KEY ("paidByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeExpense" ADD CONSTRAINT "HomeExpense_paidByMembershipId_fkey" FOREIGN KEY ("paidByMembershipId") REFERENCES "PartnerMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipSnapshot" ADD CONSTRAINT "OwnershipSnapshot_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipSnapshot" ADD CONSTRAINT "OwnershipSnapshot_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "PartnerMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "Partnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
