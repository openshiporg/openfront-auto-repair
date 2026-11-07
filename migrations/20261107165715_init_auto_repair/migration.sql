-- CreateEnum
CREATE TYPE "UserKindType" AS ENUM ('staff', 'customer_portal', 'fleet_portal', 'auditor', 'machine');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "password" TEXT NOT NULL,
    "role" TEXT,
    "kind" "UserKindType" DEFAULT 'staff',
    "title" TEXT NOT NULL DEFAULT '',
    "mfaEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "accessExpiresAt" TIMESTAMP(3),
    "onboardingStatus" TEXT DEFAULT 'not_started',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passwordResetToken" TEXT,
    "passwordResetIssuedAt" TIMESTAMP(3),
    "passwordResetRedeemedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "canSeeOtherPeople" BOOLEAN NOT NULL DEFAULT false,
    "canEditOtherPeople" BOOLEAN NOT NULL DEFAULT false,
    "canManagePeople" BOOLEAN NOT NULL DEFAULT false,
    "canManageRoles" BOOLEAN NOT NULL DEFAULT false,
    "canAccessDashboard" BOOLEAN NOT NULL DEFAULT false,
    "canManageOnboarding" BOOLEAN NOT NULL DEFAULT false,
    "canManagePayments" BOOLEAN NOT NULL DEFAULT false,
    "canIssueRefunds" BOOLEAN NOT NULL DEFAULT false,
    "canReadAudit" BOOLEAN NOT NULL DEFAULT false,
    "canManageOrganization" BOOLEAN NOT NULL DEFAULT false,
    "canManageShops" BOOLEAN NOT NULL DEFAULT false,
    "canManageIntegrations" BOOLEAN NOT NULL DEFAULT false,
    "canAccessAllShops" BOOLEAN NOT NULL DEFAULT false,
    "canManagePolicies" BOOLEAN NOT NULL DEFAULT false,
    "canPublishPolicies" BOOLEAN NOT NULL DEFAULT false,
    "canManageCustomers" BOOLEAN NOT NULL DEFAULT false,
    "canApproveMerge" BOOLEAN NOT NULL DEFAULT false,
    "canReadCustomerPII" BOOLEAN NOT NULL DEFAULT false,
    "canManageSchedule" BOOLEAN NOT NULL DEFAULT false,
    "canWriteRepairOrders" BOOLEAN NOT NULL DEFAULT false,
    "canSendEstimates" BOOLEAN NOT NULL DEFAULT false,
    "canRecordAuthorizations" BOOLEAN NOT NULL DEFAULT false,
    "canApproveReopen" BOOLEAN NOT NULL DEFAULT false,
    "canApproveRelease" BOOLEAN NOT NULL DEFAULT false,
    "canReadRepairOrders" BOOLEAN NOT NULL DEFAULT false,
    "canPerformInspections" BOOLEAN NOT NULL DEFAULT false,
    "canDiagnose" BOOLEAN NOT NULL DEFAULT false,
    "canOverrideTrustGate" BOOLEAN NOT NULL DEFAULT false,
    "canPriceJobs" BOOLEAN NOT NULL DEFAULT false,
    "canApprovePriceOverride" BOOLEAN NOT NULL DEFAULT false,
    "canApproveDiscount" BOOLEAN NOT NULL DEFAULT false,
    "canSeeCost" BOOLEAN NOT NULL DEFAULT false,
    "canManageParts" BOOLEAN NOT NULL DEFAULT false,
    "canOrderParts" BOOLEAN NOT NULL DEFAULT false,
    "canReceiveParts" BOOLEAN NOT NULL DEFAULT false,
    "canApproveSupplierInvoice" BOOLEAN NOT NULL DEFAULT false,
    "canApproveStockAdjustment" BOOLEAN NOT NULL DEFAULT false,
    "canApproveCoreWriteOff" BOOLEAN NOT NULL DEFAULT false,
    "canClockSelf" BOOLEAN NOT NULL DEFAULT false,
    "canManageTime" BOOLEAN NOT NULL DEFAULT false,
    "canApproveTime" BOOLEAN NOT NULL DEFAULT false,
    "canClosePayPeriod" BOOLEAN NOT NULL DEFAULT false,
    "canReadTechPay" BOOLEAN NOT NULL DEFAULT false,
    "canFinalizeInvoices" BOOLEAN NOT NULL DEFAULT false,
    "canTakePayments" BOOLEAN NOT NULL DEFAULT false,
    "canCloseDay" BOOLEAN NOT NULL DEFAULT false,
    "canApproveRefund" BOOLEAN NOT NULL DEFAULT false,
    "canApproveWriteOff" BOOLEAN NOT NULL DEFAULT false,
    "canApproveCredit" BOOLEAN NOT NULL DEFAULT false,
    "canApproveCreditMemo" BOOLEAN NOT NULL DEFAULT false,
    "canReadFinancials" BOOLEAN NOT NULL DEFAULT false,
    "canManageComebacks" BOOLEAN NOT NULL DEFAULT false,
    "canApproveGoodwill" BOOLEAN NOT NULL DEFAULT false,
    "canMessageCustomers" BOOLEAN NOT NULL DEFAULT false,
    "canManageCampaigns" BOOLEAN NOT NULL DEFAULT false,
    "canManageTireRegistrations" BOOLEAN NOT NULL DEFAULT false,
    "canManageAgents" BOOLEAN NOT NULL DEFAULT false,
    "canConfirmProposals" BOOLEAN NOT NULL DEFAULT false,
    "canApproveAgentAutonomy" BOOLEAN NOT NULL DEFAULT false,
    "canReadReports" BOOLEAN NOT NULL DEFAULT false,
    "canBreakGlass" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthApp" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL DEFAULT '',
    "clientSecret" TEXT NOT NULL DEFAULT '',
    "tokenEndpointAuthMethod" TEXT DEFAULT 'client_secret_post',
    "redirectUris" JSONB DEFAULT '[]',
    "scopes" JSONB DEFAULT '["mcp:read","mcp:write"]',
    "webhookUrl" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'active',
    "installUrl" TEXT NOT NULL DEFAULT '',
    "uninstallUrl" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB DEFAULT '{}',
    "developerEmail" TEXT NOT NULL DEFAULT '',
    "privacyPolicyUrl" TEXT NOT NULL DEFAULT '',
    "termsOfServiceUrl" TEXT NOT NULL DEFAULT '',
    "supportUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthToken" (
    "id" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL,
    "token" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL DEFAULT '',
    "user" TEXT,
    "scopes" JSONB DEFAULT '[]',
    "redirectUri" TEXT NOT NULL DEFAULT '',
    "resource" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "isRevoked" TEXT DEFAULT 'false',
    "authorizationCode" TEXT NOT NULL DEFAULT '',
    "refreshToken" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "codeChallenge" TEXT NOT NULL DEFAULT '',
    "codeChallengeMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentIdentity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'llm_agent',
    "modelRef" TEXT NOT NULL DEFAULT '',
    "owner" TEXT,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "oauthApp" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalDecision" (
    "id" TEXT NOT NULL,
    "request" TEXT,
    "decidedBy" TEXT,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalPolicy" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "requiredPermission" TEXT NOT NULL DEFAULT '',
    "minApprovals" INTEGER DEFAULT 1,
    "thresholdMinor" BIGINT,
    "expiresAfterMinutes" INTEGER DEFAULT 1440,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "shop" TEXT,
    "targetList" TEXT NOT NULL DEFAULT '',
    "targetId" TEXT NOT NULL DEFAULT '',
    "amountMinor" BIGINT,
    "payload" JSONB,
    "payloadHash" TEXT NOT NULL DEFAULT '',
    "requiredPermission" TEXT NOT NULL DEFAULT '',
    "requestedBy" TEXT,
    "requestedByAgent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "eventKey" TEXT NOT NULL DEFAULT '',
    "eventType" TEXT NOT NULL DEFAULT '',
    "entityType" TEXT NOT NULL DEFAULT '',
    "entityId" TEXT NOT NULL DEFAULT '',
    "actorUser" TEXT,
    "actorAgent" TEXT,
    "approver" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "requestId" TEXT NOT NULL DEFAULT '',
    "prevHash" TEXT NOT NULL DEFAULT '',
    "hash" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bay" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'general',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandReceipt" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "command" TEXT NOT NULL DEFAULT '',
    "principalKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "requestParams" JSONB,
    "responseCode" TEXT NOT NULL DEFAULT '',
    "responseBody" JSONB,
    "recoveryPoint" TEXT NOT NULL DEFAULT 'completed',
    "completedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommandReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'other',
    "visibility" TEXT NOT NULL DEFAULT 'staff',
    "storageKey" TEXT NOT NULL DEFAULT '',
    "sha256" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT '',
    "bytes" INTEGER,
    "documentVersion" INTEGER DEFAULT 1,
    "supersedes" TEXT,
    "retentionUntil" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lease" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL DEFAULT '',
    "fencingToken" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineCredential" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "hashedSecret" TEXT NOT NULL DEFAULT '',
    "scopes" JSONB DEFAULT '[]',
    "agent" TEXT,
    "shop" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MachineCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipient" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "template" TEXT NOT NULL DEFAULT '',
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obligation" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "kind" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL DEFAULT '',
    "subjectId" TEXT NOT NULL DEFAULT '',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "owner" TEXT,
    "ownerRole" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "evidence" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationSettings" (
    "id" INTEGER NOT NULL,
    "legalName" TEXT NOT NULL DEFAULT 'Openfront Auto Repair',
    "displayName" TEXT NOT NULL DEFAULT 'Openfront Auto Repair',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "defaultTimeZone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "customerSharing" TEXT NOT NULL DEFAULT 'shared_all_shops',
    "retentionYearsOverride" INTEGER,
    "strictAgentOwnerSoD" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL DEFAULT '',
    "aggregateType" TEXT NOT NULL DEFAULT '',
    "aggregateId" TEXT NOT NULL DEFAULT '',
    "dedupeKey" TEXT NOT NULL DEFAULT '',
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT NOT NULL DEFAULT '',
    "leaseExpiresAt" TIMESTAMP(3),
    "fencingToken" INTEGER DEFAULT 0,
    "lastError" TEXT NOT NULL DEFAULT '',
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecretBox" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "ciphertext" TEXT NOT NULL DEFAULT '',
    "iv" TEXT NOT NULL DEFAULT '',
    "authTag" TEXT NOT NULL DEFAULT '',
    "keyVersion" INTEGER DEFAULT 1,
    "rotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecretBox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "nextValue" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "legalName" TEXT NOT NULL DEFAULT '',
    "addressLine1" TEXT NOT NULL DEFAULT '',
    "addressLine2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'US',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "timeZone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "registrations" JSONB DEFAULT '{}',
    "calendar" TEXT,
    "publicProfile" JSONB DEFAULT '{}',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopCalendar" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "weeklyHours" JSONB DEFAULT '[]',
    "coverageThrough" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopCalendarException" (
    "id" TEXT NOT NULL,
    "calendar" TEXT,
    "date" DATE NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT true,
    "open" TEXT NOT NULL DEFAULT '',
    "close" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopCalendarException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopMembership" (
    "id" TEXT NOT NULL,
    "user" TEXT,
    "shop" TEXT,
    "role" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerSchedule" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT '',
    "intervalSeconds" INTEGER,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'idle',
    "leaseKey" TEXT NOT NULL DEFAULT '',
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AgentIdentity_shops" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthApp_clientId_key" ON "OAuthApp"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_token_key" ON "OAuthToken"("token");

-- CreateIndex
CREATE INDEX "OAuthToken_clientId_idx" ON "OAuthToken"("clientId");

-- CreateIndex
CREATE INDEX "OAuthToken_user_idx" ON "OAuthToken"("user");

-- CreateIndex
CREATE UNIQUE INDEX "AgentIdentity_name_key" ON "AgentIdentity"("name");

-- CreateIndex
CREATE INDEX "AgentIdentity_owner_idx" ON "AgentIdentity"("owner");

-- CreateIndex
CREATE INDEX "AgentIdentity_oauthApp_idx" ON "AgentIdentity"("oauthApp");

-- CreateIndex
CREATE INDEX "ApprovalDecision_request_idx" ON "ApprovalDecision"("request");

-- CreateIndex
CREATE INDEX "ApprovalDecision_decidedBy_idx" ON "ApprovalDecision"("decidedBy");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalPolicy_action_key" ON "ApprovalPolicy"("action");

-- CreateIndex
CREATE INDEX "ApprovalRequest_action_idx" ON "ApprovalRequest"("action");

-- CreateIndex
CREATE INDEX "ApprovalRequest_shop_idx" ON "ApprovalRequest"("shop");

-- CreateIndex
CREATE INDEX "ApprovalRequest_targetId_idx" ON "ApprovalRequest"("targetId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_requestedBy_idx" ON "ApprovalRequest"("requestedBy");

-- CreateIndex
CREATE INDEX "ApprovalRequest_requestedByAgent_idx" ON "ApprovalRequest"("requestedByAgent");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_seq_key" ON "AuditEvent"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_eventKey_key" ON "AuditEvent"("eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_hash_key" ON "AuditEvent"("hash");

-- CreateIndex
CREATE INDEX "AuditEvent_eventType_idx" ON "AuditEvent"("eventType");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_idx" ON "AuditEvent"("entityType");

-- CreateIndex
CREATE INDEX "AuditEvent_entityId_idx" ON "AuditEvent"("entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUser_idx" ON "AuditEvent"("actorUser");

-- CreateIndex
CREATE INDEX "AuditEvent_actorAgent_idx" ON "AuditEvent"("actorAgent");

-- CreateIndex
CREATE INDEX "AuditEvent_approver_idx" ON "AuditEvent"("approver");

-- CreateIndex
CREATE INDEX "Bay_shop_idx" ON "Bay"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Bay_shop_code_key" ON "Bay"("shop", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CommandReceipt_idempotencyKey_key" ON "CommandReceipt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Document_shop_idx" ON "Document"("shop");

-- CreateIndex
CREATE INDEX "Document_supersedes_idx" ON "Document"("supersedes");

-- CreateIndex
CREATE UNIQUE INDEX "Lease_key_key" ON "Lease"("key");

-- CreateIndex
CREATE INDEX "MachineCredential_agent_idx" ON "MachineCredential"("agent");

-- CreateIndex
CREATE INDEX "MachineCredential_shop_idx" ON "MachineCredential"("shop");

-- CreateIndex
CREATE INDEX "Notification_recipient_idx" ON "Notification"("recipient");

-- CreateIndex
CREATE INDEX "Obligation_shop_idx" ON "Obligation"("shop");

-- CreateIndex
CREATE INDEX "Obligation_subjectId_idx" ON "Obligation"("subjectId");

-- CreateIndex
CREATE INDEX "Obligation_owner_idx" ON "Obligation"("owner");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_dedupeKey_key" ON "OutboxEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "OutboxEvent_topic_idx" ON "OutboxEvent"("topic");

-- CreateIndex
CREATE INDEX "OutboxEvent_aggregateId_idx" ON "OutboxEvent"("aggregateId");

-- CreateIndex
CREATE UNIQUE INDEX "SecretBox_key_key" ON "SecretBox"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Sequence_key_key" ON "Sequence"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_code_key" ON "Shop"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_calendar_key" ON "Shop"("calendar");

-- CreateIndex
CREATE INDEX "ShopCalendarException_calendar_idx" ON "ShopCalendarException"("calendar");

-- CreateIndex
CREATE UNIQUE INDEX "ShopCalendarException_calendar_date_key" ON "ShopCalendarException"("calendar", "date");

-- CreateIndex
CREATE INDEX "ShopMembership_user_idx" ON "ShopMembership"("user");

-- CreateIndex
CREATE INDEX "ShopMembership_shop_idx" ON "ShopMembership"("shop");

-- CreateIndex
CREATE INDEX "ShopMembership_role_idx" ON "ShopMembership"("role");

-- CreateIndex
CREATE UNIQUE INDEX "ShopMembership_user_shop_key" ON "ShopMembership"("user", "shop");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerSchedule_kind_key" ON "WorkerSchedule"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "_AgentIdentity_shops_AB_unique" ON "_AgentIdentity_shops"("A", "B");

-- CreateIndex
CREATE INDEX "_AgentIdentity_shops_B_index" ON "_AgentIdentity_shops"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_role_fkey" FOREIGN KEY ("role") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentIdentity" ADD CONSTRAINT "AgentIdentity_owner_fkey" FOREIGN KEY ("owner") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentIdentity" ADD CONSTRAINT "AgentIdentity_oauthApp_fkey" FOREIGN KEY ("oauthApp") REFERENCES "OAuthApp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_request_fkey" FOREIGN KEY ("request") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedByAgent_fkey" FOREIGN KEY ("requestedByAgent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUser_fkey" FOREIGN KEY ("actorUser") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorAgent_fkey" FOREIGN KEY ("actorAgent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_approver_fkey" FOREIGN KEY ("approver") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bay" ADD CONSTRAINT "Bay_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_supersedes_fkey" FOREIGN KEY ("supersedes") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineCredential" ADD CONSTRAINT "MachineCredential_agent_fkey" FOREIGN KEY ("agent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineCredential" ADD CONSTRAINT "MachineCredential_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipient_fkey" FOREIGN KEY ("recipient") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_owner_fkey" FOREIGN KEY ("owner") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_calendar_fkey" FOREIGN KEY ("calendar") REFERENCES "ShopCalendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopCalendarException" ADD CONSTRAINT "ShopCalendarException_calendar_fkey" FOREIGN KEY ("calendar") REFERENCES "ShopCalendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopMembership" ADD CONSTRAINT "ShopMembership_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopMembership" ADD CONSTRAINT "ShopMembership_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopMembership" ADD CONSTRAINT "ShopMembership_role_fkey" FOREIGN KEY ("role") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AgentIdentity_shops" ADD CONSTRAINT "_AgentIdentity_shops_A_fkey" FOREIGN KEY ("A") REFERENCES "AgentIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AgentIdentity_shops" ADD CONSTRAINT "_AgentIdentity_shops_B_fkey" FOREIGN KEY ("B") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Auto repair guards (SCHEMA §20, G8) ─────────────────────────────────────────────
-- Immutable history: audit events and approval decisions can never be updated or deleted,
-- whatever the application does. Corrections are new events. Later phases attach the same
-- function to their immutable tables (estimate versions, authorizations, stock movements…).
CREATE OR REPLACE FUNCTION deny_update_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER "AuditEvent_append_only" BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
CREATE TRIGGER "ApprovalDecision_append_only" BEFORE UPDATE OR DELETE ON "ApprovalDecision"
  FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
CREATE TRIGGER "AuditEvent_no_truncate" BEFORE TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION deny_update_delete();
CREATE TRIGGER "ApprovalDecision_no_truncate" BEFORE TRUNCATE ON "ApprovalDecision"
  FOR EACH STATEMENT EXECUTE FUNCTION deny_update_delete();

-- Agents never approve and never record a customer authorization (I-A3, I-R3). The command
-- layer sets app.actor_kind for the transaction; Phase 2 attaches this to "Authorization".
CREATE OR REPLACE FUNCTION deny_agent_authorization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.actor_kind', true) = 'agent' THEN
    RAISE EXCEPTION 'agents cannot write % rows', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ApprovalDecision_no_agent" BEFORE INSERT ON "ApprovalDecision"
  FOR EACH ROW EXECUTE FUNCTION deny_agent_authorization();

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_seq_positive" CHECK (seq > 0);
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_hash_format" CHECK (hash ~ '^[0-9a-f]{64}$' AND "prevHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_attempts_nonnegative" CHECK (attempts >= 0);
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_fencing_positive" CHECK ("fencingToken" > 0);
ALTER TABLE "Sequence" ADD CONSTRAINT "Sequence_next_positive" CHECK ("nextValue" > 0);
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_min_approvals" CHECK ("minApprovals" >= 1);
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_threshold_nonnegative" CHECK ("thresholdMinor" IS NULL OR "thresholdMinor" >= 0);
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_version_nonnegative" CHECK (version >= 0);
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_amount_nonnegative" CHECK ("amountMinor" IS NULL OR "amountMinor" >= 0);
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_code_format" CHECK (code ~ '^[A-Z]{2,5}$');
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_version_nonnegative" CHECK (version >= 0);
ALTER TABLE "ShopCalendarException" ADD CONSTRAINT "ShopCalendarException_hours" CHECK (closed OR (open ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND close ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND open < close));
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_version_nonnegative" CHECK (version >= 0);

-- At most one default shop per user.
CREATE UNIQUE INDEX "ShopMembership_one_default" ON "ShopMembership" ("user") WHERE "isDefault" AND status = 'active';

-- Hot paths and due-work indexes for the workers.
CREATE INDEX "OutboxEvent_due_idx" ON "OutboxEvent" ("nextAttemptAt", "createdAt") WHERE status IN ('pending', 'failed');
CREATE INDEX "OutboxEvent_leased_idx" ON "OutboxEvent" ("leaseExpiresAt") WHERE status = 'leased';
CREATE INDEX "Obligation_due_idx" ON "Obligation" (status, "dueAt");
CREATE INDEX "AuditEvent_entity_idx" ON "AuditEvent" ("entityType", "entityId", at);
