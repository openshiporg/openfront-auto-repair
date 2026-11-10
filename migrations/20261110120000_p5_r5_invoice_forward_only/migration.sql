-- ── Review r5 R5-2 (hand-written) ────────────────────────────────────────────
-- The freeze (r4 R4-3) only fires while the stored status is not `received`, so a direct SQL writer could set a matched or
-- approved invoice back to `received`, edit what was billed, re-sum the header and set the status forward again. Supplier
-- invoice status now only moves forward, the way the app moves it:
--   received    → matching, matched, discrepancy, reversed           (match, reverse)
--   matching    → matched, discrepancy, reversed                     (match, reverse)
--   discrepancy → matched, reversed                                  (re-match or every discrepancy settled, reverse)
--   matched     → approved, reversed                                 (approve, reverse)
--   approved    → exported, reversed                                 (export, reverse)
--   exported, reversed: final
-- Nothing ever returns to `received` (or `matching`). Once approved, who approved and when are fixed; once exported, the export
-- reference; once reversed, who reversed it, when and why. On a matched, approved, exported or reversed invoice the match
-- bookkeeping on its lines (matchStatus, matchedOrderLine, allocations) is fixed too: reversal gives quantities back from those
-- allocations, so they must stay what the match recorded.
-- Checked on prod before writing (read-only): 13 invoices (8 reversed, 3 matched, 2 discrepancy); every recorded transition
-- (received→matched/discrepancy, discrepancy→matched, matched→approved, matched/discrepancy/approved→reversed) is allowed here.
CREATE OR REPLACE FUNCTION supplier_invoice_forward_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
       (OLD."status" = 'received'    AND NEW."status" IN ('matching', 'matched', 'discrepancy', 'reversed'))
    OR (OLD."status" = 'matching'    AND NEW."status" IN ('matched', 'discrepancy', 'reversed'))
    OR (OLD."status" = 'discrepancy' AND NEW."status" IN ('matched', 'reversed'))
    OR (OLD."status" = 'matched'     AND NEW."status" IN ('approved', 'reversed'))
    OR (OLD."status" = 'approved'    AND NEW."status" IN ('exported', 'reversed'))
  ) THEN
    IF OLD."status" IN ('exported', 'reversed') THEN
      RAISE EXCEPTION 'Supplier invoice % is % and final: its status cannot move to %.', OLD."invoiceNumber", OLD."status", NEW."status" USING ERRCODE = 'check_violation';
    END IF;
    RAISE EXCEPTION 'Supplier invoice % cannot move from % to %: a supplier invoice only moves forward, through match, approval and export. Reverse it and enter it again.', OLD."invoiceNumber", OLD."status", NEW."status" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" IN ('approved', 'exported', 'reversed') AND (NEW."approvedBy" IS DISTINCT FROM OLD."approvedBy" OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt") THEN
    RAISE EXCEPTION 'Supplier invoice % is %: who approved it and when cannot change.', OLD."invoiceNumber", OLD."status" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" IN ('exported', 'reversed') AND NEW."exportReference" IS DISTINCT FROM OLD."exportReference" THEN
    RAISE EXCEPTION 'Supplier invoice % is %: its export reference cannot change.', OLD."invoiceNumber", OLD."status" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" = 'reversed' AND (NEW."reversedBy" IS DISTINCT FROM OLD."reversedBy" OR NEW."reversedAt" IS DISTINCT FROM OLD."reversedAt" OR NEW."reversalReason" IS DISTINCT FROM OLD."reversalReason") THEN
    RAISE EXCEPTION 'Supplier invoice % is reversed: who reversed it, when and why cannot change.', OLD."invoiceNumber" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SupplierInvoice_forward_only" BEFORE UPDATE ON "SupplierInvoice" FOR EACH ROW
  EXECUTE FUNCTION supplier_invoice_forward_only();

CREATE OR REPLACE FUNCTION freeze_supplier_invoice_lines() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT status INTO st FROM "SupplierInvoice" WHERE id = OLD."invoice";
    IF COALESCE(st, 'received') <> 'received' AND (NEW."invoice" IS DISTINCT FROM OLD."invoice" OR NEW."partNumber" IS DISTINCT FROM OLD."partNumber"
       OR NEW."quantityMilli" IS DISTINCT FROM OLD."quantityMilli" OR NEW."unitCostMinor" IS DISTINCT FROM OLD."unitCostMinor" OR NEW."coreCreditMinor" IS DISTINCT FROM OLD."coreCreditMinor") THEN
      RAISE EXCEPTION 'The lines of a % supplier invoice cannot change. Reverse it and enter it again.', st USING ERRCODE = 'check_violation';
    END IF;
    -- R5-2: what a settled match recorded is what a reversal gives back.
    IF st IN ('matched', 'approved', 'exported', 'reversed') AND (NEW."matchStatus" IS DISTINCT FROM OLD."matchStatus"
       OR NEW."matchedOrderLine" IS DISTINCT FROM OLD."matchedOrderLine" OR NEW."allocations"::text IS DISTINCT FROM OLD."allocations"::text) THEN
      RAISE EXCEPTION 'The match on a supplier invoice line cannot change once the invoice is %. Reverse it and enter it again.', st USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW."invoice" IS NOT NULL AND (TG_OP = 'INSERT' OR NEW."invoice" IS DISTINCT FROM OLD."invoice") THEN
    SELECT status INTO st FROM "SupplierInvoice" WHERE id = NEW."invoice";
    IF COALESCE(st, 'received') <> 'received' THEN
      RAISE EXCEPTION 'No line can be added to a % supplier invoice.', st USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
