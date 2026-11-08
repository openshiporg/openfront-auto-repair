/*
  Warnings:

  - A unique constraint covering the columns `[repairOrder]` on the table `CheckIn` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "CheckIn" ADD COLUMN     "repairOrder" TEXT;

-- CreateTable
CREATE TABLE "CollisionClaimRef" (
    "id" TEXT NOT NULL,
    "repairOrder" TEXT,
    "insurer" TEXT NOT NULL DEFAULT '',
    "claimNumber" TEXT NOT NULL DEFAULT '',
    "adjuster" JSONB,
    "drpProgram" TEXT NOT NULL DEFAULT '',
    "externalEstimateSystem" TEXT NOT NULL DEFAULT 'other',
    "externalEstimateRef" TEXT NOT NULL DEFAULT '',
    "thirdPartyEstimate" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollisionClaimRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Concern" (
    "id" TEXT NOT NULL,
    "repairOrder" TEXT,
    "customerWords" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'other',
    "diagnosis" TEXT NOT NULL DEFAULT '',
    "cause" TEXT NOT NULL DEFAULT '',
    "correction" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Concern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "repairOrder" TEXT,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "customerDescription" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'repair',
    "concern" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "cannedJobVersion" TEXT,
    "inspectionItemResult" TEXT,
    "urgency" TEXT NOT NULL DEFAULT 'none',
    "warrantyTerm" TEXT,
    "contentHash" TEXT NOT NULL DEFAULT '',
    "priceSnapshot" JSONB,
    "subtotalMinor" BIGINT NOT NULL DEFAULT 0,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL DEFAULT 0,
    "laborMinor" BIGINT NOT NULL DEFAULT 0,
    "partsMinor" BIGINT NOT NULL DEFAULT 0,
    "feesMinor" BIGINT NOT NULL DEFAULT 0,
    "costMinor" BIGINT NOT NULL DEFAULT 0,
    "marginMinor" BIGINT NOT NULL DEFAULT 0,
    "offeredInVersion" TEXT,
    "authorizedAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "authorizedSubtotalMinor" BIGINT NOT NULL DEFAULT 0,
    "authorizedContentHash" TEXT NOT NULL DEFAULT '',
    "authorizedIdentityHash" TEXT NOT NULL DEFAULT '',
    "chargeCeilingMinor" BIGINT NOT NULL DEFAULT 0,
    "currentAuthorization" TEXT,
    "belowThresholdRecordedAt" TIMESTAMP(3),
    "noChargeReason" TEXT NOT NULL DEFAULT '',
    "teardownDisclosure" TEXT,
    "reauthorizationReason" TEXT NOT NULL DEFAULT '',
    "workStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLine" (
    "id" TEXT NOT NULL,
    "job" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'labor',
    "description" TEXT NOT NULL DEFAULT '',
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "rateClass" TEXT,
    "soldCentiHours" INTEGER NOT NULL DEFAULT 0,
    "guideCentiHours" INTEGER NOT NULL DEFAULT 0,
    "overlapCentiHours" INTEGER NOT NULL DEFAULT 0,
    "guideSnapshot" JSONB,
    "rateMinor" BIGINT NOT NULL DEFAULT 0,
    "partNumber" TEXT NOT NULL DEFAULT '',
    "brand" TEXT NOT NULL DEFAULT '',
    "partCategory" TEXT NOT NULL DEFAULT '',
    "condition" TEXT,
    "quantityMilli" INTEGER NOT NULL DEFAULT 1000,
    "unitOfMeasure" TEXT NOT NULL DEFAULT '',
    "unitCostMinor" BIGINT NOT NULL DEFAULT 0,
    "unitPriceMinor" BIGINT NOT NULL DEFAULT 0,
    "matrixTierSnapshot" JSONB,
    "fulfilment" TEXT NOT NULL DEFAULT 'order_on_authorization',
    "isNewTire" BOOLEAN NOT NULL DEFAULT false,
    "tireSize" TEXT NOT NULL DEFAULT '',
    "subletVendorName" TEXT NOT NULL DEFAULT '',
    "subletCostMinor" BIGINT NOT NULL DEFAULT 0,
    "feeRule" TEXT,
    "feeCode" TEXT NOT NULL DEFAULT '',
    "taxCategory" TEXT,
    "taxCategoryCode" TEXT NOT NULL DEFAULT '',
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "taxRate" DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
    "extendedMinor" BIGINT NOT NULL DEFAULT 0,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "override" JSONB,
    "sortOrder" INTEGER DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTechShare" (
    "id" TEXT NOT NULL,
    "job" TEXT,
    "technician" TEXT,
    "sharePct" DECIMAL(12,6) NOT NULL DEFAULT 1.000000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobTechShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayerSplit" (
    "id" TEXT NOT NULL,
    "job" TEXT,
    "payerKind" TEXT NOT NULL DEFAULT 'customer',
    "businessAccount" TEXT,
    "payorName" TEXT NOT NULL DEFAULT '',
    "authorizationNumber" TEXT NOT NULL DEFAULT '',
    "claimNumber" TEXT NOT NULL DEFAULT '',
    "percent" DECIMAL(12,6) NOT NULL DEFAULT 1.000000,
    "fixedMinor" BIGINT,
    "deductibleMinor" BIGINT,
    "warrantyTaxTreatment" TEXT NOT NULL DEFAULT 'n_a',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayerSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityCheck" (
    "id" TEXT NOT NULL,
    "repairOrder" TEXT,
    "performedBy" TEXT,
    "roadTest" BOOLEAN NOT NULL DEFAULT false,
    "checklist" JSONB DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3),
    "result" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairOrder" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "roNumber" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'standard',
    "customer" TEXT,
    "businessAccount" TEXT,
    "vehicle" TEXT,
    "serviceAdvisor" TEXT,
    "appointment" TEXT,
    "odometerIn" TEXT,
    "odometerOut" TEXT,
    "jurisdictionPolicyVersion" TEXT,
    "shopPolicyVersion" TEXT,
    "laborRateClassSetVersion" TEXT,
    "laborMatrixVersion" TEXT,
    "partsMatrixVersion" TEXT,
    "feePolicyVersion" TEXT,
    "taxRuleSetVersion" TEXT,
    "warrantyTermSetVersion" TEXT,
    "replacedPartsElection" TEXT NOT NULL DEFAULT 'not_asked',
    "electedAt" TIMESTAMP(3),
    "designee" JSONB,
    "promisedAt" TIMESTAMP(3),
    "holdReason" TEXT NOT NULL DEFAULT 'none',
    "holdNote" TEXT NOT NULL DEFAULT '',
    "heldAt" TIMESTAMP(3),
    "waiter" BOOLEAN NOT NULL DEFAULT false,
    "keyTag" TEXT NOT NULL DEFAULT '',
    "authorizedTotalMinor" BIGINT NOT NULL DEFAULT 0,
    "currentTotalMinor" BIGINT NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "releasedBy" TEXT,
    "openedAt" TIMESTAMP(3),
    "openedBy" TEXT,
    "voidReason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffTask" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'authorization_callback',
    "title" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL DEFAULT '',
    "repairOrder" TEXT,
    "authorizationRequest" TEXT,
    "assignee" TEXT,
    "createdByUser" TEXT,
    "createdByAgent" TEXT,
    "source" TEXT NOT NULL DEFAULT 'staff',
    "evidence" JSONB,
    "dueAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "doneBy" TEXT,
    "outcome" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeardownDisclosure" (
    "id" TEXT NOT NULL,
    "teardownCostMinor" BIGINT NOT NULL DEFAULT 0,
    "reassemblyCostMinor" BIGINT NOT NULL DEFAULT 0,
    "areaDescription" TEXT NOT NULL DEFAULT '',
    "destroyedParts" JSONB DEFAULT '[]',
    "restorationWarning" BOOLEAN NOT NULL DEFAULT false,
    "maxReassemblyDays" INTEGER DEFAULT 3,
    "disclosureText" TEXT NOT NULL DEFAULT '',
    "disclosureTextVersion" TEXT NOT NULL DEFAULT '',
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeardownDisclosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CannedJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "currentVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CannedJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CannedJobVersion" (
    "id" TEXT NOT NULL,
    "cannedJob" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'repair',
    "lines" JSONB DEFAULT '[]',
    "customerDescription" TEXT NOT NULL DEFAULT '',
    "defaultWarrantyCode" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "author" TEXT,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CannedJobVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "repairOrder" TEXT,
    "templateVersion" TEXT,
    "technician" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionItemResult" (
    "id" TEXT NOT NULL,
    "inspection" TEXT,
    "templateItem" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'not_inspected',
    "derivedCondition" TEXT NOT NULL DEFAULT 'none',
    "overrideReason" TEXT NOT NULL DEFAULT '',
    "measurements" JSONB DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "recordedBy" TEXT,
    "recordedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionItemResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'multi_point',
    "shop" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionTemplateItem" (
    "id" TEXT NOT NULL,
    "templateVersion" TEXT,
    "code" TEXT NOT NULL DEFAULT '',
    "section" TEXT NOT NULL DEFAULT '',
    "label" TEXT NOT NULL DEFAULT '',
    "measurement" JSONB,
    "photoRequiredOn" JSONB DEFAULT '["red"]',
    "cannedJobCode" TEXT NOT NULL DEFAULT '',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionTemplateVersion" (
    "id" TEXT NOT NULL,
    "template" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborOperation" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "code" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "variant" TEXT NOT NULL DEFAULT '',
    "vehicleFilter" JSONB DEFAULT '{}',
    "centiHours" INTEGER NOT NULL,
    "skillLevel" TEXT NOT NULL DEFAULT 'b',
    "rateClassCode" TEXT NOT NULL DEFAULT 'general',
    "includes" JSONB DEFAULT '[]',
    "overlaps" JSONB DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'shop_time',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaborOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishedService" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "fromPriceMinor" BIGINT,
    "estimatedCentiHours" INTEGER,
    "bookable" BOOLEAN NOT NULL DEFAULT true,
    "cannedJob" TEXT,
    "sortOrder" INTEGER DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishedService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceMenuItem" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "fixedPriceMinor" BIGINT,
    "cannedJob" TEXT,
    "vehicleFilter" JSONB DEFAULT '{}',
    "publishable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Authorization" (
    "id" TEXT NOT NULL,
    "job" TEXT,
    "estimateVersion" TEXT,
    "jobContentHash" TEXT NOT NULL DEFAULT '',
    "amountMinor" BIGINT NOT NULL,
    "subtotalMinor" BIGINT NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL DEFAULT 'in_person_signature',
    "actorKind" TEXT NOT NULL DEFAULT 'customer',
    "actorName" TEXT NOT NULL DEFAULT '',
    "contactUsed" TEXT NOT NULL DEFAULT '',
    "evidence" JSONB,
    "authorizedAt" TIMESTAMP(3) NOT NULL,
    "recordedByUser" TEXT,
    "authorizationRequest" TEXT,
    "signature" TEXT,
    "consentTextVersion" TEXT NOT NULL DEFAULT '',
    "poNumber" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'recorded',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Authorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorizationRequest" (
    "id" TEXT NOT NULL,
    "repairOrder" TEXT,
    "estimateVersion" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'sms',
    "contact" TEXT,
    "contactLabel" TEXT NOT NULL DEFAULT '',
    "tokenHash" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "viewerEvidence" JSONB,
    "answer" JSONB,
    "consentTextVersion" TEXT NOT NULL DEFAULT '',
    "createdByUser" TEXT,
    "createdByAgent" TEXT,
    "depositRequestedMinor" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorizationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateVersion" (
    "id" TEXT NOT NULL,
    "repairOrder" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "snapshot" JSONB,
    "contentHash" TEXT NOT NULL DEFAULT '',
    "jobHashes" JSONB DEFAULT '{}',
    "includedJobIds" JSONB DEFAULT '[]',
    "disclosuresChecked" JSONB DEFAULT '[]',
    "subtotalMinor" BIGINT NOT NULL DEFAULT 0,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL DEFAULT 0,
    "document" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobDecision" (
    "id" TEXT NOT NULL,
    "job" TEXT,
    "estimateVersion" TEXT,
    "decision" TEXT NOT NULL DEFAULT 'declined',
    "actorName" TEXT NOT NULL DEFAULT '',
    "method" TEXT NOT NULL DEFAULT 'in_person_signature',
    "at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "deferUntil" TIMESTAMP(3),
    "deferMiles" INTEGER,
    "recordedByUser" TEXT,
    "authorizationRequest" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicAccessToken" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'authorization',
    "subjectType" TEXT NOT NULL DEFAULT '',
    "subjectId" TEXT NOT NULL DEFAULT '',
    "shop" TEXT,
    "tokenHash" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "useCount" INTEGER DEFAULT 0,
    "maxUses" INTEGER DEFAULT 50,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_InspectionItemResult_media" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CollisionClaimRef_repairOrder_key" ON "CollisionClaimRef"("repairOrder");

-- CreateIndex
CREATE INDEX "CollisionClaimRef_thirdPartyEstimate_idx" ON "CollisionClaimRef"("thirdPartyEstimate");

-- CreateIndex
CREATE INDEX "Concern_repairOrder_idx" ON "Concern"("repairOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Job_teardownDisclosure_key" ON "Job"("teardownDisclosure");

-- CreateIndex
CREATE INDEX "Job_repairOrder_idx" ON "Job"("repairOrder");

-- CreateIndex
CREATE INDEX "Job_concern_idx" ON "Job"("concern");

-- CreateIndex
CREATE INDEX "Job_cannedJobVersion_idx" ON "Job"("cannedJobVersion");

-- CreateIndex
CREATE INDEX "Job_inspectionItemResult_idx" ON "Job"("inspectionItemResult");

-- CreateIndex
CREATE INDEX "Job_warrantyTerm_idx" ON "Job"("warrantyTerm");

-- CreateIndex
CREATE INDEX "Job_offeredInVersion_idx" ON "Job"("offeredInVersion");

-- CreateIndex
CREATE INDEX "Job_currentAuthorization_idx" ON "Job"("currentAuthorization");

-- CreateIndex
CREATE UNIQUE INDEX "Job_ro_number_key" ON "Job"("repairOrder", "number");

-- CreateIndex
CREATE INDEX "JobLine_job_idx" ON "JobLine"("job");

-- CreateIndex
CREATE INDEX "JobLine_rateClass_idx" ON "JobLine"("rateClass");

-- CreateIndex
CREATE INDEX "JobLine_feeRule_idx" ON "JobLine"("feeRule");

-- CreateIndex
CREATE INDEX "JobLine_taxCategory_idx" ON "JobLine"("taxCategory");

-- CreateIndex
CREATE INDEX "JobTechShare_job_idx" ON "JobTechShare"("job");

-- CreateIndex
CREATE INDEX "JobTechShare_technician_idx" ON "JobTechShare"("technician");

-- CreateIndex
CREATE INDEX "PayerSplit_job_idx" ON "PayerSplit"("job");

-- CreateIndex
CREATE INDEX "PayerSplit_businessAccount_idx" ON "PayerSplit"("businessAccount");

-- CreateIndex
CREATE INDEX "QualityCheck_repairOrder_idx" ON "QualityCheck"("repairOrder");

-- CreateIndex
CREATE INDEX "QualityCheck_performedBy_idx" ON "QualityCheck"("performedBy");

-- CreateIndex
CREATE UNIQUE INDEX "RepairOrder_roNumber_key" ON "RepairOrder"("roNumber");

-- CreateIndex
CREATE INDEX "RepairOrder_shop_idx" ON "RepairOrder"("shop");

-- CreateIndex
CREATE INDEX "RepairOrder_customer_idx" ON "RepairOrder"("customer");

-- CreateIndex
CREATE INDEX "RepairOrder_businessAccount_idx" ON "RepairOrder"("businessAccount");

-- CreateIndex
CREATE INDEX "RepairOrder_vehicle_idx" ON "RepairOrder"("vehicle");

-- CreateIndex
CREATE INDEX "RepairOrder_serviceAdvisor_idx" ON "RepairOrder"("serviceAdvisor");

-- CreateIndex
CREATE INDEX "RepairOrder_appointment_idx" ON "RepairOrder"("appointment");

-- CreateIndex
CREATE INDEX "RepairOrder_odometerIn_idx" ON "RepairOrder"("odometerIn");

-- CreateIndex
CREATE INDEX "RepairOrder_odometerOut_idx" ON "RepairOrder"("odometerOut");

-- CreateIndex
CREATE INDEX "RepairOrder_jurisdictionPolicyVersion_idx" ON "RepairOrder"("jurisdictionPolicyVersion");

-- CreateIndex
CREATE INDEX "RepairOrder_shopPolicyVersion_idx" ON "RepairOrder"("shopPolicyVersion");

-- CreateIndex
CREATE INDEX "RepairOrder_laborRateClassSetVersion_idx" ON "RepairOrder"("laborRateClassSetVersion");

-- CreateIndex
CREATE INDEX "RepairOrder_laborMatrixVersion_idx" ON "RepairOrder"("laborMatrixVersion");

-- CreateIndex
CREATE INDEX "RepairOrder_partsMatrixVersion_idx" ON "RepairOrder"("partsMatrixVersion");

-- CreateIndex
CREATE INDEX "RepairOrder_feePolicyVersion_idx" ON "RepairOrder"("feePolicyVersion");

-- CreateIndex
CREATE INDEX "RepairOrder_taxRuleSetVersion_idx" ON "RepairOrder"("taxRuleSetVersion");

-- CreateIndex
CREATE INDEX "RepairOrder_warrantyTermSetVersion_idx" ON "RepairOrder"("warrantyTermSetVersion");

-- CreateIndex
CREATE INDEX "RepairOrder_releasedBy_idx" ON "RepairOrder"("releasedBy");

-- CreateIndex
CREATE INDEX "RepairOrder_openedBy_idx" ON "RepairOrder"("openedBy");

-- CreateIndex
CREATE INDEX "RepairOrder_shop_status_idx" ON "RepairOrder"("shop", "status");

-- CreateIndex
CREATE INDEX "RepairOrder_vehicle_created_idx" ON "RepairOrder"("vehicle", "createdAt");

-- CreateIndex
CREATE INDEX "RepairOrder_customer_created_idx" ON "RepairOrder"("customer", "createdAt");

-- CreateIndex
CREATE INDEX "StaffTask_shop_idx" ON "StaffTask"("shop");

-- CreateIndex
CREATE INDEX "StaffTask_repairOrder_idx" ON "StaffTask"("repairOrder");

-- CreateIndex
CREATE INDEX "StaffTask_authorizationRequest_idx" ON "StaffTask"("authorizationRequest");

-- CreateIndex
CREATE INDEX "StaffTask_assignee_idx" ON "StaffTask"("assignee");

-- CreateIndex
CREATE INDEX "StaffTask_createdByUser_idx" ON "StaffTask"("createdByUser");

-- CreateIndex
CREATE INDEX "StaffTask_createdByAgent_idx" ON "StaffTask"("createdByAgent");

-- CreateIndex
CREATE INDEX "StaffTask_doneBy_idx" ON "StaffTask"("doneBy");

-- CreateIndex
CREATE INDEX "StaffTask_shop_status_due_idx" ON "StaffTask"("shop", "status", "dueAt");

-- CreateIndex
CREATE INDEX "CannedJob_shop_idx" ON "CannedJob"("shop");

-- CreateIndex
CREATE INDEX "CannedJob_currentVersion_idx" ON "CannedJob"("currentVersion");

-- CreateIndex
CREATE INDEX "CannedJobVersion_cannedJob_idx" ON "CannedJobVersion"("cannedJob");

-- CreateIndex
CREATE INDEX "CannedJobVersion_author_idx" ON "CannedJobVersion"("author");

-- CreateIndex
CREATE INDEX "CannedJobVersion_publishedBy_idx" ON "CannedJobVersion"("publishedBy");

-- CreateIndex
CREATE UNIQUE INDEX "CannedJobVersion_job_number_key" ON "CannedJobVersion"("cannedJob", "versionNumber");

-- CreateIndex
CREATE INDEX "Inspection_repairOrder_idx" ON "Inspection"("repairOrder");

-- CreateIndex
CREATE INDEX "Inspection_templateVersion_idx" ON "Inspection"("templateVersion");

-- CreateIndex
CREATE INDEX "Inspection_technician_idx" ON "Inspection"("technician");

-- CreateIndex
CREATE INDEX "InspectionItemResult_inspection_idx" ON "InspectionItemResult"("inspection");

-- CreateIndex
CREATE INDEX "InspectionItemResult_templateItem_idx" ON "InspectionItemResult"("templateItem");

-- CreateIndex
CREATE INDEX "InspectionItemResult_recordedBy_idx" ON "InspectionItemResult"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionItemResult_inspection_item_key" ON "InspectionItemResult"("inspection", "templateItem");

-- CreateIndex
CREATE INDEX "InspectionTemplate_shop_idx" ON "InspectionTemplate"("shop");

-- CreateIndex
CREATE INDEX "InspectionTemplateItem_templateVersion_idx" ON "InspectionTemplateItem"("templateVersion");

-- CreateIndex
CREATE INDEX "InspectionTemplateVersion_template_idx" ON "InspectionTemplateVersion"("template");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionTemplateVersion_template_number_key" ON "InspectionTemplateVersion"("template", "versionNumber");

-- CreateIndex
CREATE INDEX "LaborOperation_shop_idx" ON "LaborOperation"("shop");

-- CreateIndex
CREATE INDEX "LaborOperation_code_idx" ON "LaborOperation"("code");

-- CreateIndex
CREATE INDEX "PublishedService_shop_idx" ON "PublishedService"("shop");

-- CreateIndex
CREATE INDEX "PublishedService_cannedJob_idx" ON "PublishedService"("cannedJob");

-- CreateIndex
CREATE UNIQUE INDEX "PublishedService_shop_slug_key" ON "PublishedService"("shop", "slug");

-- CreateIndex
CREATE INDEX "ServiceMenuItem_shop_idx" ON "ServiceMenuItem"("shop");

-- CreateIndex
CREATE INDEX "ServiceMenuItem_cannedJob_idx" ON "ServiceMenuItem"("cannedJob");

-- CreateIndex
CREATE INDEX "Authorization_job_idx" ON "Authorization"("job");

-- CreateIndex
CREATE INDEX "Authorization_estimateVersion_idx" ON "Authorization"("estimateVersion");

-- CreateIndex
CREATE INDEX "Authorization_recordedByUser_idx" ON "Authorization"("recordedByUser");

-- CreateIndex
CREATE INDEX "Authorization_authorizationRequest_idx" ON "Authorization"("authorizationRequest");

-- CreateIndex
CREATE INDEX "Authorization_signature_idx" ON "Authorization"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizationRequest_tokenHash_key" ON "AuthorizationRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthorizationRequest_repairOrder_idx" ON "AuthorizationRequest"("repairOrder");

-- CreateIndex
CREATE INDEX "AuthorizationRequest_estimateVersion_idx" ON "AuthorizationRequest"("estimateVersion");

-- CreateIndex
CREATE INDEX "AuthorizationRequest_contact_idx" ON "AuthorizationRequest"("contact");

-- CreateIndex
CREATE INDEX "AuthorizationRequest_createdByUser_idx" ON "AuthorizationRequest"("createdByUser");

-- CreateIndex
CREATE INDEX "AuthorizationRequest_createdByAgent_idx" ON "AuthorizationRequest"("createdByAgent");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateVersion_reference_key" ON "EstimateVersion"("reference");

-- CreateIndex
CREATE INDEX "EstimateVersion_repairOrder_idx" ON "EstimateVersion"("repairOrder");

-- CreateIndex
CREATE INDEX "EstimateVersion_document_idx" ON "EstimateVersion"("document");

-- CreateIndex
CREATE INDEX "EstimateVersion_sentBy_idx" ON "EstimateVersion"("sentBy");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateVersion_ro_number_key" ON "EstimateVersion"("repairOrder", "versionNumber");

-- CreateIndex
CREATE INDEX "JobDecision_job_idx" ON "JobDecision"("job");

-- CreateIndex
CREATE INDEX "JobDecision_estimateVersion_idx" ON "JobDecision"("estimateVersion");

-- CreateIndex
CREATE INDEX "JobDecision_recordedByUser_idx" ON "JobDecision"("recordedByUser");

-- CreateIndex
CREATE INDEX "JobDecision_authorizationRequest_idx" ON "JobDecision"("authorizationRequest");

-- CreateIndex
CREATE UNIQUE INDEX "PublicAccessToken_tokenHash_key" ON "PublicAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PublicAccessToken_shop_idx" ON "PublicAccessToken"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "_InspectionItemResult_media_AB_unique" ON "_InspectionItemResult_media"("A", "B");

-- CreateIndex
CREATE INDEX "_InspectionItemResult_media_B_index" ON "_InspectionItemResult_media"("B");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_repairOrder_key" ON "CheckIn"("repairOrder");

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollisionClaimRef" ADD CONSTRAINT "CollisionClaimRef_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollisionClaimRef" ADD CONSTRAINT "CollisionClaimRef_thirdPartyEstimate_fkey" FOREIGN KEY ("thirdPartyEstimate") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concern" ADD CONSTRAINT "Concern_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_concern_fkey" FOREIGN KEY ("concern") REFERENCES "Concern"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_cannedJobVersion_fkey" FOREIGN KEY ("cannedJobVersion") REFERENCES "CannedJobVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_inspectionItemResult_fkey" FOREIGN KEY ("inspectionItemResult") REFERENCES "InspectionItemResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_warrantyTerm_fkey" FOREIGN KEY ("warrantyTerm") REFERENCES "WarrantyTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_offeredInVersion_fkey" FOREIGN KEY ("offeredInVersion") REFERENCES "EstimateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_currentAuthorization_fkey" FOREIGN KEY ("currentAuthorization") REFERENCES "Authorization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_teardownDisclosure_fkey" FOREIGN KEY ("teardownDisclosure") REFERENCES "TeardownDisclosure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLine" ADD CONSTRAINT "JobLine_job_fkey" FOREIGN KEY ("job") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLine" ADD CONSTRAINT "JobLine_rateClass_fkey" FOREIGN KEY ("rateClass") REFERENCES "LaborRateClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLine" ADD CONSTRAINT "JobLine_feeRule_fkey" FOREIGN KEY ("feeRule") REFERENCES "FeeRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLine" ADD CONSTRAINT "JobLine_taxCategory_fkey" FOREIGN KEY ("taxCategory") REFERENCES "TaxCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTechShare" ADD CONSTRAINT "JobTechShare_job_fkey" FOREIGN KEY ("job") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTechShare" ADD CONSTRAINT "JobTechShare_technician_fkey" FOREIGN KEY ("technician") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayerSplit" ADD CONSTRAINT "PayerSplit_job_fkey" FOREIGN KEY ("job") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayerSplit" ADD CONSTRAINT "PayerSplit_businessAccount_fkey" FOREIGN KEY ("businessAccount") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_businessAccount_fkey" FOREIGN KEY ("businessAccount") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_vehicle_fkey" FOREIGN KEY ("vehicle") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_serviceAdvisor_fkey" FOREIGN KEY ("serviceAdvisor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_odometerIn_fkey" FOREIGN KEY ("odometerIn") REFERENCES "OdometerReading"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_odometerOut_fkey" FOREIGN KEY ("odometerOut") REFERENCES "OdometerReading"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_jurisdictionPolicyVersion_fkey" FOREIGN KEY ("jurisdictionPolicyVersion") REFERENCES "JurisdictionPolicyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_shopPolicyVersion_fkey" FOREIGN KEY ("shopPolicyVersion") REFERENCES "ShopPolicyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_laborRateClassSetVersion_fkey" FOREIGN KEY ("laborRateClassSetVersion") REFERENCES "LaborRateClassSetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_laborMatrixVersion_fkey" FOREIGN KEY ("laborMatrixVersion") REFERENCES "LaborMatrixVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_partsMatrixVersion_fkey" FOREIGN KEY ("partsMatrixVersion") REFERENCES "PartsMatrixVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_feePolicyVersion_fkey" FOREIGN KEY ("feePolicyVersion") REFERENCES "FeePolicyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_taxRuleSetVersion_fkey" FOREIGN KEY ("taxRuleSetVersion") REFERENCES "TaxRuleSetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_warrantyTermSetVersion_fkey" FOREIGN KEY ("warrantyTermSetVersion") REFERENCES "WarrantyTermSetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_releasedBy_fkey" FOREIGN KEY ("releasedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_openedBy_fkey" FOREIGN KEY ("openedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_authorizationRequest_fkey" FOREIGN KEY ("authorizationRequest") REFERENCES "AuthorizationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_assignee_fkey" FOREIGN KEY ("assignee") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_createdByUser_fkey" FOREIGN KEY ("createdByUser") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_createdByAgent_fkey" FOREIGN KEY ("createdByAgent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_doneBy_fkey" FOREIGN KEY ("doneBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CannedJob" ADD CONSTRAINT "CannedJob_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CannedJob" ADD CONSTRAINT "CannedJob_currentVersion_fkey" FOREIGN KEY ("currentVersion") REFERENCES "CannedJobVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CannedJobVersion" ADD CONSTRAINT "CannedJobVersion_cannedJob_fkey" FOREIGN KEY ("cannedJob") REFERENCES "CannedJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CannedJobVersion" ADD CONSTRAINT "CannedJobVersion_author_fkey" FOREIGN KEY ("author") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CannedJobVersion" ADD CONSTRAINT "CannedJobVersion_publishedBy_fkey" FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_templateVersion_fkey" FOREIGN KEY ("templateVersion") REFERENCES "InspectionTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_technician_fkey" FOREIGN KEY ("technician") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionItemResult" ADD CONSTRAINT "InspectionItemResult_inspection_fkey" FOREIGN KEY ("inspection") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionItemResult" ADD CONSTRAINT "InspectionItemResult_templateItem_fkey" FOREIGN KEY ("templateItem") REFERENCES "InspectionTemplateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionItemResult" ADD CONSTRAINT "InspectionItemResult_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionTemplate" ADD CONSTRAINT "InspectionTemplate_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionTemplateItem" ADD CONSTRAINT "InspectionTemplateItem_templateVersion_fkey" FOREIGN KEY ("templateVersion") REFERENCES "InspectionTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionTemplateVersion" ADD CONSTRAINT "InspectionTemplateVersion_template_fkey" FOREIGN KEY ("template") REFERENCES "InspectionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborOperation" ADD CONSTRAINT "LaborOperation_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedService" ADD CONSTRAINT "PublishedService_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedService" ADD CONSTRAINT "PublishedService_cannedJob_fkey" FOREIGN KEY ("cannedJob") REFERENCES "CannedJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMenuItem" ADD CONSTRAINT "ServiceMenuItem_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMenuItem" ADD CONSTRAINT "ServiceMenuItem_cannedJob_fkey" FOREIGN KEY ("cannedJob") REFERENCES "CannedJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authorization" ADD CONSTRAINT "Authorization_job_fkey" FOREIGN KEY ("job") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authorization" ADD CONSTRAINT "Authorization_estimateVersion_fkey" FOREIGN KEY ("estimateVersion") REFERENCES "EstimateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authorization" ADD CONSTRAINT "Authorization_recordedByUser_fkey" FOREIGN KEY ("recordedByUser") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authorization" ADD CONSTRAINT "Authorization_authorizationRequest_fkey" FOREIGN KEY ("authorizationRequest") REFERENCES "AuthorizationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authorization" ADD CONSTRAINT "Authorization_signature_fkey" FOREIGN KEY ("signature") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationRequest" ADD CONSTRAINT "AuthorizationRequest_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationRequest" ADD CONSTRAINT "AuthorizationRequest_estimateVersion_fkey" FOREIGN KEY ("estimateVersion") REFERENCES "EstimateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationRequest" ADD CONSTRAINT "AuthorizationRequest_contact_fkey" FOREIGN KEY ("contact") REFERENCES "CustomerContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationRequest" ADD CONSTRAINT "AuthorizationRequest_createdByUser_fkey" FOREIGN KEY ("createdByUser") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationRequest" ADD CONSTRAINT "AuthorizationRequest_createdByAgent_fkey" FOREIGN KEY ("createdByAgent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateVersion" ADD CONSTRAINT "EstimateVersion_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateVersion" ADD CONSTRAINT "EstimateVersion_document_fkey" FOREIGN KEY ("document") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateVersion" ADD CONSTRAINT "EstimateVersion_sentBy_fkey" FOREIGN KEY ("sentBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDecision" ADD CONSTRAINT "JobDecision_job_fkey" FOREIGN KEY ("job") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDecision" ADD CONSTRAINT "JobDecision_estimateVersion_fkey" FOREIGN KEY ("estimateVersion") REFERENCES "EstimateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDecision" ADD CONSTRAINT "JobDecision_recordedByUser_fkey" FOREIGN KEY ("recordedByUser") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDecision" ADD CONSTRAINT "JobDecision_authorizationRequest_fkey" FOREIGN KEY ("authorizationRequest") REFERENCES "AuthorizationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicAccessToken" ADD CONSTRAINT "PublicAccessToken_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InspectionItemResult_media" ADD CONSTRAINT "_InspectionItemResult_media_A_fkey" FOREIGN KEY ("A") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InspectionItemResult_media" ADD CONSTRAINT "_InspectionItemResult_media_B_fkey" FOREIGN KEY ("B") REFERENCES "InspectionItemResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Phase 2 guards (SCHEMA §5-7, STATE-MACHINES §2-6) ─────────────────────────────────

-- I-R3: only a person records a customer's authorization or decision. The command layer sets
-- app.actor_kind = 'agent' for assistants and MCP sessions; the database refuses the insert.
CREATE TRIGGER "Authorization_no_agent" BEFORE INSERT ON "Authorization" FOR EACH ROW EXECUTE FUNCTION deny_agent_authorization();
CREATE TRIGGER "JobDecision_no_agent" BEFORE INSERT ON "JobDecision" FOR EACH ROW EXECUTE FUNCTION deny_agent_authorization();

-- An authorization is evidence: it is never deleted, and only its status moves (recorded → superseded | revoked).
CREATE OR REPLACE FUNCTION deny_authorization_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  bookkeeping text[] := ARRAY['status', 'updatedAt'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% % is evidence and cannot be deleted', TG_TABLE_NAME, OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - bookkeeping) IS DISTINCT FROM (to_jsonb(OLD) - bookkeeping) THEN
    RAISE EXCEPTION '% % cannot change; record a new one', TG_TABLE_NAME, OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'recorded' OR NEW.status NOT IN ('recorded', 'superseded', 'revoked') THEN
    RAISE EXCEPTION '% % is % and cannot move to %', TG_TABLE_NAME, OLD.id, OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Authorization_immutable" BEFORE UPDATE OR DELETE ON "Authorization" FOR EACH ROW EXECUTE FUNCTION deny_authorization_change();
CREATE TRIGGER "JobDecision_append_only" BEFORE UPDATE OR DELETE ON "JobDecision" FOR EACH ROW EXECUTE FUNCTION deny_update_delete();

-- A sent estimate is what the customer saw: after draft only the status (sent → superseded) and the rendered PDF move.
CREATE OR REPLACE FUNCTION deny_sent_estimate_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  bookkeeping text[] := ARRAY['status', 'version', 'updatedAt', 'document'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'EstimateVersion % was sent and cannot be deleted', OLD.reference USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' AND (to_jsonb(NEW) - bookkeeping) IS DISTINCT FROM (to_jsonb(OLD) - bookkeeping) THEN
    RAISE EXCEPTION 'EstimateVersion % was sent and cannot change; send a new version', OLD.reference USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'superseded' AND NEW.status <> 'superseded' THEN
    RAISE EXCEPTION 'EstimateVersion % is superseded', OLD.reference USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'sent' AND NEW.status NOT IN ('sent', 'superseded') THEN
    RAISE EXCEPTION 'EstimateVersion % can only be superseded', OLD.reference USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "EstimateVersion_immutable_sent" BEFORE UPDATE OR DELETE ON "EstimateVersion" FOR EACH ROW EXECUTE FUNCTION deny_sent_estimate_change();

-- The customer's answer is stored once; a repeated POST replays it (SM§5.1). Nothing else changes after answered.
CREATE OR REPLACE FUNCTION deny_answered_request_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AuthorizationRequest % cannot be deleted', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'answered' AND (to_jsonb(NEW) - ARRAY['updatedAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['updatedAt']) THEN
    RAISE EXCEPTION 'AuthorizationRequest % was answered and cannot change', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."tokenHash" IS DISTINCT FROM NEW."tokenHash" OR OLD."estimateVersion" IS DISTINCT FROM NEW."estimateVersion" THEN
    RAISE EXCEPTION 'AuthorizationRequest % is bound to its token and estimate', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "AuthorizationRequest_answer_once" BEFORE UPDATE OR DELETE ON "AuthorizationRequest" FOR EACH ROW EXECUTE FUNCTION deny_answered_request_change();

-- Published inspection templates and canned jobs are versioned like policy (Phase 1 functions).
CREATE TRIGGER "InspectionTemplateVersion_immutable_published" BEFORE UPDATE OR DELETE ON "InspectionTemplateVersion" FOR EACH ROW EXECUTE FUNCTION deny_published_policy_change();
CREATE TRIGGER "CannedJobVersion_immutable_published" BEFORE UPDATE OR DELETE ON "CannedJobVersion" FOR EACH ROW EXECUTE FUNCTION deny_published_policy_change();
CREATE TRIGGER "InspectionTemplateItem_draft_only" BEFORE INSERT OR UPDATE OR DELETE ON "InspectionTemplateItem" FOR EACH ROW EXECUTE FUNCTION deny_published_policy_child_change('InspectionTemplateVersion', 'templateVersion');
CREATE UNIQUE INDEX "InspectionTemplateVersion_one_draft" ON "InspectionTemplateVersion" (template) WHERE status = 'draft';
CREATE UNIQUE INDEX "InspectionTemplateVersion_one_published" ON "InspectionTemplateVersion" (template) WHERE status = 'published';
CREATE UNIQUE INDEX "CannedJobVersion_one_draft" ON "CannedJobVersion" ("cannedJob") WHERE status = 'draft';
CREATE UNIQUE INDEX "CannedJobVersion_one_published" ON "CannedJobVersion" ("cannedJob") WHERE status = 'published';

-- One live estimate per repair order and one live authorization per job.
CREATE UNIQUE INDEX "EstimateVersion_one_sent" ON "EstimateVersion" ("repairOrder") WHERE status = 'sent';
CREATE UNIQUE INDEX "Authorization_one_recorded" ON "Authorization" (job) WHERE status = 'recorded';
-- One open inspection of each template version per repair order.
CREATE UNIQUE INDEX "Inspection_one_open" ON "Inspection" ("repairOrder", "templateVersion") WHERE status IN ('assigned', 'in_progress');

-- Shape checks.
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_status_check" CHECK (status IN ('draft', 'checked_in', 'in_service', 'on_hold', 'ready_to_invoice', 'invoiced', 'closed', 'void'));
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_totals_nonnegative" CHECK ("authorizedTotalMinor" >= 0 AND "currentTotalMinor" >= 0 AND version >= 0);
ALTER TABLE "Job" ADD CONSTRAINT "Job_status_check" CHECK (status IN ('draft', 'priced', 'offered', 'authorized', 'declined', 'deferred', 'in_progress', 'needs_reauthorization', 'completed', 'voided'));
ALTER TABLE "Job" ADD CONSTRAINT "Job_amounts_check" CHECK (number > 0 AND "authorizedAmountMinor" >= 0 AND "chargeCeilingMinor" >= 0 AND "taxMinor" >= 0 AND version >= 0);
-- Work runs only on authorized content (I-R1): an in-progress or authorized job has an authorization (or a recorded no-charge / below-threshold reason).
ALTER TABLE "Job" ADD CONSTRAINT "Job_authorized_has_authorization" CHECK (status NOT IN ('authorized', 'in_progress') OR "currentAuthorization" IS NOT NULL OR "noChargeReason" <> '' OR "belowThresholdRecordedAt" IS NOT NULL);
ALTER TABLE "JobLine" ADD CONSTRAINT "JobLine_quantity_positive" CHECK ("quantityMilli" > 0 AND "soldCentiHours" >= 0 AND "unitCostMinor" >= 0);
ALTER TABLE "JobLine" ADD CONSTRAINT "JobLine_discount_sign" CHECK ((kind = 'discount') = ("extendedMinor" < 0) OR "extendedMinor" = 0);
ALTER TABLE "Authorization" ADD CONSTRAINT "Authorization_bound" CHECK ("jobContentHash" ~ '^[0-9a-f]{64}$' AND "amountMinor" >= 0 AND "actorName" <> '');
ALTER TABLE "EstimateVersion" ADD CONSTRAINT "EstimateVersion_status_check" CHECK (status IN ('draft', 'sent', 'superseded') AND "versionNumber" > 0);
ALTER TABLE "AuthorizationRequest" ADD CONSTRAINT "AuthorizationRequest_status_check" CHECK (status IN ('created', 'delivered', 'viewed', 'answered', 'expired', 'withdrawn'));
ALTER TABLE "PublicAccessToken" ADD CONSTRAINT "PublicAccessToken_hash_format" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_status_check" CHECK (status IN ('open', 'done', 'cancelled'));
