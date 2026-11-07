import { APPROVAL_POLICIES, ORG, ROLES, SHOPS, STAFF } from '@/features/keystone/seed/northgate'

/**
 * What "Load Northgate Auto Group" creates, section by section. Each section is one idempotent
 * server command; later phases add policies, customers, vehicles and repair orders here.
 */
export const SETUP_SECTIONS = [
  {
    id: 'organization',
    title: 'Organisation, shops and people',
    mutation: 'mutation LoadNorthgate($idempotencyKey: String!) { loadNorthgateSetup(idempotencyKey: $idempotencyKey) }',
    field: 'loadNorthgateSetup',
    items: [
      ORG.legalName,
      ...SHOPS.map(shop => `${shop.name} (${shop.code}) · ${shop.bays.length} bays`),
      `${ROLES.length} roles with separated duties`,
      ...STAFF.map(person => `${person.name} · ${person.title}`),
      `${APPROVAL_POLICIES.length} maker-checker approval policies`,
    ],
  },
] as const
