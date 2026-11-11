/*
  Warnings:

  - A unique constraint covering the columns `[reference]` on the table `Statement` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[businessAccount,periodStart]` on the table `Statement` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Authorization" ADD COLUMN     "fleetApprover" TEXT;

-- AlterTable
ALTER TABLE "BusinessAccount" ADD COLUMN     "holdReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "holdSince" TIMESTAMP(3),
ADD COLUMN     "holdWaivedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "exemptionCertificate" TEXT;

-- AlterTable
ALTER TABLE "RepairOrder" ADD COLUMN     "fleetUnit" TEXT;

-- AlterTable
ALTER TABLE "Statement" ADD COLUMN     "aging" JSONB,
ADD COLUMN     "exportedAt" TIMESTAMP(3),
ADD COLUMN     "exportedBy" TEXT,
ADD COLUMN     "reference" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "BusinessAccountContact" (
    "id" TEXT NOT NULL,
    "businessAccount" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "roles" JSONB DEFAULT '[]',
    "portalUser" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessAccountContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExemptionCertificate" (
    "id" TEXT NOT NULL,
    "businessAccount" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'government',
    "number" TEXT NOT NULL DEFAULT '',
    "issuingState" TEXT NOT NULL DEFAULT '',
    "effectiveFrom" DATE,
    "expiresAt" DATE,
    "document" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExemptionCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetApprover" (
    "id" TEXT NOT NULL,
    "businessAccount" TEXT,
    "contact" TEXT,
    "limitMinor" BIGINT NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FleetApprover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetUnit" (
    "id" TEXT NOT NULL,
    "businessAccount" TEXT,
    "vehicle" TEXT,
    "unitNumber" TEXT NOT NULL DEFAULT '',
    "driverName" TEXT NOT NULL DEFAULT '',
    "costCenter" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FleetUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessAccountContact_businessAccount_idx" ON "BusinessAccountContact"("businessAccount");

-- CreateIndex
CREATE INDEX "BusinessAccountContact_portalUser_idx" ON "BusinessAccountContact"("portalUser");

-- CreateIndex
CREATE INDEX "ExemptionCertificate_businessAccount_idx" ON "ExemptionCertificate"("businessAccount");

-- CreateIndex
CREATE INDEX "ExemptionCertificate_document_idx" ON "ExemptionCertificate"("document");

-- CreateIndex
CREATE INDEX "FleetApprover_businessAccount_idx" ON "FleetApprover"("businessAccount");

-- CreateIndex
CREATE INDEX "FleetApprover_contact_idx" ON "FleetApprover"("contact");

-- CreateIndex
CREATE INDEX "FleetUnit_businessAccount_idx" ON "FleetUnit"("businessAccount");

-- CreateIndex
CREATE INDEX "FleetUnit_vehicle_idx" ON "FleetUnit"("vehicle");

-- CreateIndex
CREATE UNIQUE INDEX "FleetUnit_account_unit_key" ON "FleetUnit"("businessAccount", "unitNumber");

-- CreateIndex
CREATE INDEX "Authorization_fleetApprover_idx" ON "Authorization"("fleetApprover");

-- CreateIndex
CREATE INDEX "Invoice_exemptionCertificate_idx" ON "Invoice"("exemptionCertificate");

-- CreateIndex
CREATE INDEX "RepairOrder_fleetUnit_idx" ON "RepairOrder"("fleetUnit");

-- CreateIndex
CREATE UNIQUE INDEX "Statement_reference_key" ON "Statement"("reference");

-- CreateIndex
CREATE INDEX "Statement_exportedBy_idx" ON "Statement"("exportedBy");

-- CreateIndex
CREATE UNIQUE INDEX "Statement_account_period_key" ON "Statement"("businessAccount", "periodStart");

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_fleetUnit_fkey" FOREIGN KEY ("fleetUnit") REFERENCES "FleetUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authorization" ADD CONSTRAINT "Authorization_fleetApprover_fkey" FOREIGN KEY ("fleetApprover") REFERENCES "FleetApprover"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_exemptionCertificate_fkey" FOREIGN KEY ("exemptionCertificate") REFERENCES "ExemptionCertificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_exportedBy_fkey" FOREIGN KEY ("exportedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessAccountContact" ADD CONSTRAINT "BusinessAccountContact_businessAccount_fkey" FOREIGN KEY ("businessAccount") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessAccountContact" ADD CONSTRAINT "BusinessAccountContact_portalUser_fkey" FOREIGN KEY ("portalUser") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExemptionCertificate" ADD CONSTRAINT "ExemptionCertificate_businessAccount_fkey" FOREIGN KEY ("businessAccount") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExemptionCertificate" ADD CONSTRAINT "ExemptionCertificate_document_fkey" FOREIGN KEY ("document") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetApprover" ADD CONSTRAINT "FleetApprover_businessAccount_fkey" FOREIGN KEY ("businessAccount") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetApprover" ADD CONSTRAINT "FleetApprover_contact_fkey" FOREIGN KEY ("contact") REFERENCES "BusinessAccountContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetUnit" ADD CONSTRAINT "FleetUnit_businessAccount_fkey" FOREIGN KEY ("businessAccount") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetUnit" ADD CONSTRAINT "FleetUnit_vehicle_fkey" FOREIGN KEY ("vehicle") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Phase 6 guards (SCHEMA §3.5 to §3.8, STATE-MACHINES §15) ──────────────────────────

ALTER TABLE "FleetApprover" ADD CONSTRAINT "FleetApprover_limit_check" CHECK ("limitMinor" >= 0 AND "order" >= 1);
ALTER TABLE "ExemptionCertificate" ADD CONSTRAINT "ExemptionCertificate_status_check" CHECK (status IN ('active', 'expired', 'revoked'));
ALTER TABLE "ExemptionCertificate" ADD CONSTRAINT "ExemptionCertificate_dates_check" CHECK ("expiresAt" IS NULL OR "effectiveFrom" IS NULL OR "expiresAt" >= "effectiveFrom");
ALTER TABLE "BusinessAccount" ADD CONSTRAINT "BusinessAccount_status_check" CHECK (status IN ('prospect', 'active', 'credit_hold', 'on_hold', 'closed'));
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_period_check" CHECK ("periodEnd" >= "periodStart" AND "closingMinor" = "openingMinor" + "chargesMinor" - "paymentsMinor" - "creditsMinor");
-- One approver position per account; an inactive approver keeps its history.
CREATE UNIQUE INDEX "FleetApprover_account_order_unique" ON "FleetApprover" ("businessAccount", "order") WHERE active;
-- A statement is a record of what was owed: only the export stamp may change, and it is never deleted.
CREATE TRIGGER "Statement_immutable" BEFORE UPDATE OR DELETE ON "Statement" FOR EACH ROW
  EXECUTE FUNCTION deny_financial_change('exportedAt', 'exportedBy', 'sentAt', 'updatedAt');
CREATE TRIGGER "ExemptionCertificate_no_delete" BEFORE DELETE ON "ExemptionCertificate" FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
