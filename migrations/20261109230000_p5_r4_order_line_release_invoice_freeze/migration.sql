-- ── Review r4 (hand-written) ─────────────────────────────────────────────────

-- R4-1 repair. VW-EO299-4 (Valley Warehouse, header $1,150.00 against $11.50 of lines) was matched and approved before the
-- header check, then reversed at 21:14 UTC by code that only gave back recorded allocations; its line held the column default []
-- so nothing was released (CommandReceipt rv3-rv-mw9rejun-7pzgv: releasedQuantityMilli 0). The order line it matched,
-- PO-NGA-2026-00006 CF10285 (cmw9eo2lb001uns01drr3y9a2), still reads invoiced 1000 of received 1000, so the corrected bill
-- cannot match. This gives back exactly that 1000 on that one line, append-only: an audit event (hash-chained like every other
-- event, under the same chain lock) and a CommandReceipt record what was done and why. No other row is touched.
-- Guarded: it applies only while the line is still at invoiced 1000 of received 1000, the reversed invoice line still points at
-- it, and no invoice that is not reversed references the line; on any other database (fresh, test, scratch) it does nothing.
DO $$
DECLARE
  line_id constant text := 'cmw9eo2lb001uns01drr3y9a2';
  invoice_id constant text := 'cmw9eo33z0027ns01f2o26i3z';
  invoice_line_id constant text := 'cmw9eo3440028ns012f0euply';
  why constant text := 'VW-EO299-4 was reversed before reversals gave back matched quantities; release the 1 CF10285 it had taken so the corrected bill can match (review r4 R4-1)';
  ekey constant text := 'repair:r4-1:release:cmw9eo2lb001uns01drr3y9a2';
  last_seq integer;
  prev text;
  at_ts timestamp(3);
  at_iso text;
  body text;
  h text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "SupplierOrderLine" ol
     WHERE ol.id = line_id AND ol."invoicedQuantityMilli" = 1000 AND ol."receivedQuantityMilli" = 1000
  ) OR NOT EXISTS (
    SELECT 1 FROM "SupplierInvoiceLine" l JOIN "SupplierInvoice" i ON i.id = l.invoice
     WHERE l.id = invoice_line_id AND i.id = invoice_id AND i.status = 'reversed' AND l."matchedOrderLine" = line_id AND l."quantityMilli" = 1000
  ) OR EXISTS (
    SELECT 1 FROM "SupplierInvoiceLine" l JOIN "SupplierInvoice" i ON i.id = l.invoice
     WHERE i.status <> 'reversed' AND (l."matchedOrderLine" = line_id OR l.allocations::text LIKE '%' || line_id || '%')
  ) OR EXISTS (SELECT 1 FROM "AuditEvent" WHERE "eventKey" = ekey) THEN
    RAISE NOTICE 'R4-1 repair: not applicable here, nothing changed';
    RETURN;
  END IF;

  UPDATE "SupplierOrderLine" SET "invoicedQuantityMilli" = 0, "updatedAt" = now() WHERE id = line_id AND "invoicedQuantityMilli" = 1000;

  -- Same chain lock and the same canonical body as appendAuditEvents (features/keystone/lib/audit.ts): keys sorted, no spaces.
  PERFORM pg_advisory_xact_lock(hashtextextended('audit:chain', 0));
  SELECT seq, hash INTO last_seq, prev FROM "AuditEvent" ORDER BY seq DESC LIMIT 1;
  last_seq := COALESCE(last_seq, 0) + 1;
  prev := COALESCE(prev, repeat('0', 64));
  at_ts := date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC');
  at_iso := to_char(at_ts, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  body := '{"actorAgentId":null,"actorUserId":null,"after":{"invoicedQuantityMilli":0}'
    || ',"approverId":null,"at":"' || at_iso || '","before":{"invoicedQuantityMilli":1000}'
    || ',"entityId":"' || line_id || '","entityType":"SupplierOrderLine","eventKey":"' || ekey || '"'
    || ',"eventType":"supplier_order_line.invoiced_released"'
    || ',"metadata":{"commandReceipt":"' || ekey || '","invoiceId":"' || invoice_id || '","invoiceLineId":"' || invoice_line_id || '","invoiceNumber":"VW-EO299-4","releasedQuantityMilli":1000}'
    || ',"reason":"' || why || '","requestId":null,"seq":' || last_seq || '}';
  h := encode(sha256(convert_to(prev || E'\n' || body, 'UTF8')), 'hex');
  INSERT INTO "AuditEvent" (id, seq, "eventKey", "eventType", "entityType", "entityId", "actorUser", "actorAgent", approver, reason, before, after, metadata, "requestId", "prevHash", hash, at)
  VALUES (gen_random_uuid()::text, last_seq, ekey, 'supplier_order_line.invoiced_released', 'SupplierOrderLine', line_id, NULL, NULL, NULL, why,
          '{"invoicedQuantityMilli":1000}'::jsonb, '{"invoicedQuantityMilli":0}'::jsonb,
          jsonb_build_object('commandReceipt', ekey, 'invoiceId', invoice_id, 'invoiceLineId', invoice_line_id, 'invoiceNumber', 'VW-EO299-4', 'releasedQuantityMilli', 1000),
          '', prev, h, at_ts);

  INSERT INTO "CommandReceipt" (id, "idempotencyKey", command, "principalKey", "requestHash", "requestParams", "responseCode", "responseBody", "recoveryPoint", "completedAt", "createdAt", "updatedAt")
  VALUES ('r4-1-release-' || line_id, ekey, 'supplier_order_line.repair_release', 'system:migration:20261109230000',
          encode(sha256(convert_to('{"invoiceId":"' || invoice_id || '","orderLineId":"' || line_id || '","quantityMilli":1000}', 'UTF8')), 'hex'),
          jsonb_build_object('invoiceId', invoice_id, 'orderLineId', line_id, 'quantityMilli', 1000),
          'ok', jsonb_build_object('orderLineId', line_id, 'invoiceId', invoice_id, 'releasedQuantityMilli', 1000, 'auditSeq', last_seq, 'reason', why),
          'completed', at_ts, at_ts, at_ts);
  RAISE NOTICE 'R4-1 repair: released 1000 on %, audit seq %', line_id, last_seq;
END $$;

-- R4-1 gap: an order line is never invoiced below zero or above what was received.
ALTER TABLE "SupplierOrderLine" ADD CONSTRAINT "SupplierOrderLine_invoiced_within_received"
  CHECK ("invoicedQuantityMilli" >= 0 AND "invoicedQuantityMilli" <= "receivedQuantityMilli");

-- R4-3: once a supplier invoice has left `received` (matching, matched, discrepancy, approved, exported, reversed), what was
-- billed is frozen: the header total and identity, and every line's part, quantity, cost and core credit. No line may be added
-- to it or moved onto or off it (lines are never deleted: SupplierInvoiceLine_no_delete). Status moves, approval, export and
-- reversal metadata, and the match bookkeeping on lines (matchStatus, matchedOrderLine, allocations) stay allowed.
-- A correction is a reversal and a new entry.
CREATE OR REPLACE FUNCTION freeze_supplier_invoice_header() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."totalMinor" IS DISTINCT FROM OLD."totalMinor" OR NEW."invoiceNumber" IS DISTINCT FROM OLD."invoiceNumber"
     OR NEW."supplier" IS DISTINCT FROM OLD."supplier" OR NEW."shop" IS DISTINCT FROM OLD."shop" OR NEW."invoiceDate" IS DISTINCT FROM OLD."invoiceDate" THEN
    RAISE EXCEPTION 'Supplier invoice % is %: what was billed cannot change. Reverse it and enter it again.', OLD."invoiceNumber", OLD."status" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SupplierInvoice_billed_frozen" BEFORE UPDATE ON "SupplierInvoice" FOR EACH ROW
  WHEN (OLD."status" <> 'received') EXECUTE FUNCTION freeze_supplier_invoice_header();

CREATE OR REPLACE FUNCTION freeze_supplier_invoice_lines() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT status INTO st FROM "SupplierInvoice" WHERE id = OLD."invoice";
    IF COALESCE(st, 'received') <> 'received' AND (NEW."invoice" IS DISTINCT FROM OLD."invoice" OR NEW."partNumber" IS DISTINCT FROM OLD."partNumber"
       OR NEW."quantityMilli" IS DISTINCT FROM OLD."quantityMilli" OR NEW."unitCostMinor" IS DISTINCT FROM OLD."unitCostMinor" OR NEW."coreCreditMinor" IS DISTINCT FROM OLD."coreCreditMinor") THEN
      RAISE EXCEPTION 'The lines of a % supplier invoice cannot change. Reverse it and enter it again.', st USING ERRCODE = 'check_violation';
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
CREATE TRIGGER "SupplierInvoiceLine_billed_frozen" BEFORE INSERT OR UPDATE ON "SupplierInvoiceLine" FOR EACH ROW
  EXECUTE FUNCTION freeze_supplier_invoice_lines();
