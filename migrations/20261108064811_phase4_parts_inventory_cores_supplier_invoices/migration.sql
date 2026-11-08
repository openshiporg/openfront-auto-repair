-- CreateTable
CREATE TABLE "CoreObligation" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "job" TEXT,
    "jobLine" TEXT,
    "shopItem" TEXT,
    "partNumber" TEXT NOT NULL DEFAULT '',
    "supplier" TEXT,
    "supplierOrderLine" TEXT,
    "coreChargeMinor" BIGINT NOT NULL DEFAULT 0,
    "owedTo" TEXT NOT NULL DEFAULT 'supplier',
    "returnedAt" TIMESTAMP(3),
    "returnDocument" TEXT,
    "returnNote" TEXT NOT NULL DEFAULT '',
    "creditedAt" TIMESTAMP(3),
    "supplierInvoiceLine" TEXT,
    "writeOffReason" TEXT NOT NULL DEFAULT '',
    "approval" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'owed',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoreObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleCount" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "items" JSONB DEFAULT '[]',
    "varianceValueMinor" BIGINT NOT NULL DEFAULT 0,
    "postedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CycleCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discrepancy" (
    "id" TEXT NOT NULL,
    "invoice" TEXT,
    "line" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'overcharge',
    "amountMinor" BIGINT NOT NULL DEFAULT 0,
    "detail" TEXT NOT NULL DEFAULT '',
    "openedBy" TEXT,
    "openedByAgent" TEXT,
    "resolution" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Discrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTire" (
    "id" TEXT NOT NULL,
    "job" TEXT,
    "tireSize" TEXT NOT NULL DEFAULT '',
    "position" TEXT NOT NULL DEFAULT 'other',
    "tin" TEXT NOT NULL DEFAULT '',
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobTire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartQuote" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "job" TEXT,
    "jobLine" TEXT,
    "supplier" TEXT,
    "source" TEXT NOT NULL DEFAULT 'phone',
    "partNumber" TEXT NOT NULL DEFAULT '',
    "brand" TEXT NOT NULL DEFAULT '',
    "lineCode" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "unitCostMinor" BIGINT NOT NULL DEFAULT 0,
    "listPriceMinor" BIGINT NOT NULL DEFAULT 0,
    "coreChargeMinor" BIGINT NOT NULL DEFAULT 0,
    "availableQuantityMilli" INTEGER NOT NULL DEFAULT 0,
    "availability" TEXT NOT NULL DEFAULT 'in_stock_local',
    "etaAt" TIMESTAMP(3),
    "supplierLocation" TEXT NOT NULL DEFAULT '',
    "validUntil" TIMESTAMP(3),
    "phoneEvidence" JSONB,
    "createdBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "order" TEXT,
    "receiptKey" TEXT NOT NULL DEFAULT '',
    "receivedBy" TEXT,
    "at" TIMESTAMP(3),
    "packingSlip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptLine" (
    "id" TEXT NOT NULL,
    "receipt" TEXT,
    "orderLine" TEXT,
    "quantityMilli" INTEGER NOT NULL DEFAULT 0,
    "condition" TEXT NOT NULL DEFAULT 'ok',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopItem" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "sku" TEXT NOT NULL DEFAULT '',
    "partNumber" TEXT NOT NULL DEFAULT '',
    "brand" TEXT NOT NULL DEFAULT '',
    "lineCode" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'each',
    "isStocked" BOOLEAN NOT NULL DEFAULT false,
    "binLocation" TEXT NOT NULL DEFAULT '',
    "minQuantityMilli" INTEGER NOT NULL DEFAULT 0,
    "maxQuantityMilli" INTEGER NOT NULL DEFAULT 0,
    "coreChargeMinor" BIGINT NOT NULL DEFAULT 0,
    "preferredSupplier" TEXT,
    "fitmentNotes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "stock" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" TEXT NOT NULL,
    "onHandMilli" INTEGER NOT NULL DEFAULT 0,
    "committedMilli" INTEGER NOT NULL DEFAULT 0,
    "onOrderMilli" INTEGER NOT NULL DEFAULT 0,
    "averageCostMinor" BIGINT NOT NULL DEFAULT 0,
    "lastCountedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "shopItem" TEXT,
    "type" TEXT NOT NULL DEFAULT 'receipt',
    "quantityMilli" INTEGER NOT NULL DEFAULT 0,
    "unitCostMinor" BIGINT NOT NULL DEFAULT 0,
    "job" TEXT,
    "supplierOrderLine" TEXT,
    "onHandDeltaMilli" INTEGER NOT NULL DEFAULT 0,
    "committedDeltaMilli" INTEGER NOT NULL DEFAULT 0,
    "onOrderDeltaMilli" INTEGER NOT NULL DEFAULT 0,
    "cycleCount" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "actorUser" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3),
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'parts_store',
    "adapter" TEXT NOT NULL DEFAULT 'manual',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "accountNumbersByShop" JSONB DEFAULT '{}',
    "deliverySchedule" JSONB DEFAULT '{}',
    "coreReturnWindowDays" INTEGER NOT NULL DEFAULT 30,
    "priceToleranceMinor" BIGINT NOT NULL DEFAULT 0,
    "preferred" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierInvoice" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "supplier" TEXT,
    "invoiceNumber" TEXT NOT NULL DEFAULT '',
    "invoiceDate" DATE,
    "totalMinor" BIGINT NOT NULL DEFAULT 0,
    "document" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "exportReference" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'received',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoice" TEXT,
    "partNumber" TEXT NOT NULL DEFAULT '',
    "quantityMilli" INTEGER NOT NULL DEFAULT 1000,
    "unitCostMinor" BIGINT NOT NULL DEFAULT 0,
    "coreCreditMinor" BIGINT NOT NULL DEFAULT 0,
    "matchedOrderLine" TEXT,
    "matchStatus" TEXT NOT NULL DEFAULT 'unmatched',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierOrder" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "supplier" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'job',
    "placedVia" TEXT,
    "supplierConfirmation" TEXT NOT NULL DEFAULT '',
    "etaAt" TIMESTAMP(3),
    "totalMinor" BIGINT NOT NULL DEFAULT 0,
    "deliveryNote" TEXT NOT NULL DEFAULT '',
    "placedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierOrderLine" (
    "id" TEXT NOT NULL,
    "order" TEXT,
    "job" TEXT,
    "jobLine" TEXT,
    "shopItem" TEXT,
    "partQuote" TEXT,
    "partNumber" TEXT NOT NULL DEFAULT '',
    "brand" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "quantityMilli" INTEGER NOT NULL DEFAULT 1000,
    "unitCostMinor" BIGINT NOT NULL DEFAULT 0,
    "coreChargeMinor" BIGINT NOT NULL DEFAULT 0,
    "receivedQuantityMilli" INTEGER NOT NULL DEFAULT 0,
    "invoicedQuantityMilli" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierReturn" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "supplier" TEXT,
    "rmaNumber" TEXT NOT NULL DEFAULT '',
    "lines" JSONB DEFAULT '[]',
    "reason" TEXT NOT NULL DEFAULT 'unused',
    "creditMinor" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TireRegistrationObligation" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "invoice" TEXT,
    "invoiceLine" TEXT,
    "jobLine" TEXT,
    "tireDescription" TEXT NOT NULL DEFAULT '',
    "tins" JSONB DEFAULT '[]',
    "purchaserName" TEXT NOT NULL DEFAULT '',
    "purchaserAddress" JSONB,
    "dealerIdentity" JSONB,
    "method" TEXT,
    "dueAt" DATE,
    "evidence" JSONB,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TireRegistrationObligation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoreObligation_shop_idx" ON "CoreObligation"("shop");

-- CreateIndex
CREATE INDEX "CoreObligation_job_idx" ON "CoreObligation"("job");

-- CreateIndex
CREATE INDEX "CoreObligation_jobLine_idx" ON "CoreObligation"("jobLine");

-- CreateIndex
CREATE INDEX "CoreObligation_shopItem_idx" ON "CoreObligation"("shopItem");

-- CreateIndex
CREATE INDEX "CoreObligation_supplier_idx" ON "CoreObligation"("supplier");

-- CreateIndex
CREATE INDEX "CoreObligation_supplierOrderLine_idx" ON "CoreObligation"("supplierOrderLine");

-- CreateIndex
CREATE INDEX "CoreObligation_returnDocument_idx" ON "CoreObligation"("returnDocument");

-- CreateIndex
CREATE INDEX "CoreObligation_supplierInvoiceLine_idx" ON "CoreObligation"("supplierInvoiceLine");

-- CreateIndex
CREATE INDEX "CoreObligation_approval_idx" ON "CoreObligation"("approval");

-- CreateIndex
CREATE UNIQUE INDEX "CycleCount_reference_key" ON "CycleCount"("reference");

-- CreateIndex
CREATE INDEX "CycleCount_shop_idx" ON "CycleCount"("shop");

-- CreateIndex
CREATE INDEX "CycleCount_postedBy_idx" ON "CycleCount"("postedBy");

-- CreateIndex
CREATE INDEX "Discrepancy_invoice_idx" ON "Discrepancy"("invoice");

-- CreateIndex
CREATE INDEX "Discrepancy_line_idx" ON "Discrepancy"("line");

-- CreateIndex
CREATE INDEX "Discrepancy_openedBy_idx" ON "Discrepancy"("openedBy");

-- CreateIndex
CREATE INDEX "Discrepancy_openedByAgent_idx" ON "Discrepancy"("openedByAgent");

-- CreateIndex
CREATE UNIQUE INDEX "JobTire_tin_key" ON "JobTire"("tin");

-- CreateIndex
CREATE INDEX "JobTire_job_idx" ON "JobTire"("job");

-- CreateIndex
CREATE INDEX "JobTire_recordedBy_idx" ON "JobTire"("recordedBy");

-- CreateIndex
CREATE INDEX "PartQuote_shop_idx" ON "PartQuote"("shop");

-- CreateIndex
CREATE INDEX "PartQuote_job_idx" ON "PartQuote"("job");

-- CreateIndex
CREATE INDEX "PartQuote_jobLine_idx" ON "PartQuote"("jobLine");

-- CreateIndex
CREATE INDEX "PartQuote_supplier_idx" ON "PartQuote"("supplier");

-- CreateIndex
CREATE INDEX "PartQuote_createdBy_idx" ON "PartQuote"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_receiptKey_key" ON "Receipt"("receiptKey");

-- CreateIndex
CREATE INDEX "Receipt_order_idx" ON "Receipt"("order");

-- CreateIndex
CREATE INDEX "Receipt_receivedBy_idx" ON "Receipt"("receivedBy");

-- CreateIndex
CREATE INDEX "Receipt_packingSlip_idx" ON "Receipt"("packingSlip");

-- CreateIndex
CREATE INDEX "ReceiptLine_receipt_idx" ON "ReceiptLine"("receipt");

-- CreateIndex
CREATE INDEX "ReceiptLine_orderLine_idx" ON "ReceiptLine"("orderLine");

-- CreateIndex
CREATE UNIQUE INDEX "ShopItem_stock_key" ON "ShopItem"("stock");

-- CreateIndex
CREATE INDEX "ShopItem_shop_idx" ON "ShopItem"("shop");

-- CreateIndex
CREATE INDEX "ShopItem_preferredSupplier_idx" ON "ShopItem"("preferredSupplier");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_idempotencyKey_key" ON "StockMovement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "StockMovement_shopItem_idx" ON "StockMovement"("shopItem");

-- CreateIndex
CREATE INDEX "StockMovement_job_idx" ON "StockMovement"("job");

-- CreateIndex
CREATE INDEX "StockMovement_supplierOrderLine_idx" ON "StockMovement"("supplierOrderLine");

-- CreateIndex
CREATE INDEX "StockMovement_cycleCount_idx" ON "StockMovement"("cycleCount");

-- CreateIndex
CREATE INDEX "StockMovement_actorUser_idx" ON "StockMovement"("actorUser");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE INDEX "SupplierInvoice_shop_idx" ON "SupplierInvoice"("shop");

-- CreateIndex
CREATE INDEX "SupplierInvoice_supplier_idx" ON "SupplierInvoice"("supplier");

-- CreateIndex
CREATE INDEX "SupplierInvoice_document_idx" ON "SupplierInvoice"("document");

-- CreateIndex
CREATE INDEX "SupplierInvoice_approvedBy_idx" ON "SupplierInvoice"("approvedBy");

-- CreateIndex
CREATE INDEX "SupplierInvoiceLine_invoice_idx" ON "SupplierInvoiceLine"("invoice");

-- CreateIndex
CREATE INDEX "SupplierInvoiceLine_matchedOrderLine_idx" ON "SupplierInvoiceLine"("matchedOrderLine");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierOrder_reference_key" ON "SupplierOrder"("reference");

-- CreateIndex
CREATE INDEX "SupplierOrder_shop_idx" ON "SupplierOrder"("shop");

-- CreateIndex
CREATE INDEX "SupplierOrder_supplier_idx" ON "SupplierOrder"("supplier");

-- CreateIndex
CREATE INDEX "SupplierOrder_createdBy_idx" ON "SupplierOrder"("createdBy");

-- CreateIndex
CREATE INDEX "SupplierOrderLine_order_idx" ON "SupplierOrderLine"("order");

-- CreateIndex
CREATE INDEX "SupplierOrderLine_job_idx" ON "SupplierOrderLine"("job");

-- CreateIndex
CREATE INDEX "SupplierOrderLine_jobLine_idx" ON "SupplierOrderLine"("jobLine");

-- CreateIndex
CREATE INDEX "SupplierOrderLine_shopItem_idx" ON "SupplierOrderLine"("shopItem");

-- CreateIndex
CREATE INDEX "SupplierOrderLine_partQuote_idx" ON "SupplierOrderLine"("partQuote");

-- CreateIndex
CREATE INDEX "SupplierReturn_shop_idx" ON "SupplierReturn"("shop");

-- CreateIndex
CREATE INDEX "SupplierReturn_supplier_idx" ON "SupplierReturn"("supplier");

-- CreateIndex
CREATE INDEX "TireRegistrationObligation_shop_idx" ON "TireRegistrationObligation"("shop");

-- CreateIndex
CREATE INDEX "TireRegistrationObligation_invoice_idx" ON "TireRegistrationObligation"("invoice");

-- CreateIndex
CREATE INDEX "TireRegistrationObligation_invoiceLine_idx" ON "TireRegistrationObligation"("invoiceLine");

-- CreateIndex
CREATE INDEX "TireRegistrationObligation_jobLine_idx" ON "TireRegistrationObligation"("jobLine");

-- AddForeignKey
ALTER TABLE "CoreObligation" ADD CONSTRAINT "CoreObligation_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoreObligation" ADD CONSTRAINT "CoreObligation_job_fkey" FOREIGN KEY ("job") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoreObligation" ADD CONSTRAINT "CoreObligation_jobLine_fkey" FOREIGN KEY ("jobLine") REFERENCES "JobLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoreObligation" ADD CONSTRAINT "CoreObligation_shopItem_fkey" FOREIGN KEY ("shopItem") REFERENCES "ShopItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoreObligation" ADD CONSTRAINT "CoreObligation_supplier_fkey" FOREIGN KEY ("supplier") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoreObligation" ADD CONSTRAINT "CoreObligation_supplierOrderLine_fkey" FOREIGN KEY ("supplierOrderLine") REFERENCES "SupplierOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoreObligation" ADD CONSTRAINT "CoreObligation_returnDocument_fkey" FOREIGN KEY ("returnDocument") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoreObligation" ADD CONSTRAINT "CoreObligation_supplierInvoiceLine_fkey" FOREIGN KEY ("supplierInvoiceLine") REFERENCES "SupplierInvoiceLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoreObligation" ADD CONSTRAINT "CoreObligation_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleCount" ADD CONSTRAINT "CycleCount_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleCount" ADD CONSTRAINT "CycleCount_postedBy_fkey" FOREIGN KEY ("postedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_invoice_fkey" FOREIGN KEY ("invoice") REFERENCES "SupplierInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_line_fkey" FOREIGN KEY ("line") REFERENCES "SupplierInvoiceLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_openedBy_fkey" FOREIGN KEY ("openedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_openedByAgent_fkey" FOREIGN KEY ("openedByAgent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTire" ADD CONSTRAINT "JobTire_job_fkey" FOREIGN KEY ("job") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTire" ADD CONSTRAINT "JobTire_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartQuote" ADD CONSTRAINT "PartQuote_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartQuote" ADD CONSTRAINT "PartQuote_job_fkey" FOREIGN KEY ("job") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartQuote" ADD CONSTRAINT "PartQuote_jobLine_fkey" FOREIGN KEY ("jobLine") REFERENCES "JobLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartQuote" ADD CONSTRAINT "PartQuote_supplier_fkey" FOREIGN KEY ("supplier") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartQuote" ADD CONSTRAINT "PartQuote_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_order_fkey" FOREIGN KEY ("order") REFERENCES "SupplierOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_receivedBy_fkey" FOREIGN KEY ("receivedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_packingSlip_fkey" FOREIGN KEY ("packingSlip") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_receipt_fkey" FOREIGN KEY ("receipt") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_orderLine_fkey" FOREIGN KEY ("orderLine") REFERENCES "SupplierOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopItem" ADD CONSTRAINT "ShopItem_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopItem" ADD CONSTRAINT "ShopItem_preferredSupplier_fkey" FOREIGN KEY ("preferredSupplier") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopItem" ADD CONSTRAINT "ShopItem_stock_fkey" FOREIGN KEY ("stock") REFERENCES "StockLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_shopItem_fkey" FOREIGN KEY ("shopItem") REFERENCES "ShopItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_job_fkey" FOREIGN KEY ("job") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_supplierOrderLine_fkey" FOREIGN KEY ("supplierOrderLine") REFERENCES "SupplierOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_cycleCount_fkey" FOREIGN KEY ("cycleCount") REFERENCES "CycleCount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_actorUser_fkey" FOREIGN KEY ("actorUser") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_supplier_fkey" FOREIGN KEY ("supplier") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_document_fkey" FOREIGN KEY ("document") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoiceLine" ADD CONSTRAINT "SupplierInvoiceLine_invoice_fkey" FOREIGN KEY ("invoice") REFERENCES "SupplierInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoiceLine" ADD CONSTRAINT "SupplierInvoiceLine_matchedOrderLine_fkey" FOREIGN KEY ("matchedOrderLine") REFERENCES "SupplierOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_supplier_fkey" FOREIGN KEY ("supplier") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderLine" ADD CONSTRAINT "SupplierOrderLine_order_fkey" FOREIGN KEY ("order") REFERENCES "SupplierOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderLine" ADD CONSTRAINT "SupplierOrderLine_job_fkey" FOREIGN KEY ("job") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderLine" ADD CONSTRAINT "SupplierOrderLine_jobLine_fkey" FOREIGN KEY ("jobLine") REFERENCES "JobLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderLine" ADD CONSTRAINT "SupplierOrderLine_shopItem_fkey" FOREIGN KEY ("shopItem") REFERENCES "ShopItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderLine" ADD CONSTRAINT "SupplierOrderLine_partQuote_fkey" FOREIGN KEY ("partQuote") REFERENCES "PartQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_supplier_fkey" FOREIGN KEY ("supplier") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TireRegistrationObligation" ADD CONSTRAINT "TireRegistrationObligation_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TireRegistrationObligation" ADD CONSTRAINT "TireRegistrationObligation_invoice_fkey" FOREIGN KEY ("invoice") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TireRegistrationObligation" ADD CONSTRAINT "TireRegistrationObligation_invoiceLine_fkey" FOREIGN KEY ("invoiceLine") REFERENCES "InvoiceLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TireRegistrationObligation" ADD CONSTRAINT "TireRegistrationObligation_jobLine_fkey" FOREIGN KEY ("jobLine") REFERENCES "JobLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Guards (I-S1, I-S4, I-S6, I-T1) ───────────────────────────────────────────

-- A shop's item numbers and a supplier's invoice numbers are each used once.
CREATE UNIQUE INDEX "ShopItem_shop_sku_unique" ON "ShopItem" ("shop", lower("sku"));
CREATE UNIQUE INDEX "SupplierInvoice_supplier_invoiceNumber_unique" ON "SupplierInvoice" ("supplier", lower(trim("invoiceNumber")));
-- A core is owed once per part line.
CREATE UNIQUE INDEX "CoreObligation_jobLine_unique" ON "CoreObligation" ("jobLine") WHERE "jobLine" IS NOT NULL;
-- One reminder per tire per sale line.
CREATE UNIQUE INDEX "TireRegistrationObligation_invoiceLine_unique" ON "TireRegistrationObligation" ("invoiceLine") WHERE "invoiceLine" IS NOT NULL;

-- Stock never goes negative, and what is reserved never exceeds what is on the shelf.
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_on_hand_nonnegative" CHECK ("onHandMilli" >= 0);
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_committed_within_on_hand" CHECK ("committedMilli" >= 0 AND "committedMilli" <= "onHandMilli");
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_on_order_nonnegative" CHECK ("onOrderMilli" >= 0);
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_cost_nonnegative" CHECK ("averageCostMinor" >= 0);
ALTER TABLE "SupplierOrderLine" ADD CONSTRAINT "SupplierOrderLine_received_within_ordered" CHECK ("receivedQuantityMilli" >= 0 AND "quantityMilli" > 0);
ALTER TABLE "SupplierInvoiceLine" ADD CONSTRAINT "SupplierInvoiceLine_quantity_positive" CHECK ("quantityMilli" > 0 AND "unitCostMinor" >= 0 AND "coreCreditMinor" >= 0);

-- The ledger is append-only.
CREATE TRIGGER "StockMovement_append_only" BEFORE UPDATE OR DELETE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
CREATE TRIGGER "ReceiptLine_append_only" BEFORE UPDATE OR DELETE ON "ReceiptLine" FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
CREATE TRIGGER "Receipt_append_only" BEFORE UPDATE OR DELETE ON "Receipt" FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
CREATE TRIGGER "SupplierInvoiceLine_no_delete" BEFORE DELETE ON "SupplierInvoiceLine" FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
CREATE TRIGGER "Discrepancy_no_delete" BEFORE DELETE ON "Discrepancy" FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
CREATE TRIGGER "SupplierInvoice_no_delete" BEFORE DELETE ON "SupplierInvoice" FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
CREATE TRIGGER "CoreObligation_no_delete" BEFORE DELETE ON "CoreObligation" FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
CREATE TRIGGER "TireRegistrationObligation_no_delete" BEFORE DELETE ON "TireRegistrationObligation" FOR EACH ROW EXECUTE FUNCTION deny_update_delete();

-- On hand, committed and on order change only in the same transaction that writes a ledger row (I-S1).
CREATE OR REPLACE FUNCTION require_stock_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  moved integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Stock levels cannot be deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."onHandMilli" <> 0 OR NEW."committedMilli" <> 0 OR NEW."onOrderMilli" <> 0 THEN
      RAISE EXCEPTION 'A stock level starts at zero; quantities come from stock movements' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."onHandMilli" IS DISTINCT FROM OLD."onHandMilli" OR NEW."committedMilli" IS DISTINCT FROM OLD."committedMilli" OR NEW."onOrderMilli" IS DISTINCT FROM OLD."onOrderMilli" THEN
    -- The command sets this for the one statement that applies a movement.
    IF current_setting('app.stock_movement', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Stock quantities change only through stock movements' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "StockLevel_ledger_only" BEFORE INSERT OR UPDATE OR DELETE ON "StockLevel" FOR EACH ROW EXECUTE FUNCTION require_stock_movement();

-- A ledger row must agree with the level it produced. The command updates the level, then writes the row, so the two match at that moment.
CREATE OR REPLACE FUNCTION check_movement_matches_level() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  lvl record;
BEGIN
  SELECT s.* INTO lvl FROM "StockLevel" s JOIN "ShopItem" i ON i."stock" = s."id" WHERE i."id" = NEW."shopItem";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A stock movement needs a stock level' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW."after"->>'onHand')::integer IS DISTINCT FROM lvl."onHandMilli"
     OR (NEW."after"->>'committed')::integer IS DISTINCT FROM lvl."committedMilli"
     OR (NEW."after"->>'onOrder')::integer IS DISTINCT FROM lvl."onOrderMilli" THEN
    RAISE EXCEPTION 'The stock movement does not match the stock level' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER "StockMovement_matches_level" AFTER INSERT ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION check_movement_matches_level();

-- Assistants can order, receive and propose, but cannot approve a supplier invoice or write off a core.
CREATE TRIGGER "SupplierInvoice_approved_by_person" BEFORE UPDATE ON "SupplierInvoice" FOR EACH ROW WHEN (NEW."status" IN ('approved', 'exported') AND OLD."status" IS DISTINCT FROM NEW."status") EXECUTE FUNCTION deny_agent_authorization();
