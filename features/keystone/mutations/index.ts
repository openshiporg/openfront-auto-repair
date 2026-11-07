import { mergeSchemas } from '@graphql-tools/schema'
import type { GraphQLSchema } from 'graphql'
import redirectToInit from './redirectToInit'
import updateActiveUser from './updateActiveUser'
import { op } from './op'
import * as setup from './setup'
import * as audit from './audit'
import * as approvals from './approvals'
import * as p1 from './phase1'
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
      }
    `,
    resolvers: {
      Query: {
        redirectToInit,
        verifyAuditChain: op(audit.verifyAuditChain),
        checkAuthorizedCeiling: op(p1.checkAuthorizedCeiling),
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
      },
    },
  })
}
