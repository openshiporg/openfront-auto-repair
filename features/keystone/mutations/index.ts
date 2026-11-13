import { mergeSchemas } from '@graphql-tools/schema'
import type { GraphQLSchema } from 'graphql'
import redirectToInit from './redirectToInit'
import updateActiveUser from './updateActiveUser'
import { op } from './op'
import * as setup from './setup'
import * as audit from './audit'
import * as approvals from './approvals'
import * as p1 from './phase1'
import * as p2 from './phase2'
import * as p3 from './phase3'
import * as p4 from './phase4'
import * as p5 from './phase5'
import * as p6 from './phase6'
import * as p7 from './phase7'
import * as p8 from './phase8'
import * as p9 from './phase9'
import '../lib/orgControls'
import '../lib/policy'

const graphql = String.raw

// Every domain resolver checks permission itself and runs as one idempotent command: the state
// change, audit events commit in one transaction (features/keystone/lib).
export function extendGraphqlSchema(baseSchema: GraphQLSchema) {
  return mergeSchemas({
    schemas: [baseSchema],
    typeDefs: graphql`
      scalar JSON
      type Query {
        redirectToInit: Boolean
        verifyAuditChain: JSON
        checkAuthorizedCeiling(shopId: ID!, authorizedMinor: String!, priceMinor: String!, taxMinor: String): JSON
        previewShopInvoice(repairOrderId: ID!): JSON
        shopDaySummary(shopId: ID!, businessDate: String!): JSON
        followUpBoard(soonDays: Int): JSON
        aiProviderStatus: JSON
        diagnosisGate(sessionId: ID!, jobId: ID): JSON
        supplierDisputeEmail(invoiceId: ID!): JSON
        campaignPreview(campaignId: ID!): JSON
        shopReports(shopId: ID!, from: String!, to: String!): JSON
        shopTieOuts(shopId: ID!): JSON
        accountingJournalPreview(shopId: ID!, businessDate: String!): JSON
        exportFile(exportJobId: ID!): JSON
        webhookTopics: JSON
      }
      input UserUpdateProfileInput { name: String, email: String, password: String, onboardingStatus: String }
      type Mutation {
        createAssistant(input: JSON!, idempotencyKey: String!): JSON
        grantAssistantScope(agentId: ID!, scope: String!, limits: JSON, idempotencyKey: String!): JSON
        revokeAssistantScope(grantId: ID!, idempotencyKey: String!): JSON
        pauseAssistant(agentId: ID!, paused: Boolean!, idempotencyKey: String!): JSON
        retireAssistant(agentId: ID!, idempotencyKey: String!): JSON
        saveAiProvider(input: JSON!, idempotencyKey: String!): JSON
        removeAiProvider(idempotencyKey: String!): JSON
        askAssistant(agentId: ID!, shopId: ID, repairOrderId: ID, message: String, title: String, steps: JSON, idempotencyKey: String!): JSON
        draftAgentProposal(agentId: ID!, shopId: ID, repairOrderId: ID, message: String, title: String, steps: JSON, tool: String, args: JSON, idempotencyKey: String!): JSON
        suggestEstimate(agentId: ID!, repairOrderId: ID!, words: String!, concernId: ID, cannedJobId: ID, idempotencyKey: String!): JSON
        confirmAgentProposal(proposalId: ID!, expectedVersion: Int!, idempotencyKey: String!): JSON
        rejectAgentProposal(proposalId: ID!, expectedVersion: Int!, reason: String, idempotencyKey: String!): JSON
        startDiagnosisSession(input: JSON!, idempotencyKey: String!): JSON
        addDiagnosisHypothesis(input: JSON!, idempotencyKey: String!): JSON
        recordDiagnosisTest(input: JSON!, idempotencyKey: String!): JSON
        markDiagnosisQuoteReady(input: JSON!, idempotencyKey: String!): JSON
        markDiagnosisInconclusive(sessionId: ID!, expectedVersion: Int!, note: String, idempotencyKey: String!): JSON
        closeDiagnosisSession(sessionId: ID!, expectedVersion: Int!, idempotencyKey: String!): JSON
        queueVoiceTask(input: JSON!, idempotencyKey: String!): JSON
        logVoiceCall(input: JSON!, idempotencyKey: String!): JSON
        updateActiveUser(data: UserUpdateProfileInput!): User
        loadNorthgateSetup(idempotencyKey: String!, scope: String): JSON
        decideApprovalRequest(requestId: ID!, decision: String!, reason: String, expectedVersion: Int!, idempotencyKey: String!): JSON
        cancelApprovalRequest(requestId: ID!, expectedVersion: Int!, reason: String, idempotencyKey: String!): JSON
        requestOrgControls(changes: JSON!, reason: String!, idempotencyKey: String!): JSON
        createPolicyDraft(kind: String!, headId: ID!, idempotencyKey: String!): JSON
        publishPolicyVersion(kind: String!, versionId: ID!, expectedVersion: Int!, idempotencyKey: String!): JSON
        saveCustomer(input: JSON!, idempotencyKey: String!): JSON
        addCustomerContact(customerId: ID!, contact: JSON!, allowDuplicate: Boolean, idempotencyKey: String!): JSON
        recordContactConsent(input: JSON!, idempotencyKey: String!): JSON
        saveBusinessAccount(name: String!, termsDays: Int, poRequired: Boolean, idempotencyKey: String!): JSON
        saveVehicle(input: JSON!, idempotencyKey: String!): JSON
        linkVehicleOwner(vehicleId: ID!, customerId: ID, businessAccountId: ID, idempotencyKey: String!): JSON
        recordOdometerReading(vehicleId: ID!, value: Int!, unit: String, overrideReason: String, idempotencyKey: String!): JSON
        decodeVehicleVin(vehicleId: ID!, idempotencyKey: String!): JSON
        checkVehicleRecalls(vehicleId: ID!, idempotencyKey: String!): JSON
        holdAppointmentSlot(shopId: ID!, startsAt: String!, kind: String!, estimatedCentiHours: Int, idempotencyKey: String!): JSON
        bookShopAppointment(shopId: ID!, startsAt: String!, kind: String!, estimatedCentiHours: Int, customerId: ID, vehicleId: ID, lead: JSON, concernText: String, requestedServices: [String!], holdToken: String, confirm: Boolean, idempotencyKey: String!): JSON
        transitionAppointment(id: ID!, to: String!, expectedVersion: Int!, reason: String, startsAt: String, idempotencyKey: String!): JSON
        checkInShopVehicle(input: JSON!, idempotencyKey: String!): JSON
        openShopRepairOrder(input: JSON!, idempotencyKey: String!): JSON
        holdRepairOrder(repairOrderId: ID!, expectedVersion: Int!, hold: Boolean!, reason: String, note: String, idempotencyKey: String!): JSON
        addRepairJob(input: JSON!, idempotencyKey: String!): JSON
        saveJobLines(jobId: ID!, expectedVersion: Int!, lines: JSON!, idempotencyKey: String!): JSON
        saveCannedJob(input: JSON!, idempotencyKey: String!): JSON
        publishCannedJobVersion(versionId: ID!, expectedVersion: Int!, idempotencyKey: String!): JSON
        setCannedJobStatus(cannedJobId: ID!, active: Boolean!, idempotencyKey: String!): JSON
        editRepairJobLines(jobId: ID!, expectedVersion: Int!, add: JSON, removeLineId: ID, choose: JSON, idempotencyKey: String!): JSON
        repriceRepairJob(jobId: ID!, idempotencyKey: String!): JSON
        transitionRepairJob(jobId: ID!, to: String!, expectedVersion: Int!, reason: String, cause: String, correction: String, idempotencyKey: String!): JSON
        startShopInspection(repairOrderId: ID!, templateId: ID!, technicianId: ID, idempotencyKey: String!): JSON
        recordInspectionItem(input: JSON!, idempotencyKey: String!): JSON
        attachInspectionMedia(resultId: ID!, documentId: ID!, idempotencyKey: String!): JSON
        completeShopInspection(inspectionId: ID!, expectedVersion: Int!, idempotencyKey: String!): JSON
        sendShopInspection(inspectionId: ID!, expectedVersion: Int!, channel: String!, contactId: ID, idempotencyKey: String!): JSON
        sendRepairEstimate(repairOrderId: ID!, jobIds: [ID!], expectedVersion: Int!, idempotencyKey: String!): JSON
        requestCustomerAuthorization(estimateVersionId: ID!, channel: String!, contactId: ID, idempotencyKey: String!): JSON
        recordCustomerAuthorization(input: JSON!, idempotencyKey: String!): JSON
        createCallbackTask(repairOrderId: ID!, kind: String, title: String!, detail: String, idempotencyKey: String!): JSON
        finalizeShopInvoice(input: JSON!, idempotencyKey: String!): JSON
        createInvoicePayLink(invoiceId: ID!, idempotencyKey: String!): JSON
        takeShopPayment(input: JSON!, idempotencyKey: String!): JSON
        checkShopPayment(paymentId: ID!): JSON
        resolveShopPayments(shopId: ID!): JSON
        refundShopPayment(input: JSON!, idempotencyKey: String!): JSON
        issueShopCreditMemo(input: JSON!, idempotencyKey: String!): JSON
        closeShopDay(shopId: ID!, businessDate: String!, drawerCountMinor: String!, varianceReason: String, idempotencyKey: String!): JSON
        reopenShopDay(dayCloseId: ID!, reason: String!, approvalRequestId: ID, idempotencyKey: String!): JSON
        releaseShopVehicle(repairOrderId: ID!, reason: String, approvalRequestId: ID, idempotencyKey: String!): JSON
        closeCallbackTask(taskId: ID!, expectedVersion: Int!, outcome: String!, cancel: Boolean, idempotencyKey: String!): JSON
        saveShopPartItem(input: JSON!, idempotencyKey: String!): JSON
        requestSupplierQuote(shopId: ID!, supplierId: ID!, partNumber: String!, quantityMilli: Int!, jobId: ID, jobLineId: ID, idempotencyKey: String!): JSON
        recordSupplierQuote(input: JSON!, idempotencyKey: String!): JSON
        selectSupplierQuote(quoteId: ID!, expectedVersion: Int, idempotencyKey: String!): JSON
        createShopSupplierOrder(input: JSON!, idempotencyKey: String!): JSON
        placeSupplierOrder(orderId: ID!, expectedVersion: Int, idempotencyKey: String!): JSON
        recordPhoneOrder(orderId: ID!, spokeTo: String!, supplierConfirmation: String, etaHours: Int, expectedVersion: Int, idempotencyKey: String!): JSON
        resolveUnknownSupplierOrder(orderId: ID!, found: Boolean, supplierConfirmation: String, note: String!, expectedVersion: Int, idempotencyKey: String!): JSON
        confirmShopSupplierOrder(orderId: ID!, supplierConfirmation: String, etaAt: String, expectedVersion: Int, idempotencyKey: String!): JSON
        cancelShopSupplierOrder(orderId: ID!, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON
        receiveShopSupplierOrder(input: JSON!, idempotencyKey: String!): JSON
        reserveJobPart(jobId: ID!, shopItemId: ID!, quantityMilli: Int!, idempotencyKey: String!): JSON
        issueJobPart(jobId: ID!, shopItemId: ID!, quantityMilli: Int!, idempotencyKey: String!): JSON
        returnJobPart(jobId: ID!, shopItemId: ID!, quantityMilli: Int!, idempotencyKey: String!): JSON
        adjustShopStock(shopItemId: ID!, deltaMilli: Int!, reason: String!, approvalRequestId: ID, idempotencyKey: String!): JSON
        startShopCycleCount(shopId: ID!, shopItemIds: [ID!]!, idempotencyKey: String!): JSON
        recordShopCounts(cycleCountId: ID!, counts: JSON!, expectedVersion: Int, idempotencyKey: String!): JSON
        postShopCycleCount(cycleCountId: ID!, approvalRequestId: ID, expectedVersion: Int, idempotencyKey: String!): JSON
        markShopCoreReturned(coreId: ID!, note: String, documentId: ID, expectedVersion: Int, idempotencyKey: String!): JSON
        writeOffShopCore(coreId: ID!, reason: String!, approvalRequestId: ID, expectedVersion: Int, idempotencyKey: String!): JSON
        createShopSupplierReturn(input: JSON!, idempotencyKey: String!): JSON
        advanceShopSupplierReturn(returnId: ID!, to: String!, expectedVersion: Int, idempotencyKey: String!): JSON
        recordShopSupplierInvoice(input: JSON!, idempotencyKey: String!): JSON
        matchShopSupplierInvoice(invoiceId: ID!, idempotencyKey: String!): JSON
        resolveSupplierDiscrepancy(discrepancyId: ID!, outcome: String!, resolution: String!, expectedVersion: Int, idempotencyKey: String!): JSON
        approveShopSupplierInvoice(invoiceId: ID!, expectedVersion: Int, idempotencyKey: String!): JSON
        exportShopSupplierInvoice(invoiceId: ID!, expectedVersion: Int, idempotencyKey: String!): JSON
        reverseShopSupplierInvoice(invoiceId: ID!, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON
        recordShopJobTire(jobId: ID!, tireSize: String, position: String!, tin: String!, idempotencyKey: String!): JSON
        completeShopTireRegistration(obligationId: ID!, method: String!, tins: [String!], note: String, expectedVersion: Int, idempotencyKey: String!): JSON
        confirmShopTireRegistration(obligationId: ID!, expectedVersion: Int, idempotencyKey: String!): JSON
        clockInShift(shopId: ID!, idempotencyKey: String!): JSON
        clockOutShift(shopId: ID!, idempotencyKey: String!): JSON
        startShiftBreak(shopId: ID!, idempotencyKey: String!): JSON
        endShiftBreak(shopId: ID!, idempotencyKey: String!): JSON
        startTechJobClock(jobId: ID!, idempotencyKey: String!): JSON
        stopTechJobClock(jobClockId: ID!, idempotencyKey: String!): JSON
        logJobWaiting(jobClockId: ID!, reason: String, resume: Boolean, note: String, idempotencyKey: String!): JSON
        requestTimeCorrection(input: JSON!, idempotencyKey: String!): JSON
        saveTechCredential(input: JSON!, idempotencyKey: String!): JSON
        assignShopJobTechnicians(jobId: ID!, shares: JSON!, idempotencyKey: String!): JSON
        adjustTechFlaggedHours(technicianId: ID!, jobId: ID!, centiHours: Int!, reason: String!, idempotencyKey: String!): JSON
        closeShopPayPeriod(payPeriodId: ID!, approvalRequestId: ID, idempotencyKey: String!): JSON
        exportShopPayPeriod(payPeriodId: ID!, idempotencyKey: String!): JSON
        saveAccountTerms(input: JSON!, idempotencyKey: String!): JSON
        refreshAccountStanding(businessAccountId: ID, idempotencyKey: String!): JSON
        holdAccountCredit(businessAccountId: ID!, reason: String!, idempotencyKey: String!): JSON
        releaseAccountHold(businessAccountId: ID!, reason: String!, approvalRequestId: ID, idempotencyKey: String!): JSON
        addAccountContact(input: JSON!, idempotencyKey: String!): JSON
        addAccountApprover(input: JSON!, idempotencyKey: String!): JSON
        removeAccountApprover(approverId: ID!, idempotencyKey: String!): JSON
        addAccountCertificate(input: JSON!, idempotencyKey: String!): JSON
        revokeAccountCertificate(certificateId: ID!, reason: String!, idempotencyKey: String!): JSON
        saveAccountUnit(input: JSON!, idempotencyKey: String!): JSON
        createAccountLink(contactId: ID!, idempotencyKey: String!): JSON
        makeAccountStatement(businessAccountId: ID!, periodStart: String!, periodEnd: String!, idempotencyKey: String!): JSON
        exportAccountStatement(statementId: ID!, idempotencyKey: String!): JSON
        exportAllAccountStatements(periodStart: String!, periodEnd: String!, idempotencyKey: String!): JSON
        openShopComeback(originalJobId: ID!, concern: String!, odometer: Int, idempotencyKey: String!): JSON
        diagnoseShopComeback(comebackId: ID!, cause: String!, diagnosis: String!, expectedVersion: Int, idempotencyKey: String!): JSON
        requestComebackGoodwill(comebackId: ID!, reason: String!, approvalRequestId: ID, idempotencyKey: String!): JSON
        resolveShopComeback(comebackId: ID!, resolution: String!, comebackJobId: ID, expectedVersion: Int, idempotencyKey: String!): JSON
        createShopPartWarrantyClaim(comebackId: ID!, supplierId: ID!, jobLineId: ID, laborReimbursementMinor: String, idempotencyKey: String!): JSON
        attachShopComebackJob(comebackId: ID!, comebackJobId: ID!, idempotencyKey: String!): JSON
        cancelShopComeback(comebackId: ID!, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON
        withdrawShopPartWarrantyClaim(claimId: ID!, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON
        releaseShopJobReservations(jobId: ID!, reason: String!, idempotencyKey: String!): JSON
        logCustomerMessage(input: JSON!, idempotencyKey: String!): JSON
        logCustomerCall(input: JSON!, idempotencyKey: String!): JSON
        readMessageThread(threadId: ID!, idempotencyKey: String!): JSON
        saveMessageTemplate(input: JSON!, idempotencyKey: String!): JSON
        markFollowUpContacted(recommendationId: ID!, channel: String!, note: String, expectedContactedCount: Int!, idempotencyKey: String!): JSON
        closeRecommendation(recommendationId: ID!, reason: String!, idempotencyKey: String!): JSON
        markServiceReminderContacted(cycleKey: String!, channel: String!, note: String, idempotencyKey: String!): JSON
        saveMarketingCampaign(input: JSON!, idempotencyKey: String!): JSON
        saveAccountingMappings(shopId: ID!, mappings: JSON!, idempotencyKey: String!): JSON
        stageAccountingBatch(shopId: ID!, businessDate: String!, idempotencyKey: String!): JSON
        exportAccountingBatch(batchId: ID!, idempotencyKey: String!): JSON
        recordAccountingResponse(input: JSON!, idempotencyKey: String!): JSON
        saveReportSnapshot(shopId: ID!, from: String!, to: String!, idempotencyKey: String!): JSON
        previewDataImport(input: JSON!, idempotencyKey: String!): JSON
        applyDataImport(jobId: ID!, idempotencyKey: String!): JSON
        discardDataImport(jobId: ID!, idempotencyKey: String!): JSON
        saveIntegrationConnection(input: JSON!, idempotencyKey: String!): JSON
        recordIntegrationHealth(connectionId: ID!, ok: Boolean!, message: String, idempotencyKey: String!): JSON
        revokeIntegrationConnection(connectionId: ID!, reason: String!, idempotencyKey: String!): JSON
        recordProviderObservation(input: JSON!, idempotencyKey: String!): JSON
        addWebhookEndpoint(input: JSON!, idempotencyKey: String!): JSON
        changeWebhookEndpoint(input: JSON!, idempotencyKey: String!): JSON
        replayWebhookEvent(eventId: ID!, idempotencyKey: String!): JSON
        sendDueWebhooks(idempotencyKey: String!): JSON
        exportMarketingCampaign(campaignId: ID!, idempotencyKey: String!): JSON
        copyMarketingMessage(campaignId: ID!, customerId: ID!, channel: String, idempotencyKey: String!): JSON
        recordReviewRequest(repairOrderId: ID!, channel: String!, note: String, idempotencyKey: String!): JSON
        createCustomerPortalLink(customerId: ID!, idempotencyKey: String!): JSON
      }
    `,
    resolvers: {
      Query: {
        redirectToInit,
        verifyAuditChain: op(audit.verifyAuditChain),
        checkAuthorizedCeiling: op(p1.checkAuthorizedCeiling),
        previewShopInvoice: op(p3.previewShopInvoice),
        shopDaySummary: op(p3.shopDaySummary),
        followUpBoard: op(p7.followUpBoard),
        aiProviderStatus: op(p8.aiProviderStatus),
        diagnosisGate: op(p8.diagnosisGate),
        supplierDisputeEmail: op(p8.supplierDisputeEmail),
        campaignPreview: op(p7.campaignPreview),
        shopReports: op(p9.shopReports),
        shopTieOuts: op(p9.shopTieOuts),
        accountingJournalPreview: op(p9.accountingJournalPreview),
        exportFile: op(p9.exportFile),
        webhookTopics: op(p9.webhookTopics),
      },
      Mutation: {
        updateActiveUser,
        loadNorthgateSetup: op(setup.loadNorthgateSetup),
        decideApprovalRequest: op(approvals.decideApprovalRequest),
        cancelApprovalRequest: op(approvals.cancelApprovalRequest),
        requestOrgControls: op(approvals.requestOrgControls),
        createPolicyDraft: op(p1.createPolicyDraft),
        publishPolicyVersion: op(p1.publishPolicyVersion),
        saveCustomer: op(p1.saveCustomer),
        addCustomerContact: op(p1.addCustomerContact),
        recordContactConsent: op(p1.recordContactConsent),
        saveBusinessAccount: op(p1.saveBusinessAccount),
        saveVehicle: op(p1.saveVehicle),
        linkVehicleOwner: op(p1.linkVehicleOwner),
        recordOdometerReading: op(p1.recordOdometerReading),
        decodeVehicleVin: op(p1.decodeVehicleVin),
        checkVehicleRecalls: op(p1.checkVehicleRecalls),
        holdAppointmentSlot: op(p1.holdAppointmentSlot),
        bookShopAppointment: op(p1.bookShopAppointment),
        transitionAppointment: op(p1.transitionAppointment),
        checkInShopVehicle: op(p1.checkInShopVehicle),
        openShopRepairOrder: op(p2.openShopRepairOrder),
        holdRepairOrder: op(p2.holdRepairOrder),
        addRepairJob: op(p2.addRepairJob),
        saveJobLines: op(p2.saveJobLines),
        editRepairJobLines: op(p2.editRepairJobLines),
        saveCannedJob: op(p2.saveCannedJob),
        publishCannedJobVersion: op(p2.publishCannedJobVersion),
        setCannedJobStatus: op(p2.setCannedJobStatus),
        repriceRepairJob: op(p2.repriceRepairJob),
        transitionRepairJob: op(p2.transitionRepairJob),
        startShopInspection: op(p2.startShopInspection),
        recordInspectionItem: op(p2.recordInspectionItem),
        attachInspectionMedia: op(p2.attachInspectionMedia),
        completeShopInspection: op(p2.completeShopInspection),
        sendShopInspection: op(p2.sendShopInspection),
        sendRepairEstimate: op(p2.sendRepairEstimate),
        requestCustomerAuthorization: op(p2.requestCustomerAuthorization),
        recordCustomerAuthorization: op(p2.recordCustomerAuthorization),
        createCallbackTask: op(p2.createCallbackTask),
        closeCallbackTask: op(p2.closeCallbackTask),
        finalizeShopInvoice: op(p3.finalizeShopInvoice),
        createInvoicePayLink: op(p3.createInvoicePayLink),
        takeShopPayment: op(p3.takeShopPayment),
        checkShopPayment: op(p3.checkShopPayment),
        resolveShopPayments: op(p3.resolveShopPayments),
        refundShopPayment: op(p3.refundShopPayment),
        issueShopCreditMemo: op(p3.issueShopCreditMemo),
        closeShopDay: op(p3.closeShopDay),
        reopenShopDay: op(p3.reopenShopDay),
        releaseShopVehicle: op(p3.releaseShopVehicle),
        saveShopPartItem: op(p4.saveShopPartItem),
        requestSupplierQuote: op(p4.requestSupplierQuote),
        recordSupplierQuote: op(p4.recordSupplierQuote),
        selectSupplierQuote: op(p4.selectSupplierQuote),
        createShopSupplierOrder: op(p4.createShopSupplierOrder),
        placeSupplierOrder: op(p4.placeSupplierOrder),
        recordPhoneOrder: op(p4.recordPhoneOrder),
        resolveUnknownSupplierOrder: op(p4.resolveUnknownSupplierOrder),
        confirmShopSupplierOrder: op(p4.confirmShopSupplierOrder),
        cancelShopSupplierOrder: op(p4.cancelShopSupplierOrder),
        receiveShopSupplierOrder: op(p4.receiveShopSupplierOrder),
        reserveJobPart: op(p4.reserveJobPart),
        issueJobPart: op(p4.issueJobPart),
        returnJobPart: op(p4.returnJobPart),
        adjustShopStock: op(p4.adjustShopStock),
        startShopCycleCount: op(p4.startShopCycleCount),
        recordShopCounts: op(p4.recordShopCounts),
        postShopCycleCount: op(p4.postShopCycleCount),
        markShopCoreReturned: op(p4.markShopCoreReturned),
        writeOffShopCore: op(p4.writeOffShopCore),
        createShopSupplierReturn: op(p4.createShopSupplierReturn),
        advanceShopSupplierReturn: op(p4.advanceShopSupplierReturn),
        recordShopSupplierInvoice: op(p4.recordShopSupplierInvoice),
        matchShopSupplierInvoice: op(p4.matchShopSupplierInvoice),
        resolveSupplierDiscrepancy: op(p4.resolveSupplierDiscrepancy),
        clockInShift: op(p5.clockInShift),
        clockOutShift: op(p5.clockOutShift),
        startShiftBreak: op(p5.startShiftBreak),
        endShiftBreak: op(p5.endShiftBreak),
        startTechJobClock: op(p5.startTechJobClock),
        stopTechJobClock: op(p5.stopTechJobClock),
        logJobWaiting: op(p5.logJobWaiting),
        requestTimeCorrection: op(p5.requestTimeCorrection),
        saveTechCredential: op(p5.saveTechCredential),
        assignShopJobTechnicians: op(p5.assignShopJobTechnicians),
        adjustTechFlaggedHours: op(p5.adjustTechFlaggedHours),
        closeShopPayPeriod: op(p5.closeShopPayPeriod),
        exportShopPayPeriod: op(p5.exportShopPayPeriod),
        saveAccountTerms: op(p6.saveAccountTerms),
        refreshAccountStanding: op(p6.refreshAccountStanding),
        holdAccountCredit: op(p6.holdAccountCredit),
        releaseAccountHold: op(p6.releaseAccountHold),
        addAccountContact: op(p6.addAccountContact),
        addAccountApprover: op(p6.addAccountApprover),
        removeAccountApprover: op(p6.removeAccountApprover),
        addAccountCertificate: op(p6.addAccountCertificate),
        revokeAccountCertificate: op(p6.revokeAccountCertificate),
        saveAccountUnit: op(p6.saveAccountUnit),
        createAccountLink: op(p6.createAccountLink),
        makeAccountStatement: op(p6.makeAccountStatement),
        exportAccountStatement: op(p6.exportAccountStatement),
        exportAllAccountStatements: op(p6.exportAllAccountStatements),
        createAssistant: op(p8.createAssistant),
        grantAssistantScope: op(p8.grantAssistantScope),
        revokeAssistantScope: op(p8.revokeAssistantScope),
        pauseAssistant: op(p8.pauseAssistant),
        retireAssistant: op(p8.retireAssistant),
        saveAiProvider: op(p8.saveAiProvider),
        removeAiProvider: op(p8.removeAiProvider),
        askAssistant: op(p8.askAssistant),
        draftAgentProposal: op(p8.draftAgentProposal),
        suggestEstimate: op(p8.suggestEstimate),
        confirmAgentProposal: op(p8.confirmAgentProposal),
        rejectAgentProposal: op(p8.rejectAgentProposal),
        startDiagnosisSession: op(p8.startDiagnosisSession),
        addDiagnosisHypothesis: op(p8.addDiagnosisHypothesis),
        recordDiagnosisTest: op(p8.recordDiagnosisTest),
        markDiagnosisQuoteReady: op(p8.markDiagnosisQuoteReady),
        markDiagnosisInconclusive: op(p8.markDiagnosisInconclusive),
        closeDiagnosisSession: op(p8.closeDiagnosisSession),
        queueVoiceTask: op(p8.queueVoiceTask),
        logVoiceCall: op(p8.logVoiceCall),
        logCustomerMessage: op(p7.logCustomerMessage),
        logCustomerCall: op(p7.logCustomerCall),
        readMessageThread: op(p7.readMessageThread),
        saveMessageTemplate: op(p7.saveMessageTemplate),
        markFollowUpContacted: op(p7.markFollowUpContacted),
        closeRecommendation: op(p7.closeRecommendation),
        markServiceReminderContacted: op(p7.markServiceReminderContacted),
        saveMarketingCampaign: op(p7.saveMarketingCampaign),
        saveAccountingMappings: op(p9.saveAccountingMappings),
        stageAccountingBatch: op(p9.stageAccountingBatch),
        exportAccountingBatch: op(p9.exportAccountingBatch),
        recordAccountingResponse: op(p9.recordAccountingResponse),
        saveReportSnapshot: op(p9.saveReportSnapshot),
        previewDataImport: op(p9.previewDataImport),
        applyDataImport: op(p9.applyDataImport),
        discardDataImport: op(p9.discardDataImport),
        saveIntegrationConnection: op(p9.saveIntegrationConnection),
        recordIntegrationHealth: op(p9.recordIntegrationHealth),
        revokeIntegrationConnection: op(p9.revokeIntegrationConnection),
        recordProviderObservation: op(p9.recordProviderObservation),
        addWebhookEndpoint: op(p9.addWebhookEndpoint),
        changeWebhookEndpoint: op(p9.changeWebhookEndpoint),
        replayWebhookEvent: op(p9.replayWebhookEvent),
        sendDueWebhooks: op(p9.sendDueWebhooks),
        exportMarketingCampaign: op(p7.exportMarketingCampaign),
        copyMarketingMessage: op(p7.copyMarketingMessage),
        recordReviewRequest: op(p7.recordReviewRequest),
        createCustomerPortalLink: op(p7.createCustomerPortalLink),
        openShopComeback: op(p5.openShopComeback),
        diagnoseShopComeback: op(p5.diagnoseShopComeback),
        requestComebackGoodwill: op(p5.requestComebackGoodwill),
        resolveShopComeback: op(p5.resolveShopComeback),
        createShopPartWarrantyClaim: op(p5.createShopPartWarrantyClaim),
        attachShopComebackJob: op(p5.attachShopComebackJob),
        cancelShopComeback: op(p5.cancelShopComeback),
        withdrawShopPartWarrantyClaim: op(p5.withdrawShopPartWarrantyClaim),
        releaseShopJobReservations: op(p4.releaseShopJobReservations),
        approveShopSupplierInvoice: op(p4.approveShopSupplierInvoice),
        exportShopSupplierInvoice: op(p4.exportShopSupplierInvoice),
        reverseShopSupplierInvoice: op(p4.reverseShopSupplierInvoice),
        recordShopJobTire: op(p4.recordShopJobTire),
        completeShopTireRegistration: op(p4.completeShopTireRegistration),
        confirmShopTireRegistration: op(p4.confirmShopTireRegistration),
      },
    },
  })
}
