-- CreateTable
CREATE TABLE "AccountingBatch" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "businessDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'staged',
    "postingStatus" TEXT NOT NULL DEFAULT 'NOT_POSTED',
    "lines" JSONB DEFAULT '[]',
    "debitTotalMinor" BIGINT NOT NULL DEFAULT 0,
    "creditTotalMinor" BIGINT NOT NULL DEFAULT 0,
    "sourceHash" TEXT NOT NULL DEFAULT '',
    "unmapped" JSONB DEFAULT '[]',
    "exportJob" TEXT,
    "connection" TEXT,
    "stagedById" TEXT NOT NULL DEFAULT '',
    "confirmedById" TEXT NOT NULL DEFAULT '',
    "confirmedAt" TIMESTAMP(3),
    "providerRef" TEXT NOT NULL DEFAULT '',
    "supersededBy" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingMapping" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "sourceKey" TEXT NOT NULL DEFAULT '',
    "accountCode" TEXT NOT NULL DEFAULT '',
    "accountName" TEXT NOT NULL DEFAULT '',
    "side" TEXT NOT NULL DEFAULT 'credit',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingProviderResponse" (
    "id" TEXT NOT NULL,
    "batch" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'accepted',
    "providerRef" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "payload" JSONB DEFAULT '{}',
    "contentHash" TEXT NOT NULL DEFAULT '',
    "receivedAt" TIMESTAMP(3),
    "recordedById" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingProviderResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'accounting_journal',
    "status" TEXT NOT NULL DEFAULT 'ready',
    "periodStart" DATE,
    "periodEnd" DATE,
    "fileName" TEXT NOT NULL DEFAULT '',
    "contentType" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "sha256" TEXT NOT NULL DEFAULT '',
    "rowCount" INTEGER DEFAULT 0,
    "requestedById" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "format" TEXT NOT NULL DEFAULT 'tekmetric_csv',
    "entity" TEXT NOT NULL DEFAULT 'customers',
    "status" TEXT NOT NULL DEFAULT 'previewed',
    "fileName" TEXT NOT NULL DEFAULT '',
    "fileSha256" TEXT NOT NULL DEFAULT '',
    "rowCount" INTEGER DEFAULT 0,
    "preview" JSONB DEFAULT '[]',
    "result" JSONB DEFAULT '{}',
    "sourceText" TEXT NOT NULL DEFAULT '',
    "mapping" JSONB DEFAULT '{}',
    "appliedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'vehicle_data',
    "providerKey" TEXT NOT NULL DEFAULT 'nhtsa',
    "mode" TEXT NOT NULL DEFAULT 'manual',
    "secretRef" TEXT NOT NULL DEFAULT '',
    "capabilityProfile" JSONB DEFAULT '{}',
    "capabilityHash" TEXT NOT NULL DEFAULT '',
    "health" JSONB DEFAULT '{}',
    "lastHealthAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'unconfigured',
    "note" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiSnapshot" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "reportKey" TEXT NOT NULL DEFAULT 'car_count',
    "periodStart" DATE,
    "periodEnd" DATE,
    "values" JSONB DEFAULT '{}',
    "definitions" JSONB DEFAULT '{}',
    "inputHash" TEXT NOT NULL DEFAULT '',
    "computedAt" TIMESTAMP(3),
    "computedById" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderObservation" (
    "id" TEXT NOT NULL,
    "connection" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'webhook',
    "externalId" TEXT NOT NULL DEFAULT '',
    "contentHash" TEXT NOT NULL DEFAULT '',
    "payload" JSONB DEFAULT '{}',
    "receivedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "applyResult" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "url" TEXT NOT NULL DEFAULT '',
    "events" JSONB DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "secretRef" TEXT NOT NULL DEFAULT '',
    "lastTriggered" TIMESTAMP(3),
    "failureCount" INTEGER DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT '',
    "resourceId" TEXT NOT NULL DEFAULT '',
    "resourceType" TEXT NOT NULL DEFAULT '',
    "payload" JSONB DEFAULT '{}',
    "deliveryAttempts" INTEGER DEFAULT 0,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "lastAttempt" TIMESTAMP(3),
    "nextAttempt" TIMESTAMP(3),
    "deadLetteredAt" TIMESTAMP(3),
    "responseStatus" INTEGER,
    "responseBody" TEXT NOT NULL DEFAULT '',
    "endpoint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingBatch_reference_key" ON "AccountingBatch"("reference");

-- CreateIndex
CREATE INDEX "AccountingBatch_shop_idx" ON "AccountingBatch"("shop");

-- CreateIndex
CREATE INDEX "AccountingBatch_exportJob_idx" ON "AccountingBatch"("exportJob");

-- CreateIndex
CREATE INDEX "AccountingBatch_connection_idx" ON "AccountingBatch"("connection");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingBatch_shop_date_hash_key" ON "AccountingBatch"("shop", "businessDate", "sourceHash");

-- CreateIndex
CREATE INDEX "AccountingMapping_shop_idx" ON "AccountingMapping"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingMapping_shop_source_key" ON "AccountingMapping"("shop", "sourceKey");

-- CreateIndex
CREATE INDEX "AccountingProviderResponse_batch_idx" ON "AccountingProviderResponse"("batch");

-- CreateIndex
CREATE UNIQUE INDEX "ExportJob_reference_key" ON "ExportJob"("reference");

-- CreateIndex
CREATE INDEX "ExportJob_shop_idx" ON "ExportJob"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_reference_key" ON "ImportJob"("reference");

-- CreateIndex
CREATE INDEX "ImportJob_shop_idx" ON "ImportJob"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_shop_file_key" ON "ImportJob"("shop", "format", "entity", "fileSha256");

-- CreateIndex
CREATE INDEX "IntegrationConnection_shop_idx" ON "IntegrationConnection"("shop");

-- CreateIndex
CREATE INDEX "KpiSnapshot_shop_idx" ON "KpiSnapshot"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "KpiSnapshot_period_input_key" ON "KpiSnapshot"("shop", "reportKey", "periodStart", "periodEnd", "inputHash");

-- CreateIndex
CREATE INDEX "ProviderObservation_connection_idx" ON "ProviderObservation"("connection");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderObservation_connection_hash_key" ON "ProviderObservation"("connection", "contentHash");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_shop_idx" ON "WebhookEndpoint"("shop");

-- CreateIndex
CREATE INDEX "WebhookEvent_endpoint_idx" ON "WebhookEvent"("endpoint");

-- CreateIndex
CREATE INDEX "WebhookEvent_retry_queue_idx" ON "WebhookEvent"("delivered", "deadLetteredAt", "nextAttempt");

-- AddForeignKey
ALTER TABLE "AccountingBatch" ADD CONSTRAINT "AccountingBatch_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingBatch" ADD CONSTRAINT "AccountingBatch_exportJob_fkey" FOREIGN KEY ("exportJob") REFERENCES "ExportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingBatch" ADD CONSTRAINT "AccountingBatch_connection_fkey" FOREIGN KEY ("connection") REFERENCES "IntegrationConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingMapping" ADD CONSTRAINT "AccountingMapping_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingProviderResponse" ADD CONSTRAINT "AccountingProviderResponse_batch_fkey" FOREIGN KEY ("batch") REFERENCES "AccountingBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiSnapshot" ADD CONSTRAINT "KpiSnapshot_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderObservation" ADD CONSTRAINT "ProviderObservation_connection_fkey" FOREIGN KEY ("connection") REFERENCES "IntegrationConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_endpoint_fkey" FOREIGN KEY ("endpoint") REFERENCES "WebhookEndpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
