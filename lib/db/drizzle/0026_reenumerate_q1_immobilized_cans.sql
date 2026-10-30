-- Re-enumerate Q1 immobilized cans as fixed physical locations.
-- Product assignments that pointed to the old year-based cans are detached so
-- they can be reassigned to the newly numbered cans. Inventory text snapshots
-- are kept for historical audit.
BEGIN;

UPDATE products p
SET location_id = NULL
FROM locations old
WHERE p.location_id = old.id
  AND old.warehouse = 'Q1'
  AND old.zone = 'INMOVILIZADOS';

UPDATE inventory_records ir
SET location_id = NULL
FROM locations old
WHERE ir.location_id = old.id
  AND old.warehouse = 'Q1'
  AND old.zone = 'INMOVILIZADOS';

-- Keep the map landmark, remove the obsolete year and can hierarchy.
DELETE FROM locations
WHERE warehouse = 'Q1'
  AND zone = 'INMOVILIZADOS'
  AND id <> md5('q1-official:inmovilizados');

UPDATE locations
SET zone = 'INMOVILIZADOS',
    rack = 'I01',
    shelf = NULL,
    position = NULL,
    type = 'zone',
    parent_location_id = NULL,
    is_active = TRUE,
    map_section = 'auxiliares',
    map_label = 'Inmovilizados',
    map_x = 4,
    map_y = 7,
    map_width = 14,
    map_height = 13
WHERE id = md5('q1-official:inmovilizados')
  AND warehouse = 'Q1';

-- Fixed numbered cans: each can can contain multiple colorants.
-- The approximate capacity is descriptive; it is not a stock limit.
INSERT INTO locations (
  id, warehouse, zone, rack, shelf, type, parent_location_id, is_active, map_label
)
SELECT
  md5('q1-official:inmovilizados/can/' || LPAD(can_no::TEXT, 2, '0')),
  'Q1', 'INMOVILIZADOS', 'I01', 'L' || LPAD(can_no::TEXT, 2, '0'),
  'shelf', md5('q1-official:inmovilizados'), TRUE,
  'Lata N.º ' || can_no || ' · capacidad aprox. 50 kg'
FROM generate_series(1, 50) AS can_no
ON CONFLICT (id) DO UPDATE SET
  warehouse = EXCLUDED.warehouse,
  zone = EXCLUDED.zone,
  rack = EXCLUDED.rack,
  shelf = EXCLUDED.shelf,
  type = EXCLUDED.type,
  parent_location_id = EXCLUDED.parent_location_id,
  is_active = TRUE,
  map_label = EXCLUDED.map_label;

COMMIT;
