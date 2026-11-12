-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "addressesHypothesis" TEXT;

-- CreateTable
CREATE TABLE "AgentProposal" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "run" TEXT,
    "agent" TEXT,
    "shop" TEXT,
    "repairOrder" TEXT,
    "invokedBy" TEXT,
    "actionClass" TEXT NOT NULL DEFAULT '',
    "plan" JSONB DEFAULT '[]',
    "readSet" JSONB DEFAULT '[]',
    "stepIndex" INTEGER DEFAULT 0,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "autoConfirmedByPolicy" TEXT,
    "result" JSONB,
    "failure" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'drafted',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "agent" TEXT,
    "shop" TEXT,
    "invokedBy" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'dashboard_chat',
    "adapter" TEXT NOT NULL DEFAULT 'manual',
    "inputSummary" TEXT NOT NULL DEFAULT '',
    "toolCalls" JSONB DEFAULT '[]',
    "tokens" INTEGER DEFAULT 0,
    "startedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentToolGrant" (
    "id" TEXT NOT NULL,
    "agent" TEXT,
    "scope" TEXT NOT NULL,
    "limits" JSONB DEFAULT '{}',
    "grantedBy" TEXT,
    "approval" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentToolGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceTask" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "agent" TEXT,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "target" JSONB DEFAULT '{}',
    "script" TEXT NOT NULL DEFAULT '',
    "call" TEXT,
    "extracted" JSONB,
    "proposal" TEXT,
    "createdBy" TEXT,
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'queued',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosisHypothesis" (
    "id" TEXT NOT NULL,
    "session" TEXT,
    "cause" TEXT NOT NULL DEFAULT '',
    "confidence" DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
    "rank" INTEGER DEFAULT 0,
    "evidence" JSONB DEFAULT '[]',
    "sources" JSONB DEFAULT '[]',
    "agentRun" TEXT,
    "enteredBy" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'staff',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosisHypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosisSession" (
    "id" TEXT NOT NULL,
    "shop" TEXT,
    "repairOrder" TEXT,
    "concern" TEXT,
    "diagnosisJob" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "symptoms" JSONB DEFAULT '[]',
    "dtcs" JSONB DEFAULT '[]',
    "topHypothesis" TEXT,
    "confidence" DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
    "override" JSONB,
    "openedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosisSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosisTest" (
    "id" TEXT NOT NULL,
    "session" TEXT,
    "hypothesis" TEXT,
    "procedure" TEXT NOT NULL DEFAULT '',
    "expected" TEXT NOT NULL DEFAULT '',
    "result" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL,
    "performedBy" TEXT,
    "at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosisTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentProposal_run_idx" ON "AgentProposal"("run");

-- CreateIndex
CREATE INDEX "AgentProposal_agent_idx" ON "AgentProposal"("agent");

-- CreateIndex
CREATE INDEX "AgentProposal_shop_idx" ON "AgentProposal"("shop");

-- CreateIndex
CREATE INDEX "AgentProposal_repairOrder_idx" ON "AgentProposal"("repairOrder");

-- CreateIndex
CREATE INDEX "AgentProposal_invokedBy_idx" ON "AgentProposal"("invokedBy");

-- CreateIndex
CREATE INDEX "AgentProposal_actionClass_idx" ON "AgentProposal"("actionClass");

-- CreateIndex
CREATE INDEX "AgentProposal_confirmedBy_idx" ON "AgentProposal"("confirmedBy");

-- CreateIndex
CREATE INDEX "AgentProposal_autoConfirmedByPolicy_idx" ON "AgentProposal"("autoConfirmedByPolicy");

-- CreateIndex
CREATE INDEX "AgentRun_agent_idx" ON "AgentRun"("agent");

-- CreateIndex
CREATE INDEX "AgentRun_shop_idx" ON "AgentRun"("shop");

-- CreateIndex
CREATE INDEX "AgentRun_invokedBy_idx" ON "AgentRun"("invokedBy");

-- CreateIndex
CREATE INDEX "AgentToolGrant_agent_idx" ON "AgentToolGrant"("agent");

-- CreateIndex
CREATE INDEX "AgentToolGrant_grantedBy_idx" ON "AgentToolGrant"("grantedBy");

-- CreateIndex
CREATE INDEX "AgentToolGrant_approval_idx" ON "AgentToolGrant"("approval");

-- CreateIndex
CREATE INDEX "VoiceTask_shop_idx" ON "VoiceTask"("shop");

-- CreateIndex
CREATE INDEX "VoiceTask_agent_idx" ON "VoiceTask"("agent");

-- CreateIndex
CREATE INDEX "VoiceTask_call_idx" ON "VoiceTask"("call");

-- CreateIndex
CREATE INDEX "VoiceTask_proposal_idx" ON "VoiceTask"("proposal");

-- CreateIndex
CREATE INDEX "VoiceTask_createdBy_idx" ON "VoiceTask"("createdBy");

-- CreateIndex
CREATE INDEX "VoiceTask_completedBy_idx" ON "VoiceTask"("completedBy");

-- CreateIndex
CREATE INDEX "DiagnosisHypothesis_session_idx" ON "DiagnosisHypothesis"("session");

-- CreateIndex
CREATE INDEX "DiagnosisHypothesis_agentRun_idx" ON "DiagnosisHypothesis"("agentRun");

-- CreateIndex
CREATE INDEX "DiagnosisHypothesis_enteredBy_idx" ON "DiagnosisHypothesis"("enteredBy");

-- CreateIndex
CREATE INDEX "DiagnosisSession_shop_idx" ON "DiagnosisSession"("shop");

-- CreateIndex
CREATE INDEX "DiagnosisSession_repairOrder_idx" ON "DiagnosisSession"("repairOrder");

-- CreateIndex
CREATE INDEX "DiagnosisSession_concern_idx" ON "DiagnosisSession"("concern");

-- CreateIndex
CREATE INDEX "DiagnosisSession_diagnosisJob_idx" ON "DiagnosisSession"("diagnosisJob");

-- CreateIndex
CREATE INDEX "DiagnosisSession_topHypothesis_idx" ON "DiagnosisSession"("topHypothesis");

-- CreateIndex
CREATE INDEX "DiagnosisSession_openedBy_idx" ON "DiagnosisSession"("openedBy");

-- CreateIndex
CREATE INDEX "DiagnosisTest_session_idx" ON "DiagnosisTest"("session");

-- CreateIndex
CREATE INDEX "DiagnosisTest_hypothesis_idx" ON "DiagnosisTest"("hypothesis");

-- CreateIndex
CREATE INDEX "DiagnosisTest_performedBy_idx" ON "DiagnosisTest"("performedBy");

-- CreateIndex
CREATE INDEX "Job_addressesHypothesis_idx" ON "Job"("addressesHypothesis");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_addressesHypothesis_fkey" FOREIGN KEY ("addressesHypothesis") REFERENCES "DiagnosisHypothesis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProposal" ADD CONSTRAINT "AgentProposal_run_fkey" FOREIGN KEY ("run") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProposal" ADD CONSTRAINT "AgentProposal_agent_fkey" FOREIGN KEY ("agent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProposal" ADD CONSTRAINT "AgentProposal_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProposal" ADD CONSTRAINT "AgentProposal_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProposal" ADD CONSTRAINT "AgentProposal_invokedBy_fkey" FOREIGN KEY ("invokedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProposal" ADD CONSTRAINT "AgentProposal_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProposal" ADD CONSTRAINT "AgentProposal_autoConfirmedByPolicy_fkey" FOREIGN KEY ("autoConfirmedByPolicy") REFERENCES "ShopPolicyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agent_fkey" FOREIGN KEY ("agent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_invokedBy_fkey" FOREIGN KEY ("invokedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolGrant" ADD CONSTRAINT "AgentToolGrant_agent_fkey" FOREIGN KEY ("agent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolGrant" ADD CONSTRAINT "AgentToolGrant_grantedBy_fkey" FOREIGN KEY ("grantedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolGrant" ADD CONSTRAINT "AgentToolGrant_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceTask" ADD CONSTRAINT "VoiceTask_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceTask" ADD CONSTRAINT "VoiceTask_agent_fkey" FOREIGN KEY ("agent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceTask" ADD CONSTRAINT "VoiceTask_call_fkey" FOREIGN KEY ("call") REFERENCES "CallRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceTask" ADD CONSTRAINT "VoiceTask_proposal_fkey" FOREIGN KEY ("proposal") REFERENCES "AgentProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceTask" ADD CONSTRAINT "VoiceTask_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceTask" ADD CONSTRAINT "VoiceTask_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosisHypothesis" ADD CONSTRAINT "DiagnosisHypothesis_session_fkey" FOREIGN KEY ("session") REFERENCES "DiagnosisSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosisHypothesis" ADD CONSTRAINT "DiagnosisHypothesis_agentRun_fkey" FOREIGN KEY ("agentRun") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosisHypothesis" ADD CONSTRAINT "DiagnosisHypothesis_enteredBy_fkey" FOREIGN KEY ("enteredBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosisSession" ADD CONSTRAINT "DiagnosisSession_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosisSession" ADD CONSTRAINT "DiagnosisSession_repairOrder_fkey" FOREIGN KEY ("repairOrder") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosisSession" ADD CONSTRAINT "DiagnosisSession_concern_fkey" FOREIGN KEY ("concern") REFERENCES "Concern"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosisSession" ADD CONSTRAINT "DiagnosisSession_diagnosisJob_fkey" FOREIGN KEY ("diagnosisJob") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosisSession" ADD CONSTRAINT "DiagnosisSession_topHypothesis_fkey" FOREIGN KEY ("topHypothesis") REFERENCES "DiagnosisHypothesis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosisSession" ADD CONSTRAINT "DiagnosisSession_openedBy_fkey" FOREIGN KEY ("openedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosisTest" ADD CONSTRAINT "DiagnosisTest_session_fkey" FOREIGN KEY ("session") REFERENCES "DiagnosisSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosisTest" ADD CONSTRAINT "DiagnosisTest_hypothesis_fkey" FOREIGN KEY ("hypothesis") REFERENCES "DiagnosisHypothesis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosisTest" ADD CONSTRAINT "DiagnosisTest_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
