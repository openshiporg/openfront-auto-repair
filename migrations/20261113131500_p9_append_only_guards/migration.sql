-- Provider responses and observations are evidence: never updated or deleted (SCHEMA G8).
CREATE TRIGGER "AccountingProviderResponse_append_only" BEFORE UPDATE OR DELETE ON "AccountingProviderResponse"
  FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
CREATE TRIGGER "ProviderObservation_append_only" BEFORE UPDATE OR DELETE ON "ProviderObservation"
  FOR EACH ROW EXECUTE FUNCTION deny_update_delete();
-- A batch is NOT_POSTED until a person confirms; and a posted batch can never go back.
ALTER TABLE "AccountingBatch" ADD CONSTRAINT "AccountingBatch_posting_check" CHECK ("postingStatus" IN ('NOT_POSTED','POSTED'));
ALTER TABLE "AccountingBatch" ADD CONSTRAINT "AccountingBatch_balanced_check" CHECK ("debitTotalMinor" = "creditTotalMinor");
