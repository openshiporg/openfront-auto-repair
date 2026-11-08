-- CreateTable
CREATE TABLE "ClockCorrection" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "technician" TEXT,
    "targetKind" TEXT NOT NULL DEFAULT 'shift',
    "targetId" TEXT NOT NULL DEFAULT '',
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT NOT NULL DEFAULT '',
    "requestedBy" TEXT,
    "approval" TEXT,
    "appliedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClockCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComebackCase" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "originalJob" TEXT,
    "comebackJob" TEXT,
    "concern" TEXT NOT NULL DEFAULT '',
    "coverage" TEXT,
    "coverageValid" BOOLEAN NOT NULL DEFAULT false,
    "cause" TEXT NOT NULL DEFAULT 'undetermined',
    "diagnosis" TEXT NOT NULL DEFAULT '',
    "noCharge" BOOLEAN NOT NULL DEFAULT false,
    "goodwillApproval" TEXT,
    "resolution" TEXT NOT NULL DEFAULT '',
    "openedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComebackCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlaggedHoursEntry" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "technician" TEXT,
    "job" TEXT,
    "centiHours" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'flag',
    "reason" TEXT NOT NULL DEFAULT '',
    "sourceEvent" TEXT NOT NULL DEFAULT '',
    "payPeriod" TEXT,
    "flaggedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlaggedHoursEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobClock" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "technician" TEXT,
    "job" TEXT,
    "shiftClock" TEXT,
    "startedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "workedCentiHours" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobClock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartWarrantyClaim" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "comeback" TEXT,
    "supplier" TEXT,
    "jobLine" TEXT,
    "claimNumber" TEXT NOT NULL DEFAULT '',
    "laborReimbursementMinor" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartWarrantyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayPeriod" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "startsOn" DATE,
    "endsOn" DATE,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "approvedBy" TEXT,
    "exportedAt" TIMESTAMP(3),
    "exportCsv" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftClock" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "technician" TEXT,
    "clockInAt" TIMESTAMP(3),
    "clockOutAt" TIMESTAMP(3),
    "breaks" JSONB DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'clocked_in',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftClock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicianCredential" (
    "id" TEXT NOT NULL,
    "technician" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "identifier" TEXT NOT NULL DEFAULT '',
    "issuedAt" DATE,
    "expiresAt" DATE,
    "verifiedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnicianCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicianProfile" (
    "id" TEXT NOT NULL,
    "user" TEXT,
    "shop" TEXT,
    "displayName" TEXT NOT NULL DEFAULT '',
    "payPlan" TEXT NOT NULL DEFAULT 'flat_rate',
    "flatRateMinor" BIGINT NOT NULL DEFAULT 0,
    "hourlyRateMinor" BIGINT NOT NULL DEFAULT 0,
    "skills" JSONB DEFAULT '[]',
    "rateClasses" JSONB DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnicianProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitingInterval" (
    "id" TEXT NOT NULL,
    "jobClock" TEXT,
    "reason" TEXT NOT NULL DEFAULT 'other',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitingInterval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClockCorrection_shop_idx" ON "ClockCorrection"("shop");

-- CreateIndex
CREATE INDEX "ClockCorrection_technician_idx" ON "ClockCorrection"("technician");

-- CreateIndex
CREATE INDEX "ClockCorrection_requestedBy_idx" ON "ClockCorrection"("requestedBy");

-- CreateIndex
CREATE INDEX "ClockCorrection_approval_idx" ON "ClockCorrection"("approval");

-- CreateIndex
CREATE UNIQUE INDEX "ComebackCase_reference_key" ON "ComebackCase"("reference");

-- CreateIndex
CREATE INDEX "ComebackCase_shop_idx" ON "ComebackCase"("shop");

-- CreateIndex
CREATE INDEX "ComebackCase_originalJob_idx" ON "ComebackCase"("originalJob");

-- CreateIndex
CREATE INDEX "ComebackCase_comebackJob_idx" ON "ComebackCase"("comebackJob");

-- CreateIndex
CREATE INDEX "ComebackCase_coverage_idx" ON "ComebackCase"("coverage");

-- CreateIndex
CREATE INDEX "ComebackCase_goodwillApproval_idx" ON "ComebackCase"("goodwillApproval");

-- CreateIndex
CREATE INDEX "ComebackCase_openedBy_idx" ON "ComebackCase"("openedBy");

-- CreateIndex
CREATE INDEX "FlaggedHoursEntry_shop_idx" ON "FlaggedHoursEntry"("shop");

-- CreateIndex
CREATE INDEX "FlaggedHoursEntry_technician_idx" ON "FlaggedHoursEntry"("technician");

-- CreateIndex
CREATE INDEX "FlaggedHoursEntry_job_idx" ON "FlaggedHoursEntry"("job");

-- CreateIndex
CREATE INDEX "FlaggedHoursEntry_payPeriod_idx" ON "FlaggedHoursEntry"("payPeriod");

-- CreateIndex
CREATE INDEX "JobClock_shop_idx" ON "JobClock"("shop");

-- CreateIndex
CREATE INDEX "JobClock_technician_idx" ON "JobClock"("technician");

-- CreateIndex
CREATE INDEX "JobClock_job_idx" ON "JobClock"("job");

-- CreateIndex
CREATE INDEX "JobClock_shiftClock_idx" ON "JobClock"("shiftClock");

-- CreateIndex
CREATE INDEX "PartWarrantyClaim_shop_idx" ON "PartWarrantyClaim"("shop");

-- CreateIndex
CREATE INDEX "PartWarrantyClaim_comeback_idx" ON "PartWarrantyClaim"("comeback");

-- CreateIndex
CREATE INDEX "PartWarrantyClaim_supplier_idx" ON "PartWarrantyClaim"("supplier");

-- CreateIndex
CREATE INDEX "PartWarrantyClaim_jobLine_idx" ON "PartWarrantyClaim"("jobLine");

-- CreateIndex
CREATE INDEX "PayPeriod_shop_idx" ON "PayPeriod"("shop");

-- CreateIndex
CREATE INDEX "PayPeriod_closedBy_idx" ON "PayPeriod"("closedBy");

-- CreateIndex
CREATE INDEX "PayPeriod_approvedBy_idx" ON "PayPeriod"("approvedBy");

-- CreateIndex
CREATE INDEX "ShiftClock_shop_idx" ON "ShiftClock"("shop");

-- CreateIndex
CREATE INDEX "ShiftClock_technician_idx" ON "ShiftClock"("technician");

-- CreateIndex
CREATE INDEX "TechnicianCredential_technician_idx" ON "TechnicianCredential"("technician");

-- CreateIndex
CREATE INDEX "TechnicianCredential_verifiedBy_idx" ON "TechnicianCredential"("verifiedBy");

-- CreateIndex
CREATE INDEX "TechnicianProfile_user_idx" ON "TechnicianProfile"("user");

-- CreateIndex
CREATE INDEX "TechnicianProfile_shop_idx" ON "TechnicianProfile"("shop");

-- CreateIndex
CREATE INDEX "WaitingInterval_jobClock_idx" ON "WaitingInterval"("jobClock");

-- AddForeignKey
ALTER TABLE "ClockCorrection" ADD CONSTRAINT "ClockCorrection_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClockCorrection" ADD CONSTRAINT "ClockCorrection_technician_fkey" FOREIGN KEY ("technician") REFERENCES "TechnicianProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClockCorrection" ADD CONSTRAINT "ClockCorrection_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClockCorrection" ADD CONSTRAINT "ClockCorrection_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComebackCase" ADD CONSTRAINT "ComebackCase_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComebackCase" ADD CONSTRAINT "ComebackCase_originalJob_fkey" FOREIGN KEY ("originalJob") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComebackCase" ADD CONSTRAINT "ComebackCase_comebackJob_fkey" FOREIGN KEY ("comebackJob") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComebackCase" ADD CONSTRAINT "ComebackCase_coverage_fkey" FOREIGN KEY ("coverage") REFERENCES "WarrantyCoverage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComebackCase" ADD CONSTRAINT "ComebackCase_goodwillApproval_fkey" FOREIGN KEY ("goodwillApproval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComebackCase" ADD CONSTRAINT "ComebackCase_openedBy_fkey" FOREIGN KEY ("openedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlaggedHoursEntry" ADD CONSTRAINT "FlaggedHoursEntry_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlaggedHoursEntry" ADD CONSTRAINT "FlaggedHoursEntry_technician_fkey" FOREIGN KEY ("technician") REFERENCES "TechnicianProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlaggedHoursEntry" ADD CONSTRAINT "FlaggedHoursEntry_job_fkey" FOREIGN KEY ("job") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlaggedHoursEntry" ADD CONSTRAINT "FlaggedHoursEntry_payPeriod_fkey" FOREIGN KEY ("payPeriod") REFERENCES "PayPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobClock" ADD CONSTRAINT "JobClock_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobClock" ADD CONSTRAINT "JobClock_technician_fkey" FOREIGN KEY ("technician") REFERENCES "TechnicianProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobClock" ADD CONSTRAINT "JobClock_job_fkey" FOREIGN KEY ("job") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobClock" ADD CONSTRAINT "JobClock_shiftClock_fkey" FOREIGN KEY ("shiftClock") REFERENCES "ShiftClock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartWarrantyClaim" ADD CONSTRAINT "PartWarrantyClaim_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartWarrantyClaim" ADD CONSTRAINT "PartWarrantyClaim_comeback_fkey" FOREIGN KEY ("comeback") REFERENCES "ComebackCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartWarrantyClaim" ADD CONSTRAINT "PartWarrantyClaim_supplier_fkey" FOREIGN KEY ("supplier") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartWarrantyClaim" ADD CONSTRAINT "PartWarrantyClaim_jobLine_fkey" FOREIGN KEY ("jobLine") REFERENCES "JobLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPeriod" ADD CONSTRAINT "PayPeriod_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPeriod" ADD CONSTRAINT "PayPeriod_closedBy_fkey" FOREIGN KEY ("closedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPeriod" ADD CONSTRAINT "PayPeriod_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftClock" ADD CONSTRAINT "ShiftClock_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftClock" ADD CONSTRAINT "ShiftClock_technician_fkey" FOREIGN KEY ("technician") REFERENCES "TechnicianProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianCredential" ADD CONSTRAINT "TechnicianCredential_technician_fkey" FOREIGN KEY ("technician") REFERENCES "TechnicianProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianCredential" ADD CONSTRAINT "TechnicianCredential_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianProfile" ADD CONSTRAINT "TechnicianProfile_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianProfile" ADD CONSTRAINT "TechnicianProfile_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitingInterval" ADD CONSTRAINT "WaitingInterval_jobClock_fkey" FOREIGN KEY ("jobClock") REFERENCES "JobClock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written guards (Phase 5). The database refuses what the commands must never do.
CREATE UNIQUE INDEX "FlaggedHoursEntry_once_per_event" ON "FlaggedHoursEntry" ("job", "technician", "kind", "sourceEvent");
CREATE UNIQUE INDEX "ShiftClock_one_open_per_technician" ON "ShiftClock" ("technician") WHERE "status" <> 'clocked_out';
CREATE UNIQUE INDEX "PayPeriod_shop_start_unique" ON "PayPeriod" ("shop", "startsOn");
CREATE UNIQUE INDEX "PartWarrantyClaim_number_unique" ON "PartWarrantyClaim" ("claimNumber");
CREATE UNIQUE INDEX "TechnicianProfile_user_shop_unique" ON "TechnicianProfile" ("user", "shop");
ALTER TABLE "PayPeriod" ADD CONSTRAINT "PayPeriod_ends_after_start" CHECK ("endsOn" >= "startsOn");
ALTER TABLE "JobClock" ADD CONSTRAINT "JobClock_worked_nonnegative" CHECK ("workedCentiHours" >= 0);
ALTER TABLE "FlaggedHoursEntry" ADD CONSTRAINT "FlaggedHoursEntry_sign_matches_kind" CHECK (("kind" = 'flag' AND "centiHours" >= 0) OR ("kind" = 'reversal' AND "centiHours" <= 0) OR "kind" = 'adjustment');

-- The ledger is append-only.
CREATE TRIGGER "FlaggedHoursEntry_append_only" BEFORE UPDATE OR DELETE ON "FlaggedHoursEntry" FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
CREATE TRIGGER "ClockCorrection_no_delete" BEFORE DELETE ON "ClockCorrection" FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
CREATE TRIGGER "PayPeriod_no_delete" BEFORE DELETE ON "PayPeriod" FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
CREATE TRIGGER "ComebackCase_no_delete" BEFORE DELETE ON "ComebackCase" FOR EACH ROW EXECUTE FUNCTION deny_update_delete();

-- A closed pay period takes no new entries and never reopens.
CREATE OR REPLACE FUNCTION require_open_pay_period() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE period_status text;
BEGIN
  IF NEW."payPeriod" IS NULL THEN
    RAISE EXCEPTION 'A flagged-hours entry belongs to a pay period' USING ERRCODE = '23514';
  END IF;
  SELECT "status" INTO period_status FROM "PayPeriod" WHERE "id" = NEW."payPeriod";
  IF period_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'This pay period is closed; the entry belongs in the next open period' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "FlaggedHoursEntry_open_period" BEFORE INSERT ON "FlaggedHoursEntry" FOR EACH ROW EXECUTE FUNCTION require_open_pay_period();

CREATE OR REPLACE FUNCTION pay_period_never_reopens() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'open' AND NEW."status" = 'open' THEN
    RAISE EXCEPTION 'A closed pay period cannot be reopened' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" <> 'open' AND (NEW."startsOn" IS DISTINCT FROM OLD."startsOn" OR NEW."endsOn" IS DISTINCT FROM OLD."endsOn") THEN
    RAISE EXCEPTION 'A closed pay period cannot change its dates' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PayPeriod_never_reopens" BEFORE UPDATE ON "PayPeriod" FOR EACH ROW EXECUTE FUNCTION pay_period_never_reopens();
