-- DropIndex
DROP INDEX "FlaggedHoursEntry_once_per_event";

-- DropIndex
DROP INDEX "PartWarrantyClaim_number_unique";

-- DropIndex
DROP INDEX "PayPeriod_shop_start_unique";

-- DropIndex
DROP INDEX "TechnicianProfile_user_shop_unique";

-- CreateTable
CREATE TABLE "CallRecord" (
    "id" TEXT NOT NULL,
    "thread" TEXT,
    "shop" TEXT,
    "customer" TEXT,
    "contact" TEXT,
    "repairOrder" TEXT,
    "direction" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "minutes" INTEGER,
    "recordedBy" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "audienceRule" JSONB DEFAULT '{}',
    "messageText" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignExport" (
    "id" TEXT NOT NULL,
    "campaign" TEXT,
    "recipientCount" INTEGER DEFAULT 0,
    "excludedCount" INTEGER DEFAULT 0,
    "excluded" JSONB DEFAULT '[]',
    "exportedBy" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "export" TEXT,
    "campaign" TEXT,
    "shop" TEXT,
    "customer" TEXT,
    "contact" TEXT,
    "channel" TEXT NOT NULL,
    "consent" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "thread" TEXT,
    "shop" TEXT,
    "customer" TEXT,
    "contact" TEXT,
    "repairOrder" TEXT,
    "direction" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "templateCode" TEXT NOT NULL DEFAULT '',
    "templateVersion" INTEGER DEFAULT 0,
    "body" TEXT NOT NULL DEFAULT '',
    "providerMessageId" TEXT,
    "keyword" TEXT NOT NULL DEFAULT '',
    "reviewState" TEXT NOT NULL DEFAULT 'none',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "consent" TEXT,
    "recordedBy" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "version" INTEGER DEFAULT 1,
    "active" TEXT NOT NULL DEFAULT 'active',
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageThread" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "customer" TEXT,
    "vehicle" TEXT,
    "repairOrder" TEXT,
    "threadKey" TEXT NOT NULL DEFAULT '',
    "lastMessageAt" TIMESTAMP(3),
    "unreadCount" INTEGER DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "customer" TEXT,
    "vehicle" TEXT,
    "repairOrder" TEXT,
    "sourceJob" TEXT,
    "sourceJobKey" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "urgency" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "priceSnapshotMinor" BIGINT NOT NULL DEFAULT 0,
    "evidence" JSONB,
    "declinedAt" TIMESTAMP(3),
    "deferUntil" TIMESTAMP(3),
    "deferMiles" INTEGER,
    "contactedCount" INTEGER DEFAULT 0,
    "lastContactedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "dismissedReason" TEXT NOT NULL DEFAULT '',
    "convertedJob" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewRequest" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "repairOrder" TEXT,
    "repairOrderKey" TEXT NOT NULL DEFAULT '',
    "customer" TEXT,
    "channel" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "askedBy" TEXT,

    CONSTRAINT "ReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceReminder" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "vehicle" TEXT,
    "customer" TEXT,
    "kind" TEXT NOT NULL,
    "cycleKey" TEXT NOT NULL DEFAULT '',
    "lastServiceJob" TEXT,
    "dueOn" DATE,
    "dueAtOdometer" INTEGER,
    "projectedDueOn" DATE,
    "status" TEXT NOT NULL DEFAULT 'contacted',
    "contactChannel" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "contactedAt" TIMESTAMP(3),
    "contactedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CallRecord_thread_idx" ON "CallRecord"("thread");

-- CreateIndex
CREATE INDEX "CallRecord_shop_idx" ON "CallRecord"("shop");

-- CreateIndex
CREATE INDEX "CallRecord_customer_idx" ON "CallRecord"("customer");

-- CreateIndex
CREATE INDEX "CallRecord_contact_idx" ON "CallRecord"("contact");

-- CreateIndex
CREATE INDEX "CallRecord_repairOrder_idx" ON "CallRecord"("repairOrder");

-- CreateIndex
CREATE INDEX "CallRecord_recordedBy_idx" ON "CallRecord"("recordedBy");

-- CreateIndex
CREATE INDEX "Campaign_shop_idx" ON "Campaign"("shop");

-- CreateIndex
CREATE INDEX "Campaign_createdBy_idx" ON "Campaign"("createdBy");

-- CreateIndex
CREATE INDEX "CampaignExport_campaign_idx" ON "CampaignExport"("campaign");

-- CreateIndex
CREATE INDEX "CampaignExport_exportedBy_idx" ON "CampaignExport"("exportedBy");

-- CreateIndex
CREATE INDEX "CampaignRecipient_export_idx" ON "CampaignRecipient"("export");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaign_idx" ON "CampaignRecipient"("campaign");

-- CreateIndex
CREATE INDEX "CampaignRecipient_shop_idx" ON "CampaignRecipient"("shop");

-- CreateIndex
CREATE INDEX "CampaignRecipient_customer_idx" ON "CampaignRecipient"("customer");

-- CreateIndex
CREATE INDEX "CampaignRecipient_contact_idx" ON "CampaignRecipient"("contact");

-- CreateIndex
CREATE INDEX "CampaignRecipient_consent_idx" ON "CampaignRecipient"("consent");

-- CreateIndex
CREATE UNIQUE INDEX "Message_providerMessageId_key" ON "Message"("providerMessageId");

-- CreateIndex
CREATE INDEX "Message_thread_idx" ON "Message"("thread");

-- CreateIndex
CREATE INDEX "Message_shop_idx" ON "Message"("shop");

-- CreateIndex
CREATE INDEX "Message_customer_idx" ON "Message"("customer");

-- CreateIndex
CREATE INDEX "Message_contact_idx" ON "Message"("contact");

-- CreateIndex
CREATE INDEX "Message_repairOrder_idx" ON "Message"("repairOrder");

-- CreateIndex
CREATE INDEX "Message_reviewedBy_idx" ON "Message"("reviewedBy");

-- CreateIndex
CREATE INDEX "Message_consent_idx" ON "Message"("consent");

-- CreateIndex
CREATE INDEX "Message_recordedBy_idx" ON "Message"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_code_key" ON "MessageTemplate"("code");

-- CreateIndex
CREATE INDEX "MessageTemplate_updatedBy_idx" ON "MessageTemplate"("updatedBy");

-- CreateIndex
CREATE UNIQUE INDEX "MessageThread_threadKey_key" ON "MessageThread"("threadKey");

-- CreateIndex
CREATE INDEX "MessageThread_shop_idx" ON "MessageThread"("shop");

-- CreateIndex
CREATE INDEX "MessageThread_customer_idx" ON "MessageThread"("customer");

-- CreateIndex
CREATE INDEX "MessageThread_vehicle_idx" ON "MessageThread"("vehicle");

-- CreateIndex
CREATE INDEX "MessageThread_repairOrder_idx" ON "MessageThread"("repairOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_sourceJobKey_key" ON "Recommendation"("sourceJobKey");

-- CreateIndex
CREATE INDEX "Recommendation_shop_idx" ON "Recommendation"("shop");

-- CreateIndex
CREATE INDEX "Recommendation_customer_idx" ON "Recommendation"("customer");

-- CreateIndex
CREATE INDEX "Recommendation_vehicle_idx" ON "Recommendation"("vehicle");

-- CreateIndex
CREATE INDEX "Recommendation_repairOrder_idx" ON "Recommendation"("repairOrder");

-- CreateIndex
CREATE INDEX "Recommendation_sourceJob_idx" ON "Recommendation"("sourceJob");

-- CreateIndex
CREATE INDEX "Recommendation_convertedJob_idx" ON "Recommendation"("convertedJob");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRequest_repairOrderKey_key" ON "ReviewRequest"("repairOrderKey");

-- CreateIndex
CREATE INDEX "ReviewRequest_shop_idx" ON "ReviewRequest"("shop");

-- CreateIndex
CREATE INDEX "ReviewRequest_repairOrder_idx" ON "ReviewRequest"("repairOrder");

-- CreateIndex
CREATE INDEX "ReviewRequest_customer_idx" ON "ReviewRequest"("customer");

-- CreateIndex
CREATE INDEX "ReviewRequest_askedBy_idx" ON "ReviewRequest"("askedBy");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceReminder_cycleKey_key" ON "ServiceReminder"("cycleKey");

-- CreateIndex
CREATE INDEX "ServiceReminder_shop_idx" ON "ServiceReminder"("shop");

-- CreateIndex
CREATE INDEX "ServiceReminder_vehicle_idx" ON "ServiceReminder"("vehicle");

-- CreateIndex
CREATE INDEX "ServiceReminder_customer_idx" ON "ServiceReminder"("customer");

-- CreateIndex
CREATE INDEX "ServiceReminder_lastServiceJob_idx" ON "ServiceReminder"("lastServiceJob");

-- CreateIndex
CREATE INDEX "ServiceReminder_contactedBy_idx" ON "ServiceReminder"("contactedBy");

-- AddForeignKey
ALTER TABLE "CallRecord" ADD CONSTRAINT "CallRecord_thread_fkey" FOREIGN KEY ("thread") REFERENCES "MessageThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRecord" ADD CONSTRAINT "CallRecord_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRecord" ADD CONSTRAINT "CallRecord_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRecord" ADD CONSTRAINT "CallRecord_contact_fkey" FOREIGN KEY ("contact") REFERENCES "CustomerContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRecord" ADD CONSTRAINT "CallRecord_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRecord" ADD CONSTRAINT "CallRecord_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignExport" ADD CONSTRAINT "CampaignExport_campaign_fkey" FOREIGN KEY ("campaign") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignExport" ADD CONSTRAINT "CampaignExport_exportedBy_fkey" FOREIGN KEY ("exportedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_export_fkey" FOREIGN KEY ("export") REFERENCES "CampaignExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaign_fkey" FOREIGN KEY ("campaign") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_contact_fkey" FOREIGN KEY ("contact") REFERENCES "CustomerContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_consent_fkey" FOREIGN KEY ("consent") REFERENCES "ContactConsent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_thread_fkey" FOREIGN KEY ("thread") REFERENCES "MessageThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_contact_fkey" FOREIGN KEY ("contact") REFERENCES "CustomerContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_consent_fkey" FOREIGN KEY ("consent") REFERENCES "ContactConsent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_vehicle_fkey" FOREIGN KEY ("vehicle") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_vehicle_fkey" FOREIGN KEY ("vehicle") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_sourceJob_fkey" FOREIGN KEY ("sourceJob") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_convertedJob_fkey" FOREIGN KEY ("convertedJob") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_askedBy_fkey" FOREIGN KEY ("askedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceReminder" ADD CONSTRAINT "ServiceReminder_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceReminder" ADD CONSTRAINT "ServiceReminder_vehicle_fkey" FOREIGN KEY ("vehicle") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceReminder" ADD CONSTRAINT "ServiceReminder_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceReminder" ADD CONSTRAINT "ServiceReminder_lastServiceJob_fkey" FOREIGN KEY ("lastServiceJob") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceReminder" ADD CONSTRAINT "ServiceReminder_contactedBy_fkey" FOREIGN KEY ("contactedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Phase 7 guards ─────────────────────────────────────────────────────────────
-- Calls, campaign exports and who was on them never change once written.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['CallRecord', 'CampaignExport', 'CampaignRecipient', 'ReviewRequest'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION deny_update_delete()', t || '_append_only', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION deny_update_delete()', t || '_no_truncate', t);
  END LOOP;
END $$;

-- A message is a record: only its review bookkeeping may change, and it is never deleted.
CREATE OR REPLACE FUNCTION message_review_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Message % is a record and cannot be deleted', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - 'reviewState' - 'reviewedAt' - 'reviewedBy') IS DISTINCT FROM (to_jsonb(OLD) - 'reviewState' - 'reviewedAt' - 'reviewedBy') THEN
    RAISE EXCEPTION 'Message % is a record; only its review state may change', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Message_record_only" BEFORE UPDATE OR DELETE ON "Message" FOR EACH ROW EXECUTE FUNCTION message_review_only();

-- Marketing needs consent: the latest event on the contact for that channel must be a grant (written).
CREATE OR REPLACE FUNCTION marketing_allowed(p_contact text, p_channel text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE((
    SELECT "action" = 'granted' AND "writtenConsent"
    FROM "ContactConsent"
    WHERE "contact" = p_contact AND "channel" = p_channel AND "purpose" IN ('marketing', 'all')
    ORDER BY "at" DESC, "id" DESC LIMIT 1
  ), false)
$$;

CREATE OR REPLACE FUNCTION require_marketing_consent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ok boolean;
BEGIN
  IF TG_TABLE_NAME = 'CampaignRecipient' THEN
    ok := NEW."contact" IS NOT NULL AND marketing_allowed(NEW."contact", NEW."channel");
  ELSE
    IF NEW."purpose" <> 'marketing' OR NEW."direction" <> 'outbound' THEN RETURN NEW; END IF;
    IF NEW."contact" IS NOT NULL THEN
      ok := marketing_allowed(NEW."contact", NEW."channel");
    ELSE
      ok := EXISTS (SELECT 1 FROM "CustomerContact" c WHERE c."customer" = NEW."customer" AND marketing_allowed(c."id", NEW."channel"));
    END IF;
  END IF;
  IF NOT ok THEN
    RAISE EXCEPTION 'Marketing needs the customer''s consent on file (written)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "CampaignRecipient_marketing_consent" BEFORE INSERT ON "CampaignRecipient" FOR EACH ROW EXECUTE FUNCTION require_marketing_consent();
CREATE TRIGGER "Message_marketing_consent" BEFORE INSERT ON "Message" FOR EACH ROW EXECUTE FUNCTION require_marketing_consent();

-- Only the wording a message may carry.
ALTER TABLE "Message" ADD CONSTRAINT "Message_inbound_source" CHECK (("source" = 'inbound_webhook') = ("direction" = 'inbound') OR "source" = 'staff_log');
