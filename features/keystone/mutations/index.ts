import { mergeSchemas } from '@graphql-tools/schema'
import type { GraphQLSchema } from 'graphql'
import redirectToInit from './redirectToInit'
import updateActiveUser from './updateActiveUser'
import { op } from './op'
import * as setup from './setup'
import * as audit from './audit'
import * as approvals from './approvals'
import '../lib/orgControls'

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
      }
      input UserUpdateProfileInput { name: String, email: String, password: String, onboardingStatus: String }
      type Mutation {
        updateActiveUser(data: UserUpdateProfileInput!): User
        loadNorthgateSetup(idempotencyKey: String!): JSON
        decideApprovalRequest(requestId: ID!, decision: String!, reason: String, expectedVersion: Int!, idempotencyKey: String!): JSON
        cancelApprovalRequest(requestId: ID!, expectedVersion: Int!, reason: String, idempotencyKey: String!): JSON
        requestOrgControls(changes: JSON!, reason: String!, idempotencyKey: String!): JSON
      }
    `,
    resolvers: {
      Query: {
        redirectToInit,
        verifyAuditChain: op(audit.verifyAuditChain),
      },
      Mutation: {
        updateActiveUser,
        loadNorthgateSetup: op(setup.loadNorthgateSetup),
        decideApprovalRequest: op(approvals.decideApprovalRequest),
        cancelApprovalRequest: op(approvals.cancelApprovalRequest),
        requestOrgControls: op(approvals.requestOrgControls),
      },
    },
  })
}
