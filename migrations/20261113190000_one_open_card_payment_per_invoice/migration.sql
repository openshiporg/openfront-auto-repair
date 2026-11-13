-- At most one open (initiated / pending / unknown) card-link payment per invoice, so a customer cannot be charged twice.
-- Card links pay one invoice; the first target invoice is the key.
CREATE UNIQUE INDEX "Payment_one_open_card_per_invoice" ON "Payment" ((("targetInvoiceIds" ->> 0)))
WHERE "tender" = 'card_link' AND "purpose" = 'invoice' AND "status" IN ('initiated', 'pending', 'unknown');
