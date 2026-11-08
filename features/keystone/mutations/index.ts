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
import '../lib/orgControls'
import '../lib/policy'

const graphql = String.raw

// Every domain resolver checks permission itself and runs as one idempotent command: the state
// change, audit events and outbox messages commit in one transaction (features/keystone/lib).
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
      },
    },
  })
}
