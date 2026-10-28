-- Product codes are not globally unique within a warehouse: NOW can use the
-- same code for different item types (for example Q and S).
ALTER TABLE "cuadre_items"
  ADD COLUMN IF NOT EXISTS "type" text;

UPDATE "products" SET "type" = '' WHERE "type" IS NULL;
ALTER TABLE "products"
  ALTER COLUMN "type" SET DEFAULT '',
  ALTER COLUMN "type" SET NOT NULL;

-- Existing installations had at most one product per warehouse/code, so old
-- cuadre rows can be enriched safely before the wider key is introduced.
UPDATE "cuadre_items" AS ci
SET "type" = p."type"
FROM "cuadre_records" AS cr
JOIN "products" AS p ON p."warehouse" = cr."warehouse"
WHERE ci."cuadre_id" = cr."id"
  AND ci."code" = p."code"
  AND ci."type" IS NULL;

DROP INDEX IF EXISTS "products_warehouse_code_uniq";

CREATE UNIQUE INDEX IF NOT EXISTS "products_warehouse_type_code_uniq"
  ON "products" ("warehouse", "type", "code");
