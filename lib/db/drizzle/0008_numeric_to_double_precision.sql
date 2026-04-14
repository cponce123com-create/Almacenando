-- Migration 0008: Convertir columnas NUMERIC a DOUBLE PRECISION
--
-- El tipo NUMERIC en PostgreSQL retorna strings en JavaScript/Node.js.
-- DOUBLE PRECISION retorna números nativos, eliminando la necesidad de
-- parseFloat() manual en toda la aplicación y previniendo bugs de tipado.
--
-- NOTA: Esta conversión es segura. DOUBLE PRECISION admite hasta 15-17 dígitos
-- significativos, más que suficiente para cantidades de almacén.

-- inventory_records
ALTER TABLE inventory_records
  ALTER COLUMN previous_balance TYPE DOUBLE PRECISION USING previous_balance::DOUBLE PRECISION,
  ALTER COLUMN inputs TYPE DOUBLE PRECISION USING inputs::DOUBLE PRECISION,
  ALTER COLUMN outputs TYPE DOUBLE PRECISION USING outputs::DOUBLE PRECISION,
  ALTER COLUMN final_balance TYPE DOUBLE PRECISION USING final_balance::DOUBLE PRECISION,
  ALTER COLUMN physical_count TYPE DOUBLE PRECISION USING physical_count::DOUBLE PRECISION;

-- products
ALTER TABLE products
  ALTER COLUMN minimum_stock TYPE DOUBLE PRECISION USING minimum_stock::DOUBLE PRECISION,
  ALTER COLUMN maximum_stock TYPE DOUBLE PRECISION USING maximum_stock::DOUBLE PRECISION;

-- balance_records
ALTER TABLE balance_records
  ALTER COLUMN quantity TYPE DOUBLE PRECISION USING quantity::DOUBLE PRECISION;

-- samples
ALTER TABLE samples
  ALTER COLUMN quantity TYPE DOUBLE PRECISION USING quantity::DOUBLE PRECISION;

-- immobilized_products
ALTER TABLE immobilized_products
  ALTER COLUMN quantity TYPE DOUBLE PRECISION USING quantity::DOUBLE PRECISION;

-- cuadre_items
ALTER TABLE cuadre_items
  ALTER COLUMN system_balance TYPE DOUBLE PRECISION USING system_balance::DOUBLE PRECISION,
  ALTER COLUMN physical_count TYPE DOUBLE PRECISION USING physical_count::DOUBLE PRECISION,
  ALTER COLUMN difference TYPE DOUBLE PRECISION USING difference::DOUBLE PRECISION;

-- dye_lots
ALTER TABLE dye_lots
  ALTER COLUMN quantity TYPE DOUBLE PRECISION USING quantity::DOUBLE PRECISION;

-- inventory_boxes
ALTER TABLE inventory_boxes
  ALTER COLUMN weight TYPE DOUBLE PRECISION USING weight::DOUBLE PRECISION;

-- final_disposition
ALTER TABLE final_disposition
  ALTER COLUMN quantity TYPE DOUBLE PRECISION USING quantity::DOUBLE PRECISION,
  ALTER COLUMN cost TYPE DOUBLE PRECISION USING cost::DOUBLE PRECISION;
