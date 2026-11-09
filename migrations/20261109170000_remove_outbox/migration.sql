-- The outbox was never drained and nothing consumes it: auto repair has no external event delivery.
-- External events, if ever needed, use Openfront Commerce webhooks (features/webhooks).
DROP TABLE "OutboxEvent";
