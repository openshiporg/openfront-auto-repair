-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "feePolicy" TEXT,
ADD COLUMN     "jurisdictionPack" TEXT,
ADD COLUMN     "jurisdictionPolicy" TEXT,
ADD COLUMN     "laborMatrix" TEXT,
ADD COLUMN     "laborRateClassSet" TEXT,
ADD COLUMN     "partsMatrix" TEXT,
ADD COLUMN     "shopPolicy" TEXT,
ADD COLUMN     "taxRuleSet" TEXT,
ADD COLUMN     "warrantyTermSet" TEXT;

-- CreateTable
CREATE TABLE "FeePolicyVersion" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT NOT NULL DEFAULT '',
    "basedOnId" TEXT NOT NULL DEFAULT '',
    "author" TEXT,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeePolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeRule" (
    "id" TEXT NOT NULL,
    "policy" TEXT,
    "code" TEXT NOT NULL DEFAULT 'haz_waste',
    "kind" TEXT NOT NULL DEFAULT 'flat_per_ro',
    "base" TEXT NOT NULL DEFAULT 'labor_and_parts',
    "percent" DECIMAL(12,6),
    "flatMinor" BIGINT,
    "perUnitMinor" BIGINT,
    "minMinor" BIGINT,
    "maxMinor" BIGINT,
    "itemCategory" TEXT NOT NULL DEFAULT '',
    "taxTreatment" TEXT NOT NULL DEFAULT 'follow_base',
    "separatelyStated" BOOLEAN NOT NULL DEFAULT true,
    "refundable" BOOLEAN NOT NULL DEFAULT false,
    "refundWindowDays" INTEGER,
    "invoiceText" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JurisdictionPack" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'US',
    "region" TEXT NOT NULL DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "sourceRefs" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JurisdictionPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JurisdictionPolicyVersion" (
    "id" TEXT NOT NULL,
    "pack" TEXT,
    "estimateThresholdMinor" BIGINT,
    "writtenEstimateWaiverAllowed" BOOLEAN NOT NULL DEFAULT false,
    "waiverFormText" TEXT NOT NULL DEFAULT '',
    "allowedAuthorizationMethods" JSONB DEFAULT '[]',
    "authorizationEvidenceRules" JSONB DEFAULT '{}',
    "toleranceRule" JSONB DEFAULT '{"kind":"fixed","fixedMinor":"0","includesTax":true}',
    "requireOdometerIn" BOOLEAN NOT NULL DEFAULT true,
    "requireOdometerOut" BOOLEAN NOT NULL DEFAULT true,
    "requireSignedWorkOrder" BOOLEAN NOT NULL DEFAULT true,
    "requirePartCondition" BOOLEAN NOT NULL DEFAULT true,
    "crashPartOemDefault" BOOLEAN NOT NULL DEFAULT true,
    "shopSuppliesGenericAllowed" BOOLEAN NOT NULL DEFAULT false,
    "replacedPartsOfferRequired" BOOLEAN NOT NULL DEFAULT true,
    "replacedPartsOfferText" TEXT NOT NULL DEFAULT '',
    "nonReturnableNoteText" TEXT NOT NULL DEFAULT '',
    "teardownRules" JSONB DEFAULT '{"required":true,"maxReassemblyDaysDefault":3,"disclosureText":""}',
    "designeeRules" JSONB DEFAULT '{}',
    "thirdPartyPayorNoticeText" TEXT NOT NULL DEFAULT '',
    "towingSeparateAuthorization" BOOLEAN NOT NULL DEFAULT true,
    "subletDisclosureRequired" BOOLEAN NOT NULL DEFAULT true,
    "invoiceRequiredFields" JSONB DEFAULT '[]',
    "recordRetentionYears" INTEGER NOT NULL DEFAULT 4,
    "surchargeAllowed" BOOLEAN NOT NULL DEFAULT false,
    "requiredNotices" JSONB DEFAULT '[]',
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT NOT NULL DEFAULT '',
    "basedOnId" TEXT NOT NULL DEFAULT '',
    "author" TEXT,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JurisdictionPolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborMatrixVersion" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "bands" JSONB DEFAULT '[]',
    "appliesToClasses" JSONB DEFAULT '[]',
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT NOT NULL DEFAULT '',
    "basedOnId" TEXT NOT NULL DEFAULT '',
    "author" TEXT,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaborMatrixVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborRateClass" (
    "id" TEXT NOT NULL,
    "set" TEXT,
    "code" TEXT NOT NULL DEFAULT 'general',
    "name" TEXT NOT NULL DEFAULT '',
    "rateMinor" BIGINT NOT NULL,
    "taxCategory" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaborRateClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborRateClassSetVersion" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT NOT NULL DEFAULT '',
    "basedOnId" TEXT NOT NULL DEFAULT '',
    "author" TEXT,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaborRateClassSetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartsMatrixVersion" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "tiers" JSONB DEFAULT '[]',
    "categoryOverrides" JSONB DEFAULT '{}',
    "supplierOverrides" JSONB DEFAULT '{}',
    "marginFloorPct" DECIMAL(12,6) NOT NULL DEFAULT 0.300000,
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT NOT NULL DEFAULT '',
    "basedOnId" TEXT NOT NULL DEFAULT '',
    "author" TEXT,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartsMatrixVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopPolicyVersion" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "flagHoursAt" TEXT NOT NULL DEFAULT 'job_completed',
    "comebackPayRule" TEXT NOT NULL DEFAULT 'reverse',
    "allowConcurrentJobClocks" BOOLEAN NOT NULL DEFAULT false,
    "requireQualityCheck" BOOLEAN NOT NULL DEFAULT true,
    "diagnosisTrustThreshold" DECIMAL(5,4) NOT NULL DEFAULT 0.7000,
    "authorizationLinkTtlHours" INTEGER NOT NULL DEFAULT 72,
    "promisedTimeRequired" BOOLEAN NOT NULL DEFAULT true,
    "noShowGraceMinutes" INTEGER NOT NULL DEFAULT 30,
    "discountLimitPctByRole" JSONB DEFAULT '{"seed_role_advisor":"0.10"}',
    "refundApprovalMinor" BIGINT NOT NULL DEFAULT 0,
    "creditMemoApprovalMinor" BIGINT NOT NULL DEFAULT 5000,
    "agentOrderLimitMinor" BIGINT NOT NULL DEFAULT 0,
    "agentAutonomy" JSONB DEFAULT '{}',
    "proposalConfirmGranularity" TEXT NOT NULL DEFAULT 'per_step',
    "declinedSafetyFollowUpPurpose" TEXT NOT NULL DEFAULT 'marketing',
    "followUpCadenceDays" JSONB DEFAULT '[3,30,90]',
    "depositPolicy" JSONB DEFAULT '{}',
    "surchargePolicy" JSONB DEFAULT '{"enabled":false}',
    "inspectionClockMode" TEXT NOT NULL DEFAULT 'job',
    "markupFactorDefault" DECIMAL(12,6) NOT NULL DEFAULT 1.000000,
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT NOT NULL DEFAULT '',
    "basedOnId" TEXT NOT NULL DEFAULT '',
    "author" TEXT,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopPolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "ruleSet" TEXT,
    "category" TEXT,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "rate" DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
    "coreChargeRule" TEXT NOT NULL DEFAULT 'refund_refunds_tax',
    "warrantyDeductibleRule" TEXT NOT NULL DEFAULT 'none',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRuleSetVersion" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "rounding" TEXT NOT NULL DEFAULT 'per_line',
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT NOT NULL DEFAULT '',
    "basedOnId" TEXT NOT NULL DEFAULT '',
    "author" TEXT,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRuleSetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyTerm" (
    "id" TEXT NOT NULL,
    "termSet" TEXT,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "months" INTEGER NOT NULL,
    "miles" INTEGER NOT NULL,
    "appliesTo" JSONB DEFAULT '[]',
    "invoiceText" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyTermSetVersion" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT NOT NULL DEFAULT '',
    "basedOnId" TEXT NOT NULL DEFAULT '',
    "author" TEXT,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyTermSetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "accountNumber" TEXT NOT NULL DEFAULT '',
    "termsDays" INTEGER NOT NULL DEFAULT 0,
    "creditLimitMinor" BIGINT NOT NULL DEFAULT 0,
    "poRequired" BOOLEAN NOT NULL DEFAULT false,
    "taxExempt" BOOLEAN NOT NULL DEFAULT false,
    "billingMode" TEXT NOT NULL DEFAULT 'per_invoice',
    "holdAfterOverdueDays" INTEGER DEFAULT 30,
    "openBalanceMinor" BIGINT NOT NULL DEFAULT 0,
    "intermediary" TEXT NOT NULL DEFAULT 'none',
    "intermediaryName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactConsent" (
    "id" TEXT NOT NULL,
    "contact" TEXT,
    "channel" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "evidence" JSONB,
    "writtenConsent" BOOLEAN NOT NULL DEFAULT false,
    "recordedBy" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'person',
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "companyName" TEXT NOT NULL DEFAULT '',
    "displayName" TEXT NOT NULL DEFAULT '',
    "addresses" JSONB DEFAULT '[]',
    "preferredChannel" TEXT NOT NULL DEFAULT 'sms',
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "homeShop" TEXT,
    "businessAccount" TEXT,
    "tags" JSONB DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "marketingSource" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "mergedInto" TEXT,
    "noShowCount" INTEGER DEFAULT 0,
    "portalUser" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL,
    "customer" TEXT,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "valueHash" TEXT NOT NULL DEFAULT '',
    "label" TEXT NOT NULL DEFAULT '',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerMergeEvent" (
    "id" TEXT NOT NULL,
    "survivor" TEXT,
    "merged" TEXT,
    "movedCounts" JSONB,
    "reason" TEXT NOT NULL DEFAULT '',
    "requestedBy" TEXT,
    "approvedBy" TEXT,
    "at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerMergeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalReference" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT '',
    "entityId" TEXT NOT NULL DEFAULT '',
    "system" TEXT NOT NULL,
    "externalId" TEXT NOT NULL DEFAULT '',
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OdometerReading" (
    "id" TEXT NOT NULL,
    "vehicle" TEXT,
    "value" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "checkIn" TEXT,
    "recordedBy" TEXT,
    "at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "accepted" BOOLEAN NOT NULL DEFAULT true,
    "anomaly" TEXT NOT NULL,
    "overrideReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "OdometerReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlateRegistration" (
    "id" TEXT NOT NULL,
    "vehicle" TEXT,
    "plate" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "firstSeenAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlateRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecallCheck" (
    "id" TEXT NOT NULL,
    "vehicle" TEXT,
    "source" TEXT NOT NULL,
    "query" JSONB,
    "campaigns" JSONB,
    "campaignCount" INTEGER DEFAULT 0,
    "parkItAny" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "checkedBy" TEXT,

    CONSTRAINT "RecallCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "vin" TEXT NOT NULL DEFAULT '',
    "vinValid" TEXT NOT NULL,
    "noVinReason" TEXT NOT NULL DEFAULT '',
    "year" INTEGER,
    "make" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "trim" TEXT NOT NULL DEFAULT '',
    "engine" TEXT NOT NULL DEFAULT '',
    "drivetrain" TEXT NOT NULL DEFAULT '',
    "transmission" TEXT NOT NULL DEFAULT '',
    "fuelType" TEXT NOT NULL DEFAULT '',
    "bodyClass" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '',
    "currentDecode" TEXT,
    "lastOdometer" INTEGER,
    "lastOdometerUnit" TEXT NOT NULL DEFAULT 'mi',
    "tireSpec" JSONB DEFAULT '{}',
    "maintenanceIntervals" JSONB DEFAULT '{}',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleDecode" (
    "id" TEXT NOT NULL,
    "vehicle" TEXT,
    "provider" TEXT NOT NULL,
    "requestedVin" TEXT NOT NULL DEFAULT '',
    "decoded" JSONB,
    "errorCode" TEXT NOT NULL DEFAULT '',
    "errorText" TEXT NOT NULL DEFAULT '',
    "fetchedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "fetchedBy" TEXT,

    CONSTRAINT "VehicleDecode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleOwnership" (
    "id" TEXT NOT NULL,
    "vehicle" TEXT,
    "customer" TEXT,
    "businessAccount" TEXT,
    "role" TEXT NOT NULL,
    "startedAt" DATE,
    "endedAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleOwnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "customer" TEXT,
    "vehicle" TEXT,
    "lead" JSONB,
    "date" DATE,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "kind" TEXT NOT NULL,
    "requestedServices" JSONB DEFAULT '[]',
    "concernText" TEXT NOT NULL DEFAULT '',
    "estimatedCentiHours" INTEGER NOT NULL DEFAULT 0,
    "bay" TEXT,
    "assignedTech" TEXT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "checkIn" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingHold" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "date" DATE,
    "slotStart" TIMESTAMP(3),
    "kind" TEXT NOT NULL,
    "bayCentiHours" INTEGER DEFAULT 0,
    "tokenHash" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'held',
    "appointment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingRule" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'max_dropoffs_per_day',
    "value" JSONB,
    "appliesToDays" JSONB DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "customer" TEXT,
    "vehicle" TEXT,
    "odometerIn" TEXT,
    "concerns" JSONB DEFAULT '[]',
    "keyTag" TEXT NOT NULL DEFAULT '',
    "waiter" BOOLEAN NOT NULL DEFAULT false,
    "promisedAt" TIMESTAMP(3),
    "contactPreference" TEXT NOT NULL,
    "transportationNeed" TEXT NOT NULL,
    "signatureMethod" TEXT NOT NULL,
    "signerName" TEXT NOT NULL DEFAULT '',
    "signature" JSONB,
    "signatureHash" TEXT NOT NULL DEFAULT '',
    "workOrderText" TEXT NOT NULL DEFAULT '',
    "workOrderHash" TEXT NOT NULL DEFAULT '',
    "signedAt" TIMESTAMP(3),
    "valuablesNote" TEXT NOT NULL DEFAULT '',
    "recallWarning" JSONB,
    "jurisdictionPolicyVersion" TEXT,
    "at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "by" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeePolicyVersion_shop_idx" ON "FeePolicyVersion"("shop");

-- CreateIndex
CREATE INDEX "FeePolicyVersion_author_idx" ON "FeePolicyVersion"("author");

-- CreateIndex
CREATE INDEX "FeePolicyVersion_publishedBy_idx" ON "FeePolicyVersion"("publishedBy");

-- CreateIndex
CREATE UNIQUE INDEX "FeePolicyVersion_shop_number_key" ON "FeePolicyVersion"("shop", "versionNumber");

-- CreateIndex
CREATE INDEX "FeeRule_policy_idx" ON "FeeRule"("policy");

-- CreateIndex
CREATE UNIQUE INDEX "JurisdictionPack_code_key" ON "JurisdictionPack"("code");

-- CreateIndex
CREATE INDEX "JurisdictionPolicyVersion_pack_idx" ON "JurisdictionPolicyVersion"("pack");

-- CreateIndex
CREATE INDEX "JurisdictionPolicyVersion_author_idx" ON "JurisdictionPolicyVersion"("author");

-- CreateIndex
CREATE INDEX "JurisdictionPolicyVersion_publishedBy_idx" ON "JurisdictionPolicyVersion"("publishedBy");

-- CreateIndex
CREATE UNIQUE INDEX "JurisdictionPolicyVersion_pack_number_key" ON "JurisdictionPolicyVersion"("pack", "versionNumber");

-- CreateIndex
CREATE INDEX "LaborMatrixVersion_shop_idx" ON "LaborMatrixVersion"("shop");

-- CreateIndex
CREATE INDEX "LaborMatrixVersion_author_idx" ON "LaborMatrixVersion"("author");

-- CreateIndex
CREATE INDEX "LaborMatrixVersion_publishedBy_idx" ON "LaborMatrixVersion"("publishedBy");

-- CreateIndex
CREATE UNIQUE INDEX "LaborMatrixVersion_shop_number_key" ON "LaborMatrixVersion"("shop", "versionNumber");

-- CreateIndex
CREATE INDEX "LaborRateClass_set_idx" ON "LaborRateClass"("set");

-- CreateIndex
CREATE INDEX "LaborRateClass_taxCategory_idx" ON "LaborRateClass"("taxCategory");

-- CreateIndex
CREATE UNIQUE INDEX "LaborRateClass_set_code_key" ON "LaborRateClass"("set", "code");

-- CreateIndex
CREATE INDEX "LaborRateClassSetVersion_shop_idx" ON "LaborRateClassSetVersion"("shop");

-- CreateIndex
CREATE INDEX "LaborRateClassSetVersion_author_idx" ON "LaborRateClassSetVersion"("author");

-- CreateIndex
CREATE INDEX "LaborRateClassSetVersion_publishedBy_idx" ON "LaborRateClassSetVersion"("publishedBy");

-- CreateIndex
CREATE UNIQUE INDEX "LaborRateClassSetVersion_shop_number_key" ON "LaborRateClassSetVersion"("shop", "versionNumber");

-- CreateIndex
CREATE INDEX "PartsMatrixVersion_shop_idx" ON "PartsMatrixVersion"("shop");

-- CreateIndex
CREATE INDEX "PartsMatrixVersion_author_idx" ON "PartsMatrixVersion"("author");

-- CreateIndex
CREATE INDEX "PartsMatrixVersion_publishedBy_idx" ON "PartsMatrixVersion"("publishedBy");

-- CreateIndex
CREATE UNIQUE INDEX "PartsMatrixVersion_shop_number_key" ON "PartsMatrixVersion"("shop", "versionNumber");

-- CreateIndex
CREATE INDEX "ShopPolicyVersion_shop_idx" ON "ShopPolicyVersion"("shop");

-- CreateIndex
CREATE INDEX "ShopPolicyVersion_author_idx" ON "ShopPolicyVersion"("author");

-- CreateIndex
CREATE INDEX "ShopPolicyVersion_publishedBy_idx" ON "ShopPolicyVersion"("publishedBy");

-- CreateIndex
CREATE UNIQUE INDEX "ShopPolicyVersion_shop_number_key" ON "ShopPolicyVersion"("shop", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TaxCategory_code_key" ON "TaxCategory"("code");

-- CreateIndex
CREATE INDEX "TaxRule_ruleSet_idx" ON "TaxRule"("ruleSet");

-- CreateIndex
CREATE INDEX "TaxRule_category_idx" ON "TaxRule"("category");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRule_set_category_key" ON "TaxRule"("ruleSet", "category");

-- CreateIndex
CREATE INDEX "TaxRuleSetVersion_shop_idx" ON "TaxRuleSetVersion"("shop");

-- CreateIndex
CREATE INDEX "TaxRuleSetVersion_author_idx" ON "TaxRuleSetVersion"("author");

-- CreateIndex
CREATE INDEX "TaxRuleSetVersion_publishedBy_idx" ON "TaxRuleSetVersion"("publishedBy");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRuleSetVersion_shop_number_key" ON "TaxRuleSetVersion"("shop", "versionNumber");

-- CreateIndex
CREATE INDEX "WarrantyTerm_termSet_idx" ON "WarrantyTerm"("termSet");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyTerm_set_code_key" ON "WarrantyTerm"("termSet", "code");

-- CreateIndex
CREATE INDEX "WarrantyTermSetVersion_shop_idx" ON "WarrantyTermSetVersion"("shop");

-- CreateIndex
CREATE INDEX "WarrantyTermSetVersion_author_idx" ON "WarrantyTermSetVersion"("author");

-- CreateIndex
CREATE INDEX "WarrantyTermSetVersion_publishedBy_idx" ON "WarrantyTermSetVersion"("publishedBy");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyTermSetVersion_shop_number_key" ON "WarrantyTermSetVersion"("shop", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessAccount_accountNumber_key" ON "BusinessAccount"("accountNumber");

-- CreateIndex
CREATE INDEX "ContactConsent_contact_idx" ON "ContactConsent"("contact");

-- CreateIndex
CREATE INDEX "ContactConsent_recordedBy_idx" ON "ContactConsent"("recordedBy");

-- CreateIndex
CREATE INDEX "ContactConsent_latest_idx" ON "ContactConsent"("contact", "channel", "purpose", "at");

-- CreateIndex
CREATE INDEX "Customer_lastName_idx" ON "Customer"("lastName");

-- CreateIndex
CREATE INDEX "Customer_displayName_idx" ON "Customer"("displayName");

-- CreateIndex
CREATE INDEX "Customer_homeShop_idx" ON "Customer"("homeShop");

-- CreateIndex
CREATE INDEX "Customer_businessAccount_idx" ON "Customer"("businessAccount");

-- CreateIndex
CREATE INDEX "Customer_mergedInto_idx" ON "Customer"("mergedInto");

-- CreateIndex
CREATE INDEX "Customer_portalUser_idx" ON "Customer"("portalUser");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "CustomerContact_customer_idx" ON "CustomerContact"("customer");

-- CreateIndex
CREATE INDEX "CustomerContact_valueHash_idx" ON "CustomerContact"("valueHash");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerContact_customer_kind_hash_key" ON "CustomerContact"("customer", "kind", "valueHash");

-- CreateIndex
CREATE INDEX "CustomerMergeEvent_survivor_idx" ON "CustomerMergeEvent"("survivor");

-- CreateIndex
CREATE INDEX "CustomerMergeEvent_merged_idx" ON "CustomerMergeEvent"("merged");

-- CreateIndex
CREATE INDEX "CustomerMergeEvent_requestedBy_idx" ON "CustomerMergeEvent"("requestedBy");

-- CreateIndex
CREATE INDEX "CustomerMergeEvent_approvedBy_idx" ON "CustomerMergeEvent"("approvedBy");

-- CreateIndex
CREATE INDEX "ExternalReference_entityId_idx" ON "ExternalReference"("entityId");

-- CreateIndex
CREATE INDEX "ExternalReference_entity_idx" ON "ExternalReference"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalReference_system_entity_external_key" ON "ExternalReference"("system", "entityType", "externalId");

-- CreateIndex
CREATE INDEX "OdometerReading_vehicle_idx" ON "OdometerReading"("vehicle");

-- CreateIndex
CREATE INDEX "OdometerReading_checkIn_idx" ON "OdometerReading"("checkIn");

-- CreateIndex
CREATE INDEX "OdometerReading_recordedBy_idx" ON "OdometerReading"("recordedBy");

-- CreateIndex
CREATE INDEX "OdometerReading_vehicle_at_idx" ON "OdometerReading"("vehicle", "at");

-- CreateIndex
CREATE INDEX "PlateRegistration_vehicle_idx" ON "PlateRegistration"("vehicle");

-- CreateIndex
CREATE INDEX "PlateRegistration_state_plate_idx" ON "PlateRegistration"("state", "plate");

-- CreateIndex
CREATE INDEX "RecallCheck_vehicle_idx" ON "RecallCheck"("vehicle");

-- CreateIndex
CREATE INDEX "RecallCheck_checkedBy_idx" ON "RecallCheck"("checkedBy");

-- CreateIndex
CREATE INDEX "RecallCheck_vehicle_at_idx" ON "RecallCheck"("vehicle", "checkedAt");

-- CreateIndex
CREATE INDEX "Vehicle_vin_idx" ON "Vehicle"("vin");

-- CreateIndex
CREATE INDEX "Vehicle_currentDecode_idx" ON "Vehicle"("currentDecode");

-- CreateIndex
CREATE INDEX "VehicleDecode_vehicle_idx" ON "VehicleDecode"("vehicle");

-- CreateIndex
CREATE INDEX "VehicleDecode_requestedVin_idx" ON "VehicleDecode"("requestedVin");

-- CreateIndex
CREATE INDEX "VehicleDecode_fetchedBy_idx" ON "VehicleDecode"("fetchedBy");

-- CreateIndex
CREATE INDEX "VehicleOwnership_vehicle_idx" ON "VehicleOwnership"("vehicle");

-- CreateIndex
CREATE INDEX "VehicleOwnership_customer_idx" ON "VehicleOwnership"("customer");

-- CreateIndex
CREATE INDEX "VehicleOwnership_businessAccount_idx" ON "VehicleOwnership"("businessAccount");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_reference_key" ON "Appointment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_checkIn_key" ON "Appointment"("checkIn");

-- CreateIndex
CREATE INDEX "Appointment_shop_idx" ON "Appointment"("shop");

-- CreateIndex
CREATE INDEX "Appointment_customer_idx" ON "Appointment"("customer");

-- CreateIndex
CREATE INDEX "Appointment_vehicle_idx" ON "Appointment"("vehicle");

-- CreateIndex
CREATE INDEX "Appointment_bay_idx" ON "Appointment"("bay");

-- CreateIndex
CREATE INDEX "Appointment_assignedTech_idx" ON "Appointment"("assignedTech");

-- CreateIndex
CREATE INDEX "Appointment_shop_starts_idx" ON "Appointment"("shop", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_shop_date_status_idx" ON "Appointment"("shop", "date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BookingHold_tokenHash_key" ON "BookingHold"("tokenHash");

-- CreateIndex
CREATE INDEX "BookingHold_shop_idx" ON "BookingHold"("shop");

-- CreateIndex
CREATE INDEX "BookingHold_appointment_idx" ON "BookingHold"("appointment");

-- CreateIndex
CREATE INDEX "BookingHold_shop_date_status_idx" ON "BookingHold"("shop", "date", "status");

-- CreateIndex
CREATE INDEX "BookingRule_shop_idx" ON "BookingRule"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_reference_key" ON "CheckIn"("reference");

-- CreateIndex
CREATE INDEX "CheckIn_shop_idx" ON "CheckIn"("shop");

-- CreateIndex
CREATE INDEX "CheckIn_customer_idx" ON "CheckIn"("customer");

-- CreateIndex
CREATE INDEX "CheckIn_vehicle_idx" ON "CheckIn"("vehicle");

-- CreateIndex
CREATE INDEX "CheckIn_odometerIn_idx" ON "CheckIn"("odometerIn");

-- CreateIndex
CREATE INDEX "CheckIn_jurisdictionPolicyVersion_idx" ON "CheckIn"("jurisdictionPolicyVersion");

-- CreateIndex
CREATE INDEX "CheckIn_by_idx" ON "CheckIn"("by");

-- CreateIndex
CREATE INDEX "Shop_jurisdictionPack_idx" ON "Shop"("jurisdictionPack");

-- CreateIndex
CREATE INDEX "Shop_jurisdictionPolicy_idx" ON "Shop"("jurisdictionPolicy");

-- CreateIndex
CREATE INDEX "Shop_shopPolicy_idx" ON "Shop"("shopPolicy");

-- CreateIndex
CREATE INDEX "Shop_laborRateClassSet_idx" ON "Shop"("laborRateClassSet");

-- CreateIndex
CREATE INDEX "Shop_laborMatrix_idx" ON "Shop"("laborMatrix");

-- CreateIndex
CREATE INDEX "Shop_partsMatrix_idx" ON "Shop"("partsMatrix");

-- CreateIndex
CREATE INDEX "Shop_feePolicy_idx" ON "Shop"("feePolicy");

-- CreateIndex
CREATE INDEX "Shop_taxRuleSet_idx" ON "Shop"("taxRuleSet");

-- CreateIndex
CREATE INDEX "Shop_warrantyTermSet_idx" ON "Shop"("warrantyTermSet");

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_jurisdictionPack_fkey" FOREIGN KEY ("jurisdictionPack") REFERENCES "JurisdictionPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_jurisdictionPolicy_fkey" FOREIGN KEY ("jurisdictionPolicy") REFERENCES "JurisdictionPolicyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_shopPolicy_fkey" FOREIGN KEY ("shopPolicy") REFERENCES "ShopPolicyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_laborRateClassSet_fkey" FOREIGN KEY ("laborRateClassSet") REFERENCES "LaborRateClassSetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_laborMatrix_fkey" FOREIGN KEY ("laborMatrix") REFERENCES "LaborMatrixVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_partsMatrix_fkey" FOREIGN KEY ("partsMatrix") REFERENCES "PartsMatrixVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_feePolicy_fkey" FOREIGN KEY ("feePolicy") REFERENCES "FeePolicyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_taxRuleSet_fkey" FOREIGN KEY ("taxRuleSet") REFERENCES "TaxRuleSetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_warrantyTermSet_fkey" FOREIGN KEY ("warrantyTermSet") REFERENCES "WarrantyTermSetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePolicyVersion" ADD CONSTRAINT "FeePolicyVersion_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePolicyVersion" ADD CONSTRAINT "FeePolicyVersion_author_fkey" FOREIGN KEY ("author") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePolicyVersion" ADD CONSTRAINT "FeePolicyVersion_publishedBy_fkey" FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeRule" ADD CONSTRAINT "FeeRule_policy_fkey" FOREIGN KEY ("policy") REFERENCES "FeePolicyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JurisdictionPolicyVersion" ADD CONSTRAINT "JurisdictionPolicyVersion_pack_fkey" FOREIGN KEY ("pack") REFERENCES "JurisdictionPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JurisdictionPolicyVersion" ADD CONSTRAINT "JurisdictionPolicyVersion_author_fkey" FOREIGN KEY ("author") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JurisdictionPolicyVersion" ADD CONSTRAINT "JurisdictionPolicyVersion_publishedBy_fkey" FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborMatrixVersion" ADD CONSTRAINT "LaborMatrixVersion_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborMatrixVersion" ADD CONSTRAINT "LaborMatrixVersion_author_fkey" FOREIGN KEY ("author") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborMatrixVersion" ADD CONSTRAINT "LaborMatrixVersion_publishedBy_fkey" FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborRateClass" ADD CONSTRAINT "LaborRateClass_set_fkey" FOREIGN KEY ("set") REFERENCES "LaborRateClassSetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborRateClass" ADD CONSTRAINT "LaborRateClass_taxCategory_fkey" FOREIGN KEY ("taxCategory") REFERENCES "TaxCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborRateClassSetVersion" ADD CONSTRAINT "LaborRateClassSetVersion_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborRateClassSetVersion" ADD CONSTRAINT "LaborRateClassSetVersion_author_fkey" FOREIGN KEY ("author") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborRateClassSetVersion" ADD CONSTRAINT "LaborRateClassSetVersion_publishedBy_fkey" FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartsMatrixVersion" ADD CONSTRAINT "PartsMatrixVersion_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartsMatrixVersion" ADD CONSTRAINT "PartsMatrixVersion_author_fkey" FOREIGN KEY ("author") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartsMatrixVersion" ADD CONSTRAINT "PartsMatrixVersion_publishedBy_fkey" FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopPolicyVersion" ADD CONSTRAINT "ShopPolicyVersion_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopPolicyVersion" ADD CONSTRAINT "ShopPolicyVersion_author_fkey" FOREIGN KEY ("author") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopPolicyVersion" ADD CONSTRAINT "ShopPolicyVersion_publishedBy_fkey" FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_ruleSet_fkey" FOREIGN KEY ("ruleSet") REFERENCES "TaxRuleSetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_category_fkey" FOREIGN KEY ("category") REFERENCES "TaxCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRuleSetVersion" ADD CONSTRAINT "TaxRuleSetVersion_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRuleSetVersion" ADD CONSTRAINT "TaxRuleSetVersion_author_fkey" FOREIGN KEY ("author") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRuleSetVersion" ADD CONSTRAINT "TaxRuleSetVersion_publishedBy_fkey" FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyTerm" ADD CONSTRAINT "WarrantyTerm_termSet_fkey" FOREIGN KEY ("termSet") REFERENCES "WarrantyTermSetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyTermSetVersion" ADD CONSTRAINT "WarrantyTermSetVersion_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyTermSetVersion" ADD CONSTRAINT "WarrantyTermSetVersion_author_fkey" FOREIGN KEY ("author") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyTermSetVersion" ADD CONSTRAINT "WarrantyTermSetVersion_publishedBy_fkey" FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactConsent" ADD CONSTRAINT "ContactConsent_contact_fkey" FOREIGN KEY ("contact") REFERENCES "CustomerContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactConsent" ADD CONSTRAINT "ContactConsent_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_homeShop_fkey" FOREIGN KEY ("homeShop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessAccount_fkey" FOREIGN KEY ("businessAccount") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_mergedInto_fkey" FOREIGN KEY ("mergedInto") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_portalUser_fkey" FOREIGN KEY ("portalUser") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMergeEvent" ADD CONSTRAINT "CustomerMergeEvent_survivor_fkey" FOREIGN KEY ("survivor") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMergeEvent" ADD CONSTRAINT "CustomerMergeEvent_merged_fkey" FOREIGN KEY ("merged") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMergeEvent" ADD CONSTRAINT "CustomerMergeEvent_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMergeEvent" ADD CONSTRAINT "CustomerMergeEvent_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OdometerReading" ADD CONSTRAINT "OdometerReading_vehicle_fkey" FOREIGN KEY ("vehicle") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OdometerReading" ADD CONSTRAINT "OdometerReading_checkIn_fkey" FOREIGN KEY ("checkIn") REFERENCES "CheckIn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OdometerReading" ADD CONSTRAINT "OdometerReading_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlateRegistration" ADD CONSTRAINT "PlateRegistration_vehicle_fkey" FOREIGN KEY ("vehicle") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallCheck" ADD CONSTRAINT "RecallCheck_vehicle_fkey" FOREIGN KEY ("vehicle") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallCheck" ADD CONSTRAINT "RecallCheck_checkedBy_fkey" FOREIGN KEY ("checkedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_currentDecode_fkey" FOREIGN KEY ("currentDecode") REFERENCES "VehicleDecode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDecode" ADD CONSTRAINT "VehicleDecode_vehicle_fkey" FOREIGN KEY ("vehicle") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDecode" ADD CONSTRAINT "VehicleDecode_fetchedBy_fkey" FOREIGN KEY ("fetchedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleOwnership" ADD CONSTRAINT "VehicleOwnership_vehicle_fkey" FOREIGN KEY ("vehicle") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleOwnership" ADD CONSTRAINT "VehicleOwnership_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleOwnership" ADD CONSTRAINT "VehicleOwnership_businessAccount_fkey" FOREIGN KEY ("businessAccount") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_vehicle_fkey" FOREIGN KEY ("vehicle") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_bay_fkey" FOREIGN KEY ("bay") REFERENCES "Bay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_assignedTech_fkey" FOREIGN KEY ("assignedTech") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_checkIn_fkey" FOREIGN KEY ("checkIn") REFERENCES "CheckIn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingHold" ADD CONSTRAINT "BookingHold_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingHold" ADD CONSTRAINT "BookingHold_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRule" ADD CONSTRAINT "BookingRule_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_vehicle_fkey" FOREIGN KEY ("vehicle") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_odometerIn_fkey" FOREIGN KEY ("odometerIn") REFERENCES "OdometerReading"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_jurisdictionPolicyVersion_fkey" FOREIGN KEY ("jurisdictionPolicyVersion") REFERENCES "JurisdictionPolicyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_by_fkey" FOREIGN KEY ("by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Phase 1 guards (SCHEMA §2, §3, §20) ───────────────────────────────────────────────

-- Published policy is law: it never changes. A published version may only be retired (status,
-- retiredAt and version change; nothing else). Retired versions never change. Only drafts are deleted.
CREATE OR REPLACE FUNCTION deny_published_policy_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  bookkeeping text[] := ARRAY['status', 'retiredAt', 'version', 'updatedAt'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION '% % is % and cannot be deleted', TG_TABLE_NAME, OLD.id, OLD.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'retired' THEN
    RAISE EXCEPTION '% % is retired and cannot change', TG_TABLE_NAME, OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'published' THEN
    IF NEW.status NOT IN ('published', 'retired') OR (to_jsonb(NEW) - bookkeeping) IS DISTINCT FROM (to_jsonb(OLD) - bookkeeping) THEN
      RAISE EXCEPTION '% % is published and cannot change; make a new draft', TG_TABLE_NAME, OLD.id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION '% % must be published before it is retired', TG_TABLE_NAME, OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- The rows of a version (fee rules, tax rules, rate classes, warranty terms) change only while it is a draft.
-- TG_ARGV[0] = parent table, TG_ARGV[1] = foreign-key column.
CREATE OR REPLACE FUNCTION deny_published_policy_child_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status text;
  parent_id text;
BEGIN
  FOREACH parent_id IN ARRAY ARRAY[
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ->> TG_ARGV[1] END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ->> TG_ARGV[1] END
  ] LOOP
    IF parent_id IS NOT NULL THEN
      EXECUTE format('SELECT status FROM %I WHERE id = $1', TG_ARGV[0]) INTO parent_status USING parent_id;
      IF parent_status IS DISTINCT FROM 'draft' AND parent_status IS NOT NULL THEN
        RAISE EXCEPTION '% belongs to a % version and cannot change; make a new draft', TG_TABLE_NAME, parent_status USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['JurisdictionPolicyVersion', 'ShopPolicyVersion', 'LaborRateClassSetVersion', 'LaborMatrixVersion', 'PartsMatrixVersion', 'FeePolicyVersion', 'TaxRuleSetVersion', 'WarrantyTermSetVersion'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION deny_published_policy_change()', t || '_immutable_published', t);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (status IN (''draft'', ''published'', ''retired''))', t, t || '_status_check');
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK ("versionNumber" > 0 AND version >= 0)', t, t || '_numbers_check');
  END LOOP;
END $$;

CREATE TRIGGER "LaborRateClass_draft_only" BEFORE INSERT OR UPDATE OR DELETE ON "LaborRateClass" FOR EACH ROW EXECUTE FUNCTION deny_published_policy_child_change('LaborRateClassSetVersion', 'set');
CREATE TRIGGER "FeeRule_draft_only" BEFORE INSERT OR UPDATE OR DELETE ON "FeeRule" FOR EACH ROW EXECUTE FUNCTION deny_published_policy_child_change('FeePolicyVersion', 'policy');
CREATE TRIGGER "TaxRule_draft_only" BEFORE INSERT OR UPDATE OR DELETE ON "TaxRule" FOR EACH ROW EXECUTE FUNCTION deny_published_policy_child_change('TaxRuleSetVersion', 'ruleSet');
CREATE TRIGGER "WarrantyTerm_draft_only" BEFORE INSERT OR UPDATE OR DELETE ON "WarrantyTerm" FOR EACH ROW EXECUTE FUNCTION deny_published_policy_child_change('WarrantyTermSetVersion', 'termSet');

-- One open draft and one published version per head.
CREATE UNIQUE INDEX "JurisdictionPolicyVersion_one_draft" ON "JurisdictionPolicyVersion" (pack) WHERE status = 'draft';
CREATE UNIQUE INDEX "JurisdictionPolicyVersion_one_published" ON "JurisdictionPolicyVersion" (pack) WHERE status = 'published';
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ShopPolicyVersion', 'LaborRateClassSetVersion', 'LaborMatrixVersion', 'PartsMatrixVersion', 'FeePolicyVersion', 'TaxRuleSetVersion', 'WarrantyTermSetVersion'] LOOP
    EXECUTE format('CREATE UNIQUE INDEX %I ON %I (shop) WHERE status = ''draft''', t || '_one_draft', t);
    EXECUTE format('CREATE UNIQUE INDEX %I ON %I (shop) WHERE status = ''published''', t || '_one_published', t);
  END LOOP;
END $$;

ALTER TABLE "LaborRateClass" ADD CONSTRAINT "LaborRateClass_rate_positive" CHECK ("rateMinor" > 0);
CREATE UNIQUE INDEX "LaborRateClass_one_default" ON "LaborRateClass" ("set") WHERE "isDefault";
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_rate_range" CHECK (rate >= 0 AND rate < 1 AND (taxable OR rate = 0));
ALTER TABLE "FeeRule" ADD CONSTRAINT "FeeRule_amounts_nonnegative" CHECK (("percent" IS NULL OR ("percent" >= 0 AND "percent" <= 1)) AND ("flatMinor" IS NULL OR "flatMinor" >= 0) AND ("perUnitMinor" IS NULL OR "perUnitMinor" >= 0));
ALTER TABLE "ShopPolicyVersion" ADD CONSTRAINT "ShopPolicyVersion_trust_threshold" CHECK ("diagnosisTrustThreshold" >= 0 AND "diagnosisTrustThreshold" <= 1);
ALTER TABLE "ShopPolicyVersion" ADD CONSTRAINT "ShopPolicyVersion_agent_limit" CHECK ("agentOrderLimitMinor" >= 0 AND "noShowGraceMinutes" >= 0);

-- Immutable history for customers and vehicles: consent, merges, decodes, odometer readings, recall checks.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ContactConsent', 'CustomerMergeEvent', 'VehicleDecode', 'OdometerReading', 'RecallCheck'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION deny_update_delete()', t || '_append_only', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION deny_update_delete()', t || '_no_truncate', t);
  END LOOP;
END $$;

-- Consent is never granted by an agent or a classifier; marketing texts and calls need written consent (47 CFR 64.1200).
ALTER TABLE "ContactConsent" ADD CONSTRAINT "ContactConsent_marketing_written" CHECK (NOT (action = 'granted' AND purpose IN ('marketing', 'all') AND channel IN ('sms', 'voice') AND NOT "writtenConsent"));
ALTER TABLE "ContactConsent" ADD CONSTRAINT "ContactConsent_classifier_revoke_only" CHECK (NOT (method = 'classifier_review' AND action = 'granted'));
CREATE TRIGGER "ContactConsent_no_agent" BEFORE INSERT ON "ContactConsent" FOR EACH ROW WHEN (NEW.action = 'granted') EXECUTE FUNCTION deny_agent_authorization();

-- Vehicles: a VIN is 17 characters without I, O or Q; one active vehicle per VIN.
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_vin_format" CHECK (vin = '' OR vin ~ '^[A-HJ-NPR-Z0-9]{17}$');
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_vin_or_reason" CHECK (vin <> '' OR "noVinReason" <> '' OR status <> 'active');
CREATE UNIQUE INDEX "Vehicle_active_vin_key" ON "Vehicle" (vin) WHERE status = 'active' AND vin <> '';
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_numbers" CHECK (("lastOdometer" IS NULL OR "lastOdometer" >= 0) AND version >= 0);
ALTER TABLE "OdometerReading" ADD CONSTRAINT "OdometerReading_value_nonnegative" CHECK (value >= 0);
ALTER TABLE "OdometerReading" ADD CONSTRAINT "OdometerReading_regression_reason" CHECK (anomaly <> 'lower_than_previous' OR "overrideReason" <> '');
CREATE UNIQUE INDEX "VehicleOwnership_one_current_owner" ON "VehicleOwnership" (vehicle) WHERE role = 'owner' AND "endedAt" IS NULL;
CREATE INDEX "Vehicle_last_digits_idx" ON "Vehicle" (right(vin, 8)) WHERE vin <> '';

-- Customers and accounts.
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_numbers" CHECK ("noShowCount" >= 0 AND version >= 0);
ALTER TABLE "BusinessAccount" ADD CONSTRAINT "BusinessAccount_terms" CHECK ("termsDays" BETWEEN 0 AND 120 AND "creditLimitMinor" >= 0);
CREATE UNIQUE INDEX "CustomerContact_one_primary" ON "CustomerContact" (customer, (kind = 'email')) WHERE "isPrimary" AND status = 'active';

-- Scheduling.
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_times" CHECK ("endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" > "startsAt");
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_status_check" CHECK (status IN ('requested', 'confirmed', 'arrived', 'no_show', 'cancelled'));
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_who" CHECK (customer IS NOT NULL OR lead IS NOT NULL);
ALTER TABLE "BookingHold" ADD CONSTRAINT "BookingHold_status_check" CHECK (status IN ('held', 'consumed', 'expired', 'released'));
ALTER TABLE "BookingHold" ADD CONSTRAINT "BookingHold_consumed_has_appointment" CHECK (status <> 'consumed' OR appointment IS NOT NULL);
CREATE INDEX "BookingHold_live_idx" ON "BookingHold" (shop, date) WHERE status = 'held';
CREATE INDEX "Appointment_due_no_show_idx" ON "Appointment" ("startsAt") WHERE status IN ('requested', 'confirmed');
