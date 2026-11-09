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
      }
      input UserUpdateProfileInput { name: String, email: String, password: String, onboardingStatus: String }
      type Mutation {
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
        openShopComeback(originalJobId: ID!, concern: String!, odometer: Int, idempotencyKey: String!): JSON
        diagnoseShopComeback(comebackId: ID!, cause: String!, diagnosis: String!, expectedVersion: Int, idempotencyKey: String!): JSON
        requestComebackGoodwill(comebackId: ID!, reason: String!, approvalRequestId: ID, idempotencyKey: String!): JSON
        resolveShopComeback(comebackId: ID!, resolution: String!, comebackJobId: ID, expectedVersion: Int, idempotencyKey: String!): JSON
        createShopPartWarrantyClaim(comebackId: ID!, supplierId: ID!, jobLineId: ID, laborReimbursementMinor: String, idempotencyKey: String!): JSON
        attachShopComebackJob(comebackId: ID!, comebackJobId: ID!, idempotencyKey: String!): JSON
        cancelShopComeback(comebackId: ID!, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON
        withdrawShopPartWarrantyClaim(claimId: ID!, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON
        releaseShopJobReservations(jobId: ID!, reason: String!, idempotencyKey: String!): JSON
      }
    `,
    resolvers: {
      Query: {
        redirectToInit,
        verifyAuditChain: op(audit.verifyAuditChain),
        checkAuthorizedCeiling: op(p1.checkAuthorizedCeiling),
        previewShopInvoice: op(p3.previewShopInvoice),
        shopDaySummary: op(p3.shopDaySummary),
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
