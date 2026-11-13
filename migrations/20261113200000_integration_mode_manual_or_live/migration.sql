-- Integration mode is manual or live only. The column is text, so no type swap: any row still saying 'sandbox' becomes 'manual'.
UPDATE "IntegrationConnection" SET "mode" = 'manual' WHERE "mode" = 'sandbox';
