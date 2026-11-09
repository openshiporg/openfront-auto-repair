-- Phase 5, review round 2 (F2): contact-value hashes become keyed.
-- Old values were an unsalted SHA-256 of "phone:+E164" or "email:address", which anyone who could read them could reverse offline.
-- New values are 'h1:' + HMAC-SHA256 under AUTO_SECRET_KEY. The old values are replaced here by a per-row placeholder
-- (keeps the (customer, kind, valueHash) unique intact); scripts/rehash-contacts.ts, run at start, fills each from the stored value.
UPDATE "CustomerContact" SET "valueHash" = 'pending:' || "id" WHERE "valueHash" !~ '^h1:[0-9a-f]{64}$';
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_hash_keyed" CHECK ("valueHash" ~ '^(h1:[0-9a-f]{64}|pending:.+)$');
