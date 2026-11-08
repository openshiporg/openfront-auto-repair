-- Phase 5 review fixes (C2 policy flag, H1 withdraw path, M1 shop-day core due date, M3/M4 CHECKs, H1/H2 uniques).

-- AlterTable: M1. The core return window closes on a calendar day in the shop's zone (both shops are in Los Angeles today).
ALTER TABLE "CoreObligation" ALTER COLUMN "dueAt" SET DATA TYPE DATE
  USING (("dueAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Los_Angeles')::date;

-- AlterTable: H1. A claim raised by mistake is withdrawn, never deleted.
ALTER TABLE "PartWarrantyClaim" ADD COLUMN "voidReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN "voidedAt" TIMESTAMP(3);

-- AlterTable: C2. "TIN pending" is a shop policy, off unless a shop turns it on.
ALTER TABLE "ShopPolicyVersion" ADD COLUMN "tinPendingAllowed" BOOLEAN NOT NULL DEFAULT false;

-- H1 data: the reviewer raised the same claim five times for one comeback. Keep the first, withdraw the other four with the reason.
UPDATE "PartWarrantyClaim" c
   SET status = 'withdrawn', "voidReason" = 'Duplicate of ' || k.keep || ' raised during the Phase 5 review', "voidedAt" = now(), version = c.version + 1, "updatedAt" = now()
  FROM (
    SELECT id, first_value("claimNumber") OVER (PARTITION BY comeback, coalesce("jobLine", '') ORDER BY "claimNumber") AS keep,
           row_number() OVER (PARTITION BY comeback, coalesce("jobLine", '') ORDER BY "claimNumber") AS rn
      FROM "PartWarrantyClaim" WHERE status NOT IN ('denied', 'withdrawn')
  ) k
 WHERE c.id = k.id AND k.rn > 1;

-- H1: one supplier claim per comeback per part line (a withdrawn or denied one does not count).
CREATE UNIQUE INDEX "PartWarrantyClaim_one_per_comeback_line" ON "PartWarrantyClaim" ("comeback", coalesce("jobLine", '')) WHERE status NOT IN ('denied', 'withdrawn');

-- H2: one open comeback per original job.
CREATE UNIQUE INDEX "ComebackCase_one_open_per_job" ON "ComebackCase" ("originalJob") WHERE status NOT IN ('resolved', 'cancelled');

-- M4: money and state CHECKs on the comeback tables.
ALTER TABLE "PartWarrantyClaim" ADD CONSTRAINT "PartWarrantyClaim_money_nonnegative" CHECK ("laborReimbursementMinor" >= 0 AND version >= 0);
ALTER TABLE "PartWarrantyClaim" ADD CONSTRAINT "PartWarrantyClaim_status_check" CHECK (status IN ('draft', 'submitted', 'credited', 'denied', 'withdrawn'));
ALTER TABLE "PartWarrantyClaim" ADD CONSTRAINT "PartWarrantyClaim_withdrawn_has_reason" CHECK (status <> 'withdrawn' OR ("voidReason" <> '' AND "voidedAt" IS NOT NULL));
ALTER TABLE "ComebackCase" ADD CONSTRAINT "ComebackCase_status_check" CHECK (status IN ('open', 'diagnosed', 'resolved', 'cancelled'));
ALTER TABLE "ComebackCase" ADD CONSTRAINT "ComebackCase_version_nonnegative" CHECK (version >= 0);
ALTER TABLE "ComebackCase" ADD CONSTRAINT "ComebackCase_resolved_has_time" CHECK (status <> 'resolved' OR "resolvedAt" IS NOT NULL);
ALTER TABLE "ComebackCase" ADD CONSTRAINT "ComebackCase_repeat_job_differs" CHECK ("comebackJob" IS NULL OR "comebackJob" <> "originalJob");

-- M3: the old CHECK was named for a bound it did not enforce. Rename it for what it does, then add the real bound.
ALTER TABLE "SupplierOrderLine" RENAME CONSTRAINT "SupplierOrderLine_received_within_ordered" TO "SupplierOrderLine_quantities_sane";
ALTER TABLE "SupplierOrderLine" ADD CONSTRAINT "SupplierOrderLine_received_within_ordered" CHECK ("receivedQuantityMilli" <= "quantityMilli");
