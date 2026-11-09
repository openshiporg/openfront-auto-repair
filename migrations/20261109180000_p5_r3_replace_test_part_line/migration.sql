-- Review r3 minor: PO-NGA-2026-00002 carried a placeholder part ("TIMEOUT-1", "Special-order part, supplier did not answer")
-- left by a send-timeout check, visible to staff on the Orders board. Replace it with a real Standard Motor Products part at the
-- same price and quantity, so the order total, stock ledger and audit chain are unchanged. Guarded on the exact rows: a no-op
-- on any database that does not hold them. The original shop_item.created audit event is left as history.
UPDATE "ShopItem"
   SET "sku" = 'STANDA-TX97', "partNumber" = 'TX97', "description" = 'Engine coolant temperature sensor', "updatedAt" = now()
 WHERE "id" = 'cmw7qfub0002vo901vo7npg84' AND "partNumber" = 'TIMEOUT-1'
   AND NOT EXISTS (SELECT 1 FROM "ShopItem" WHERE "shop" = 'seed_shop_nga' AND lower("sku") = 'standa-tx97');

UPDATE "SupplierOrderLine"
   SET "partNumber" = 'TX97', "description" = 'Engine coolant temperature sensor', "updatedAt" = now()
 WHERE "id" = 'cmw7qfub8002xo901328pgemi' AND "partNumber" = 'TIMEOUT-1';
