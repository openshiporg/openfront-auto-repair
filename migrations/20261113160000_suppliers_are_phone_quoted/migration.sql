-- No parts-supplier API is licensed, so every supplier is quoted and ordered by phone. The three
-- demo counters were created with the retired in-memory "fixture" adapter; point them at the real one.
-- Only the adapter name changes. Past orders and quotes keep their history untouched.
UPDATE "Supplier" SET "adapter" = 'manual' WHERE "adapter" = 'fixture';
