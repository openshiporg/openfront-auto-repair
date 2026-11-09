-- AlterTable
ALTER TABLE "SupplierInvoice" ADD COLUMN     "reversalReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "reversedBy" TEXT;

-- AlterTable
ALTER TABLE "SupplierInvoiceLine" ADD COLUMN     "allocations" JSONB DEFAULT '[]';

-- CreateIndex
CREATE INDEX "SupplierInvoice_reversedBy_idx" ON "SupplierInvoice"("reversedBy");

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_reversedBy_fkey" FOREIGN KEY ("reversedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Review r3 (hand-written) ─────────────────────────────────────────────────

-- N1: a supplier invoice's header total equals the sum of its lines (each line rounded to the cent, less its core
-- credit), within one cent, before it can be matched clean, approved or exported. The header is above zero.
-- Rows that predate this rule are kept as they are (append-only); the trigger fires on the moves that pay them.
CREATE OR REPLACE FUNCTION supplier_invoice_lines_total(inv text) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(ROUND(l."quantityMilli"::numeric * l."unitCostMinor" / 1000) - l."coreCreditMinor"), 0)::bigint
  FROM "SupplierInvoiceLine" l WHERE l."invoice" = inv
$$;
CREATE OR REPLACE FUNCTION check_supplier_invoice_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lines_total bigint;
BEGIN
  lines_total := supplier_invoice_lines_total(NEW."id");
  IF NOT EXISTS (SELECT 1 FROM "SupplierInvoiceLine" WHERE "invoice" = NEW."id") OR abs(NEW."totalMinor" - lines_total) > 1 THEN
    RAISE EXCEPTION 'Supplier invoice % total % does not match its lines %', NEW."invoiceNumber", NEW."totalMinor", lines_total USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SupplierInvoice_total_matches_lines" BEFORE UPDATE ON "SupplierInvoice" FOR EACH ROW
  WHEN (NEW."status" IN ('matched', 'approved', 'exported') AND OLD."status" IS DISTINCT FROM NEW."status")
  EXECUTE FUNCTION check_supplier_invoice_total();
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_total_positive" CHECK ("totalMinor" > 0);
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_status_check" CHECK ("status" IN ('received', 'matching', 'matched', 'discrepancy', 'approved', 'exported', 'reversed'));
-- A reversal names who, when and why. A reversed invoice is final: no status leaves it.
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_reversal_complete" CHECK ("status" <> 'reversed' OR ("reversedAt" IS NOT NULL AND "reversedBy" IS NOT NULL AND length(trim("reversalReason")) >= 3));
CREATE OR REPLACE FUNCTION deny_leaving_reversed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'A reversed supplier invoice is final' USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER "SupplierInvoice_reversed_final" BEFORE UPDATE ON "SupplierInvoice" FOR EACH ROW
  WHEN (OLD."status" = 'reversed' AND (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."totalMinor" IS DISTINCT FROM OLD."totalMinor"))
  EXECUTE FUNCTION deny_leaving_reversed();
-- Reversing is a payment decision: a person does it, never an assistant.
CREATE TRIGGER "SupplierInvoice_reversed_by_person" BEFORE UPDATE ON "SupplierInvoice" FOR EACH ROW
  WHEN (NEW."status" = 'reversed' AND OLD."status" IS DISTINCT FROM NEW."status") EXECUTE FUNCTION deny_agent_authorization();
-- A reversed invoice keeps its number in the history; the corrected invoice may use the same number.
DROP INDEX "SupplierInvoice_supplier_invoiceNumber_unique";
CREATE UNIQUE INDEX "SupplierInvoice_supplier_invoiceNumber_unique" ON "SupplierInvoice" ("supplier", lower(trim("invoiceNumber"))) WHERE "status" <> 'reversed';

-- Missing CHECKs listed by the review (DB invariants).
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_money_nonnegative" CHECK ("totalMinor" >= 0);
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_kind_status_check" CHECK ("kind" IN ('job', 'stock', 'sublet') AND "status" IN ('draft', 'placing', 'unknown', 'placed', 'confirmed', 'partially_received', 'received', 'closed', 'cancel_requested', 'cancelled', 'failed'));
ALTER TABLE "CoreObligation" ADD CONSTRAINT "CoreObligation_charge_nonnegative" CHECK ("coreChargeMinor" >= 0);
ALTER TABLE "CoreObligation" ADD CONSTRAINT "CoreObligation_status_check" CHECK ("status" IN ('owed', 'returned', 'credited', 'customer_charged', 'written_off') AND "owedTo" IN ('supplier', 'shop_from_customer'));
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_credit_nonnegative" CHECK ("creditMinor" >= 0);
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_status_check" CHECK ("status" IN ('requested', 'shipped', 'credited', 'rejected'));
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_amount_nonnegative" CHECK ("amountMinor" >= 0);
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_kind_status_check" CHECK ("kind" IN ('overcharge', 'duplicate', 'missing_credit', 'core_not_credited', 'unordered_item', 'quantity_mismatch', 'total_mismatch') AND "status" IN ('open', 'disputed', 'resolved', 'accepted'));
ALTER TABLE "JobTire" ADD CONSTRAINT "JobTire_position_tin_check" CHECK ("position" IN ('LF', 'RF', 'LR', 'RR', 'spare', 'other') AND "tin" ~ '^[A-Z0-9]{8,13}$');
ALTER TABLE "TireRegistrationObligation" ADD CONSTRAINT "TireRegistrationObligation_status_check" CHECK ("status" IN ('open', 'handed_over', 'submitted', 'confirmed', 'overdue') AND ("method" IS NULL OR "method" IN ('form_handed_over', 'submitted_electronic', 'submitted_paper')));
ALTER TABLE "CannedJobVersion" ADD CONSTRAINT "CannedJobVersion_status_check" CHECK ("versionNumber" >= 1 AND "status" IN ('draft', 'published', 'retired') AND ("status" = 'draft' OR "publishedAt" IS NOT NULL));
