/**
 * Compound uniques Keystone can't express on a field (SCHEMA G9; openfront-convenience pattern).
 * Partial uniques, CHECK constraints and triggers live in raw-SQL migrations instead.
 */
export const COMPOUND_UNIQUES: Record<string, string[]> = {
  ShopCalendarException: ['@@unique([calendarId, date], map: "ShopCalendarException_calendar_date_key")'],
  ShopMembership: ['@@unique([userId, shopId], map: "ShopMembership_user_shop_key")'],
  Bay: ['@@unique([shopId, code], map: "Bay_shop_code_key")'],
  // Phase 0 indexes, declared here so later migrations keep them.
  AuditEvent: ['@@index([entityType, entityId, at], map: "AuditEvent_entity_idx")'],
  Obligation: ['@@index([status, dueAt], map: "Obligation_due_idx")'],
  // Policy versions (SCHEMA §2): one number per head.
  JurisdictionPolicyVersion: ['@@unique([packId, versionNumber], map: "JurisdictionPolicyVersion_pack_number_key")'],
  LaborRateClassSetVersion: ['@@unique([shopId, versionNumber], map: "LaborRateClassSetVersion_shop_number_key")'],
  LaborMatrixVersion: ['@@unique([shopId, versionNumber], map: "LaborMatrixVersion_shop_number_key")'],
  PartsMatrixVersion: ['@@unique([shopId, versionNumber], map: "PartsMatrixVersion_shop_number_key")'],
  FeePolicyVersion: ['@@unique([shopId, versionNumber], map: "FeePolicyVersion_shop_number_key")'],
  TaxRuleSetVersion: ['@@unique([shopId, versionNumber], map: "TaxRuleSetVersion_shop_number_key")'],
  WarrantyTermSetVersion: ['@@unique([shopId, versionNumber], map: "WarrantyTermSetVersion_shop_number_key")'],
  ShopPolicyVersion: ['@@unique([shopId, versionNumber], map: "ShopPolicyVersion_shop_number_key")'],
  LaborRateClass: ['@@unique([setId, code], map: "LaborRateClass_set_code_key")'],
  TaxRule: ['@@unique([ruleSetId, categoryId], map: "TaxRule_set_category_key")'],
  WarrantyTerm: ['@@unique([termSetId, code], map: "WarrantyTerm_set_code_key")'],
  // Customers and vehicles (SCHEMA §3, §20).
  CustomerContact: ['@@unique([customerId, kind, valueHash], map: "CustomerContact_customer_kind_hash_key")'],
  Customer: ['@@index([lastName, firstName], map: "Customer_name_idx")'],
  PlateRegistration: ['@@index([state, plate], map: "PlateRegistration_state_plate_idx")'],
  ExternalReference: ['@@unique([system, entityType, externalId], map: "ExternalReference_system_entity_external_key")', '@@index([entityType, entityId], map: "ExternalReference_entity_idx")'],
  OdometerReading: ['@@index([vehicleId, at], map: "OdometerReading_vehicle_at_idx")'],
  ContactConsent: ['@@index([contactId, channel, purpose, at], map: "ContactConsent_latest_idx")'],
  RecallCheck: ['@@index([vehicleId, checkedAt], map: "RecallCheck_vehicle_at_idx")'],
  // Scheduling (SCHEMA §4).
  Appointment: ['@@index([shopId, startsAt], map: "Appointment_shop_starts_idx")', '@@index([shopId, date, status], map: "Appointment_shop_date_status_idx")'],
  BookingHold: ['@@index([shopId, date, status], map: "BookingHold_shop_date_status_idx")'],
  // Repair orders, estimates and authorization (SCHEMA §5-7).
  RepairOrder: ['@@index([shopId, status], map: "RepairOrder_shop_status_idx")', '@@index([vehicleId, createdAt], map: "RepairOrder_vehicle_created_idx")', '@@index([customerId, createdAt], map: "RepairOrder_customer_created_idx")'],
  Job: ['@@unique([repairOrderId, number], map: "Job_ro_number_key")'],
  EstimateVersion: ['@@unique([repairOrderId, versionNumber], map: "EstimateVersion_ro_number_key")'],
  InspectionTemplateVersion: ['@@unique([templateId, versionNumber], map: "InspectionTemplateVersion_template_number_key")'],
  InspectionItemResult: ['@@unique([inspectionId, templateItemId], map: "InspectionItemResult_inspection_item_key")'],
  CannedJobVersion: ['@@unique([cannedJobId, versionNumber], map: "CannedJobVersion_job_number_key")'],
  PublishedService: ['@@unique([shopId, slug], map: "PublishedService_shop_slug_key")'],
  LaborOperation: ['@@index([code], map: "LaborOperation_code_idx")'],
  StaffTask: ['@@index([shopId, status, dueAt], map: "StaffTask_shop_status_due_idx")'],
}

export function addDatabaseConstraints(schema: string): string {
  for (const [modelName, directives] of Object.entries(COMPOUND_UNIQUES)) {
    const pattern = new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`)
    const model = schema.match(pattern)?.[0]
    if (!model) throw new Error(`Generated Prisma schema is missing ${modelName}`)
    const missing = directives.filter(directive => !model.includes(directive))
    if (!missing.length) continue
    schema = schema.replace(model, model.replace(/\n\}$/, `\n${missing.map(directive => `  ${directive}`).join('\n')}\n}`))
  }
  return schema
}
