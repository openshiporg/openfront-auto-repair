-- CreateTable
CREATE TABLE "BusinessDayClose" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "businessDate" DATE,
    "tenderTotals" JSONB DEFAULT '{}',
    "expectedCashMinor" BIGINT NOT NULL DEFAULT 0,
    "drawerCountMinor" BIGINT NOT NULL DEFAULT 0,
    "varianceMinor" BIGINT NOT NULL DEFAULT 0,
    "varianceReason" TEXT NOT NULL DEFAULT '',
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "reopenApproval" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessDayClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditMemo" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "invoice" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "subtotalMinor" BIGINT NOT NULL DEFAULT 0,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL DEFAULT 0,
    "approval" TEXT,
    "createdBy" TEXT,
    "issuedBy" TEXT,
    "issuedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditMemo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditMemoLine" (
    "id" TEXT NOT NULL,
    "creditMemo" TEXT,
    "invoiceLine" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "amountMinor" BIGINT NOT NULL DEFAULT 0,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditMemoLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancingApplication" (
    "id" TEXT NOT NULL,
    "repairOrder" TEXT,
    "customer" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'operator_recorded',
    "requestedMinor" BIGINT NOT NULL DEFAULT 0,
    "approvedMinor" BIGINT NOT NULL DEFAULT 0,
    "terms" JSONB,
    "lenderReference" TEXT NOT NULL DEFAULT '',
    "payment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'started',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancingApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "invoiceNumber" TEXT NOT NULL DEFAULT '',
    "repairOrder" TEXT,
    "payerKind" TEXT NOT NULL DEFAULT 'customer',
    "customer" TEXT,
    "businessAccount" TEXT,
    "poNumber" TEXT NOT NULL DEFAULT '',
    "invoiceDate" DATE,
    "dueDate" DATE,
    "retentionUntil" DATE,
    "odometerOut" INTEGER,
    "laborSubtotalMinor" BIGINT NOT NULL DEFAULT 0,
    "partsSubtotalMinor" BIGINT NOT NULL DEFAULT 0,
    "feesSubtotalMinor" BIGINT NOT NULL DEFAULT 0,
    "subletSubtotalMinor" BIGINT NOT NULL DEFAULT 0,
    "discountMinor" BIGINT NOT NULL DEFAULT 0,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL DEFAULT 0,
    "paidMinor" BIGINT NOT NULL DEFAULT 0,
    "creditedMinor" BIGINT NOT NULL DEFAULT 0,
    "balanceMinor" BIGINT NOT NULL DEFAULT 0,
    "disclosures" JSONB,
    "statement" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentChannel" TEXT NOT NULL DEFAULT '',
    "finalizedBy" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'finalized',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoice" TEXT,
    "sourceJobLine" TEXT,
    "jobNumber" INTEGER,
    "jobTitle" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'labor',
    "description" TEXT NOT NULL DEFAULT '',
    "partNumber" TEXT NOT NULL DEFAULT '',
    "brand" TEXT NOT NULL DEFAULT '',
    "condition" TEXT NOT NULL DEFAULT '',
    "subletVendorName" TEXT NOT NULL DEFAULT '',
    "quantityMilli" INTEGER DEFAULT 1000,
    "centiHours" INTEGER DEFAULT 0,
    "unitPriceMinor" BIGINT NOT NULL DEFAULT 0,
    "extendedMinor" BIGINT NOT NULL DEFAULT 0,
    "taxCategoryCode" TEXT NOT NULL DEFAULT '',
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "sortOrder" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'invoice',
    "repairOrder" TEXT,
    "customer" TEXT,
    "targetInvoiceIds" JSONB DEFAULT '[]',
    "tender" TEXT NOT NULL DEFAULT 'card_present',
    "amountMinor" BIGINT NOT NULL DEFAULT 0,
    "surchargeMinor" BIGINT NOT NULL DEFAULT 0,
    "allocatedMinor" BIGINT NOT NULL DEFAULT 0,
    "refundedMinor" BIGINT NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "providerSessionId" TEXT NOT NULL DEFAULT '',
    "providerPaymentId" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "payerName" TEXT NOT NULL DEFAULT '',
    "checkNumber" TEXT NOT NULL DEFAULT '',
    "cardBrand" TEXT NOT NULL DEFAULT '',
    "cardLast4" TEXT NOT NULL DEFAULT '',
    "failureMessage" TEXT NOT NULL DEFAULT '',
    "businessDate" DATE,
    "receivedBy" TEXT,
    "settledAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'initiated',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "payment" TEXT,
    "invoice" TEXT,
    "refund" TEXT,
    "amountMinor" BIGINT NOT NULL DEFAULT 0,
    "at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "payment" TEXT,
    "amountMinor" BIGINT NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL DEFAULT '',
    "approval" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "providerRefundId" TEXT NOT NULL DEFAULT '',
    "businessDate" DATE,
    "requestedBy" TEXT,
    "failureMessage" TEXT NOT NULL DEFAULT '',
    "settledAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'requested',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Statement" (
    "id" TEXT NOT NULL,
    "businessAccount" TEXT,
    "periodStart" DATE,
    "periodEnd" DATE,
    "openingMinor" BIGINT NOT NULL DEFAULT 0,
    "chargesMinor" BIGINT NOT NULL DEFAULT 0,
    "paymentsMinor" BIGINT NOT NULL DEFAULT 0,
    "creditsMinor" BIGINT NOT NULL DEFAULT 0,
    "closingMinor" BIGINT NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Statement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyCoverage" (
    "id" TEXT NOT NULL,
    "repairOrder" TEXT,
    "job" TEXT,
    "invoice" TEXT,
    "vehicle" TEXT,
    "termCode" TEXT NOT NULL DEFAULT '',
    "termName" TEXT NOT NULL DEFAULT '',
    "invoiceText" TEXT NOT NULL DEFAULT '',
    "startsOn" DATE,
    "endsOn" DATE,
    "startMiles" INTEGER,
    "endsAtMiles" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessDayClose_shop_idx" ON "BusinessDayClose"("shop");

-- CreateIndex
CREATE INDEX "BusinessDayClose_closedBy_idx" ON "BusinessDayClose"("closedBy");

-- CreateIndex
CREATE INDEX "BusinessDayClose_reopenApproval_idx" ON "BusinessDayClose"("reopenApproval");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDayClose_shop_date_key" ON "BusinessDayClose"("shop", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "CreditMemo_reference_key" ON "CreditMemo"("reference");

-- CreateIndex
CREATE INDEX "CreditMemo_shop_idx" ON "CreditMemo"("shop");

-- CreateIndex
CREATE INDEX "CreditMemo_invoice_idx" ON "CreditMemo"("invoice");

-- CreateIndex
CREATE INDEX "CreditMemo_approval_idx" ON "CreditMemo"("approval");

-- CreateIndex
CREATE INDEX "CreditMemo_createdBy_idx" ON "CreditMemo"("createdBy");

-- CreateIndex
CREATE INDEX "CreditMemo_issuedBy_idx" ON "CreditMemo"("issuedBy");

-- CreateIndex
CREATE INDEX "CreditMemoLine_creditMemo_idx" ON "CreditMemoLine"("creditMemo");

-- CreateIndex
CREATE INDEX "CreditMemoLine_invoiceLine_idx" ON "CreditMemoLine"("invoiceLine");

-- CreateIndex
CREATE INDEX "FinancingApplication_repairOrder_idx" ON "FinancingApplication"("repairOrder");

-- CreateIndex
CREATE INDEX "FinancingApplication_customer_idx" ON "FinancingApplication"("customer");

-- CreateIndex
CREATE INDEX "FinancingApplication_payment_idx" ON "FinancingApplication"("payment");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_shop_idx" ON "Invoice"("shop");

-- CreateIndex
CREATE INDEX "Invoice_repairOrder_idx" ON "Invoice"("repairOrder");

-- CreateIndex
CREATE INDEX "Invoice_customer_idx" ON "Invoice"("customer");

-- CreateIndex
CREATE INDEX "Invoice_businessAccount_idx" ON "Invoice"("businessAccount");

-- CreateIndex
CREATE INDEX "Invoice_statement_idx" ON "Invoice"("statement");

-- CreateIndex
CREATE INDEX "Invoice_finalizedBy_idx" ON "Invoice"("finalizedBy");

-- CreateIndex
CREATE INDEX "Invoice_ro_payer_idx" ON "Invoice"("repairOrder", "payerKind");

-- CreateIndex
CREATE INDEX "Invoice_shop_status_idx" ON "Invoice"("shop", "status");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoice_idx" ON "InvoiceLine"("invoice");

-- CreateIndex
CREATE INDEX "InvoiceLine_sourceJobLine_idx" ON "InvoiceLine"("sourceJobLine");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_shop_idx" ON "Payment"("shop");

-- CreateIndex
CREATE INDEX "Payment_repairOrder_idx" ON "Payment"("repairOrder");

-- CreateIndex
CREATE INDEX "Payment_customer_idx" ON "Payment"("customer");

-- CreateIndex
CREATE INDEX "Payment_providerSessionId_idx" ON "Payment"("providerSessionId");

-- CreateIndex
CREATE INDEX "Payment_providerPaymentId_idx" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE INDEX "Payment_receivedBy_idx" ON "Payment"("receivedBy");

-- CreateIndex
CREATE INDEX "Payment_shop_date_idx" ON "Payment"("shop", "businessDate");

-- CreateIndex
CREATE INDEX "Payment_status_created_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAllocation_payment_idx" ON "PaymentAllocation"("payment");

-- CreateIndex
CREATE INDEX "PaymentAllocation_invoice_idx" ON "PaymentAllocation"("invoice");

-- CreateIndex
CREATE INDEX "PaymentAllocation_refund_idx" ON "PaymentAllocation"("refund");

-- CreateIndex
CREATE INDEX "Refund_payment_idx" ON "Refund"("payment");

-- CreateIndex
CREATE INDEX "Refund_approval_idx" ON "Refund"("approval");

-- CreateIndex
CREATE INDEX "Refund_providerRefundId_idx" ON "Refund"("providerRefundId");

-- CreateIndex
CREATE INDEX "Refund_requestedBy_idx" ON "Refund"("requestedBy");

-- CreateIndex
CREATE INDEX "Statement_businessAccount_idx" ON "Statement"("businessAccount");

-- CreateIndex
CREATE INDEX "WarrantyCoverage_repairOrder_idx" ON "WarrantyCoverage"("repairOrder");

-- CreateIndex
CREATE INDEX "WarrantyCoverage_job_idx" ON "WarrantyCoverage"("job");

-- CreateIndex
CREATE INDEX "WarrantyCoverage_invoice_idx" ON "WarrantyCoverage"("invoice");

-- CreateIndex
CREATE INDEX "WarrantyCoverage_vehicle_idx" ON "WarrantyCoverage"("vehicle");

-- AddForeignKey
ALTER TABLE "BusinessDayClose" ADD CONSTRAINT "BusinessDayClose_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDayClose" ADD CONSTRAINT "BusinessDayClose_closedBy_fkey" FOREIGN KEY ("closedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDayClose" ADD CONSTRAINT "BusinessDayClose_reopenApproval_fkey" FOREIGN KEY ("reopenApproval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditMemo" ADD CONSTRAINT "CreditMemo_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditMemo" ADD CONSTRAINT "CreditMemo_invoice_fkey" FOREIGN KEY ("invoice") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditMemo" ADD CONSTRAINT "CreditMemo_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditMemo" ADD CONSTRAINT "CreditMemo_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditMemo" ADD CONSTRAINT "CreditMemo_issuedBy_fkey" FOREIGN KEY ("issuedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditMemoLine" ADD CONSTRAINT "CreditMemoLine_creditMemo_fkey" FOREIGN KEY ("creditMemo") REFERENCES "CreditMemo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditMemoLine" ADD CONSTRAINT "CreditMemoLine_invoiceLine_fkey" FOREIGN KEY ("invoiceLine") REFERENCES "InvoiceLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancingApplication" ADD CONSTRAINT "FinancingApplication_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancingApplication" ADD CONSTRAINT "FinancingApplication_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancingApplication" ADD CONSTRAINT "FinancingApplication_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_businessAccount_fkey" FOREIGN KEY ("businessAccount") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_statement_fkey" FOREIGN KEY ("statement") REFERENCES "Statement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_finalizedBy_fkey" FOREIGN KEY ("finalizedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoice_fkey" FOREIGN KEY ("invoice") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_sourceJobLine_fkey" FOREIGN KEY ("sourceJobLine") REFERENCES "JobLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivedBy_fkey" FOREIGN KEY ("receivedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoice_fkey" FOREIGN KEY ("invoice") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_refund_fkey" FOREIGN KEY ("refund") REFERENCES "Refund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_businessAccount_fkey" FOREIGN KEY ("businessAccount") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyCoverage" ADD CONSTRAINT "WarrantyCoverage_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyCoverage" ADD CONSTRAINT "WarrantyCoverage_job_fkey" FOREIGN KEY ("job") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyCoverage" ADD CONSTRAINT "WarrantyCoverage_invoice_fkey" FOREIGN KEY ("invoice") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyCoverage" ADD CONSTRAINT "WarrantyCoverage_vehicle_fkey" FOREIGN KEY ("vehicle") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Phase 3 guards (SCHEMA §11, G8; STATE-MACHINES §12, §14) ──────────────────────────

-- A row whose money is fixed at creation: only the named bookkeeping columns may change, and nothing is ever deleted.
CREATE OR REPLACE FUNCTION deny_financial_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  bookkeeping text[] := TG_ARGV;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% % is a financial record and cannot be deleted', TG_TABLE_NAME, OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - bookkeeping) IS DISTINCT FROM (to_jsonb(OLD) - bookkeeping) THEN
    RAISE EXCEPTION '% % is a financial record; only % may change', TG_TABLE_NAME, OLD.id, array_to_string(bookkeeping, ', ') USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "Invoice_immutable" BEFORE UPDATE OR DELETE ON "Invoice" FOR EACH ROW
  EXECUTE FUNCTION deny_financial_change('paidMinor', 'creditedMinor', 'balanceMinor', 'status', 'version', 'updatedAt', 'sentAt', 'sentChannel', 'statement');
CREATE TRIGGER "Payment_immutable" BEFORE UPDATE OR DELETE ON "Payment" FOR EACH ROW
  EXECUTE FUNCTION deny_financial_change('status', 'version', 'updatedAt', 'providerSessionId', 'providerPaymentId', 'cardBrand', 'cardLast4', 'failureMessage', 'allocatedMinor', 'refundedMinor', 'settledAt', 'businessDate', 'targetInvoiceIds');
CREATE TRIGGER "Refund_immutable" BEFORE UPDATE OR DELETE ON "Refund" FOR EACH ROW
  EXECUTE FUNCTION deny_financial_change('status', 'version', 'updatedAt', 'providerRefundId', 'failureMessage', 'settledAt', 'businessDate', 'approval');
CREATE TRIGGER "InvoiceLine_append_only" BEFORE UPDATE OR DELETE ON "InvoiceLine" FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
CREATE TRIGGER "PaymentAllocation_append_only" BEFORE UPDATE OR DELETE ON "PaymentAllocation" FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
CREATE TRIGGER "CreditMemoLine_append_only" BEFORE UPDATE OR DELETE ON "CreditMemoLine" FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
CREATE TRIGGER "WarrantyCoverage_no_delete" BEFORE DELETE ON "WarrantyCoverage" FOR EACH ROW EXECUTE FUNCTION deny_update_delete();

-- A credit memo is a draft until issued; an issued one never changes.
CREATE OR REPLACE FUNCTION deny_issued_memo_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'issued' THEN RAISE EXCEPTION 'credit memo % is issued and cannot be deleted', OLD.reference USING ERRCODE = 'check_violation'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'issued' THEN
    RAISE EXCEPTION 'credit memo % is issued and cannot change', OLD.reference USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "CreditMemo_issued_immutable" BEFORE UPDATE OR DELETE ON "CreditMemo" FOR EACH ROW EXECUTE FUNCTION deny_issued_memo_change();

-- A closed business day is frozen: its totals, count and variance stay; the only change is to reopen it (which needs an approval).
CREATE OR REPLACE FUNCTION deny_closed_day_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  bookkeeping text[] := ARRAY['status', 'version', 'updatedAt', 'reopenApproval'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'business day % is a financial record and cannot be deleted', OLD."businessDate" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'closed' THEN
    IF NEW.status <> 'reopened' OR (to_jsonb(NEW) - bookkeeping) IS DISTINCT FROM (to_jsonb(OLD) - bookkeeping) THEN
      RAISE EXCEPTION 'business day % is closed; it can only be reopened', OLD."businessDate" USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "BusinessDayClose_frozen" BEFORE UPDATE OR DELETE ON "BusinessDayClose" FOR EACH ROW EXECUTE FUNCTION deny_closed_day_change();

-- Money can never be taken, refunded, allocated or finalized by an agent or an MCP session (SM§14, I-A3).
CREATE TRIGGER "Invoice_no_agent" BEFORE INSERT ON "Invoice" FOR EACH ROW EXECUTE FUNCTION deny_agent_authorization();
CREATE TRIGGER "Payment_no_agent" BEFORE INSERT ON "Payment" FOR EACH ROW EXECUTE FUNCTION deny_agent_authorization();
CREATE TRIGGER "Refund_no_agent" BEFORE INSERT ON "Refund" FOR EACH ROW EXECUTE FUNCTION deny_agent_authorization();
CREATE TRIGGER "CreditMemo_no_agent" BEFORE INSERT ON "CreditMemo" FOR EACH ROW EXECUTE FUNCTION deny_agent_authorization();
CREATE TRIGGER "BusinessDayClose_no_agent" BEFORE INSERT ON "BusinessDayClose" FOR EACH ROW EXECUTE FUNCTION deny_agent_authorization();

-- An allocation can never exceed what the payment holds or what the invoice is worth (D§3.8). The command locks both rows first;
-- this is the backstop for anything else that writes.
CREATE OR REPLACE FUNCTION check_allocation_bounds() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  paid bigint;
  pay_amount bigint;
  inv_alloc bigint;
  inv_total bigint;
BEGIN
  SELECT "amountMinor" INTO pay_amount FROM "Payment" WHERE id = NEW."payment";
  SELECT COALESCE(SUM("amountMinor"), 0) INTO paid FROM "PaymentAllocation" WHERE "payment" = NEW."payment";
  IF paid > pay_amount THEN
    RAISE EXCEPTION 'allocations (%) exceed the payment (%)', paid, pay_amount USING ERRCODE = 'check_violation';
  END IF;
  SELECT "totalMinor" INTO inv_total FROM "Invoice" WHERE id = NEW."invoice";
  SELECT COALESCE(SUM("amountMinor"), 0) INTO inv_alloc FROM "PaymentAllocation" WHERE "invoice" = NEW."invoice";
  IF inv_alloc > inv_total THEN
    RAISE EXCEPTION 'allocations (%) exceed the invoice total (%)', inv_alloc, inv_total USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PaymentAllocation_bounds" AFTER INSERT ON "PaymentAllocation" FOR EACH ROW EXECUTE FUNCTION check_allocation_bounds();

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_invoice_number_format" CHECK ("invoiceNumber" ~ '^INV-[A-Z]{2,5}-[0-9]{4}-[0-9]{6}$');
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_amounts_sane" CHECK ("totalMinor" >= 0 AND "paidMinor" >= 0 AND "creditedMinor" >= 0 AND "balanceMinor" >= 0);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_balance_adds_up" CHECK ("balanceMinor" = "totalMinor" - "paidMinor" - "creditedMinor");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_total_adds_up" CHECK ("totalMinor" = "laborSubtotalMinor" + "partsSubtotalMinor" + "feesSubtotalMinor" + "subletSubtotalMinor" + "discountMinor" + "taxMinor");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amountMinor" > 0 AND "surchargeMinor" >= 0 AND "allocatedMinor" >= 0 AND "refundedMinor" >= 0 AND "refundedMinor" <= "amountMinor");
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_has_targets" CHECK ("payment" IS NOT NULL AND "invoice" IS NOT NULL AND "amountMinor" <> 0);
ALTER TABLE "CreditMemo" ADD CONSTRAINT "CreditMemo_amounts_sane" CHECK ("totalMinor" >= 0 AND "taxMinor" >= 0);
ALTER TABLE "BusinessDayClose" ADD CONSTRAINT "BusinessDayClose_variance_adds_up" CHECK ("varianceMinor" = "drawerCountMinor" - "expectedCashMinor");
