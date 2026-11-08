'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

/**
 * The only custom operations the dashboard screens can call. Each takes an idempotency key that the
 * client makes once per intent and reuses on retry, so a lost response never acts twice.
 */
const OPS: Record<string, Record<string, string>> = {
  decideApprovalRequest: { requestId: 'ID!', decision: 'String!', reason: 'String', expectedVersion: 'Int!' },
  cancelApprovalRequest: { requestId: 'ID!', expectedVersion: 'Int!', reason: 'String' },
  requestOrgControls: { changes: 'JSON!', reason: 'String!' },
  createPolicyDraft: { kind: 'String!', headId: 'ID!' },
  publishPolicyVersion: { kind: 'String!', versionId: 'ID!', expectedVersion: 'Int!' },
  saveCustomer: { input: 'JSON!' },
  recordContactConsent: { input: 'JSON!' },
  saveVehicle: { input: 'JSON!' },
  recordOdometerReading: { vehicleId: 'ID!', value: 'Int!', unit: 'String', overrideReason: 'String' },
  decodeVehicleVin: { vehicleId: 'ID!' },
  checkVehicleRecalls: { vehicleId: 'ID!' },
  bookShopAppointment: { shopId: 'ID!', startsAt: 'String!', kind: 'String!', estimatedCentiHours: 'Int', customerId: 'ID', vehicleId: 'ID', lead: 'JSON', concernText: 'String', requestedServices: '[String!]', confirm: 'Boolean' },
  transitionAppointment: { id: 'ID!', to: 'String!', expectedVersion: 'Int!', reason: 'String', startsAt: 'String' },
  checkInShopVehicle: { input: 'JSON!' },
  openShopRepairOrder: { input: 'JSON!' },
  holdRepairOrder: { repairOrderId: 'ID!', expectedVersion: 'Int!', hold: 'Boolean!', reason: 'String', note: 'String' },
  addRepairJob: { input: 'JSON!' },
  saveJobLines: { jobId: 'ID!', expectedVersion: 'Int!', lines: 'JSON!' },
  editRepairJobLines: { jobId: 'ID!', expectedVersion: 'Int!', add: 'JSON', removeLineId: 'ID', choose: 'JSON' },
  repriceRepairJob: { jobId: 'ID!' },
  saveCannedJob: { input: 'JSON!' },
  publishCannedJobVersion: { versionId: 'ID!', expectedVersion: 'Int!' },
  setCannedJobStatus: { cannedJobId: 'ID!', active: 'Boolean!' },
  transitionRepairJob: { jobId: 'ID!', to: 'String!', expectedVersion: 'Int!', reason: 'String', cause: 'String', correction: 'String' },
  startShopInspection: { repairOrderId: 'ID!', templateId: 'ID!', technicianId: 'ID' },
  recordInspectionItem: { input: 'JSON!' },
  completeShopInspection: { inspectionId: 'ID!', expectedVersion: 'Int!' },
  sendShopInspection: { inspectionId: 'ID!', expectedVersion: 'Int!', channel: 'String!', contactId: 'ID' },
  sendRepairEstimate: { repairOrderId: 'ID!', jobIds: '[ID!]', expectedVersion: 'Int!' },
  requestCustomerAuthorization: { estimateVersionId: 'ID!', channel: 'String!', contactId: 'ID' },
  recordCustomerAuthorization: { input: 'JSON!' },
  createCallbackTask: { repairOrderId: 'ID!', kind: 'String', title: 'String!', detail: 'String' },
  finalizeShopInvoice: { input: 'JSON!' },
  createInvoicePayLink: { invoiceId: 'ID!' },
  takeShopPayment: { input: 'JSON!' },
  checkShopPayment: { paymentId: 'ID!' },
  resolveShopPayments: { shopId: 'ID!' },
  refundShopPayment: { input: 'JSON!' },
  issueShopCreditMemo: { input: 'JSON!' },
  closeShopDay: { shopId: 'ID!', businessDate: 'String!', drawerCountMinor: 'String!', varianceReason: 'String' },
  reopenShopDay: { dayCloseId: 'ID!', reason: 'String!', approvalRequestId: 'ID' },
  releaseShopVehicle: { repairOrderId: 'ID!', reason: 'String', approvalRequestId: 'ID' },
  closeCallbackTask: { taskId: 'ID!', expectedVersion: 'Int!', outcome: 'String!', cancel: 'Boolean' },
  saveShopPartItem: { input: 'JSON!' },
  requestSupplierQuote: { shopId: 'ID!', supplierId: 'ID!', partNumber: 'String!', quantityMilli: 'Int!', jobId: 'ID', jobLineId: 'ID' },
  recordSupplierQuote: { input: 'JSON!' },
  selectSupplierQuote: { quoteId: 'ID!', expectedVersion: 'Int' },
  createShopSupplierOrder: { input: 'JSON!' },
  placeSupplierOrder: { orderId: 'ID!', expectedVersion: 'Int' },
  recordPhoneOrder: { orderId: 'ID!', spokeTo: 'String!', supplierConfirmation: 'String', etaHours: 'Int', expectedVersion: 'Int' },
  resolveUnknownSupplierOrder: { orderId: 'ID!', found: 'Boolean', supplierConfirmation: 'String', note: 'String!', expectedVersion: 'Int' },
  confirmShopSupplierOrder: { orderId: 'ID!', supplierConfirmation: 'String', etaAt: 'String', expectedVersion: 'Int' },
  cancelShopSupplierOrder: { orderId: 'ID!', reason: 'String!', expectedVersion: 'Int' },
  receiveShopSupplierOrder: { input: 'JSON!' },
  reserveJobPart: { jobId: 'ID!', shopItemId: 'ID!', quantityMilli: 'Int!' },
  issueJobPart: { jobId: 'ID!', shopItemId: 'ID!', quantityMilli: 'Int!' },
  returnJobPart: { jobId: 'ID!', shopItemId: 'ID!', quantityMilli: 'Int!' },
  adjustShopStock: { shopItemId: 'ID!', deltaMilli: 'Int!', reason: 'String!', approvalRequestId: 'ID' },
  startShopCycleCount: { shopId: 'ID!', shopItemIds: '[ID!]!' },
  recordShopCounts: { cycleCountId: 'ID!', counts: 'JSON!', expectedVersion: 'Int' },
  postShopCycleCount: { cycleCountId: 'ID!', approvalRequestId: 'ID', expectedVersion: 'Int' },
  markShopCoreReturned: { coreId: 'ID!', note: 'String', documentId: 'ID', expectedVersion: 'Int' },
  writeOffShopCore: { coreId: 'ID!', reason: 'String!', approvalRequestId: 'ID', expectedVersion: 'Int' },
  createShopSupplierReturn: { input: 'JSON!' },
  advanceShopSupplierReturn: { returnId: 'ID!', to: 'String!', expectedVersion: 'Int' },
  recordShopSupplierInvoice: { input: 'JSON!' },
  matchShopSupplierInvoice: { invoiceId: 'ID!' },
  resolveSupplierDiscrepancy: { discrepancyId: 'ID!', outcome: 'String!', resolution: 'String!', expectedVersion: 'Int' },
  approveShopSupplierInvoice: { invoiceId: 'ID!', expectedVersion: 'Int' },
  exportShopSupplierInvoice: { invoiceId: 'ID!', expectedVersion: 'Int' },
  recordShopJobTire: { jobId: 'ID!', tireSize: 'String', position: 'String!', tin: 'String!' },
  completeShopTireRegistration: { obligationId: 'ID!', method: 'String!', tins: '[String!]', note: 'String', expectedVersion: 'Int' },
  confirmShopTireRegistration: { obligationId: 'ID!', expectedVersion: 'Int' },
  sweepShopTireRegistrations: {  },
};

const KEY = /^[A-Za-z0-9._:-]{8,200}$/;

export async function runCommand(op: string, variables: Record<string, unknown>, idempotencyKey: string, paths: string[] = []) {
  const spec = OPS[op];
  if (!spec) return { ok: false as const, error: 'Unknown action' };
  if (!KEY.test(idempotencyKey)) return { ok: false as const, error: 'Missing request key. Reload the page and try again.' };
  const keys = Object.keys(variables).filter((k) => k in spec && variables[k] !== undefined && variables[k] !== '');
  const decl = [...keys.map((k) => `$${k}: ${spec[k]}`), '$idempotencyKey: String!'];
  const args = [...keys.map((k) => `${k}: $${k}`), 'idempotencyKey: $idempotencyKey'];
  const vars: Record<string, unknown> = { ...Object.fromEntries(keys.map((k) => [k, variables[k]])), idempotencyKey };
  const res = await keystoneClient(`mutation Run(${decl.join(', ')}) { ${op}(${args.join(', ')}) }`, vars);
  if (!res.success) return { ok: false as const, error: res.error || 'Action failed' };
  for (const p of paths) revalidatePath(p);
  return { ok: true as const, data: (res.data as Record<string, unknown>)?.[op] };
}
