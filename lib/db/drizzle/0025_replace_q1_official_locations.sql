-- Replace the old Q1 inventory catalog with the official physical locations.
-- Historical count text is retained so existing records can be edited and audited.
-- Standalone map reference landmarks (zone = REFERENCIAS) remain untouched.

-- Detach current product/count assignments before removing old location rows.
UPDATE products p
SET location_id = NULL
FROM locations old
WHERE p.location_id = old.id
  AND old.warehouse = 'Q1'
  AND old.zone IS DISTINCT FROM 'REFERENCIAS';

UPDATE inventory_records ir
SET location_id = NULL
FROM locations old
WHERE ir.location_id = old.id
  AND old.warehouse = 'Q1'
  AND old.zone IS DISTINCT FROM 'REFERENCIAS';

-- Preserve reference landmarks while detaching them from the old hierarchy.
UPDATE locations child
SET parent_location_id = NULL
FROM locations old
WHERE child.parent_location_id = old.id
  AND old.warehouse = 'Q1'
  AND old.zone IS DISTINCT FROM 'REFERENCIAS';

UPDATE locations
SET parent_location_id = NULL
WHERE warehouse = 'Q1'
  AND zone IS DISTINCT FROM 'REFERENCIAS';

DELETE FROM locations
WHERE warehouse = 'Q1'
  AND zone IS DISTINCT FROM 'REFERENCIAS';

-- The three catalog roots. Only the Inmovilizados zone is a map landmark;
-- its can/year leaves remain selectable in the inventory form.
INSERT INTO locations (
  id, warehouse, zone, rack, type, is_active, map_section, map_label,
  map_x, map_y, map_width, map_height
)
VALUES
  (md5('q1-official:colorantes'), 'Q1', 'COLORANTES', NULL, 'zone', TRUE, NULL, 'Colorantes', NULL, NULL, NULL, NULL),
  (md5('q1-official:auxiliares'), 'Q1', 'AUXILIARES', NULL, 'zone', TRUE, NULL, 'Auxiliares', NULL, NULL, NULL, NULL),
  (md5('q1-official:inmovilizados'), 'Q1', 'INMOVILIZADOS', 'I01', 'zone', TRUE, 'auxiliares', 'I01', 4, 7, 14, 13);

-- Five colorant racks; each rack is represented on the warehouse map.
WITH racks(rack_no, map_x, map_y, map_width, map_height) AS (VALUES
  (1, 4::DOUBLE PRECISION, 76::DOUBLE PRECISION, 24::DOUBLE PRECISION, 12::DOUBLE PRECISION),
  (2, 31::DOUBLE PRECISION, 76::DOUBLE PRECISION, 24::DOUBLE PRECISION, 12::DOUBLE PRECISION),
  (3, 58::DOUBLE PRECISION, 76::DOUBLE PRECISION, 24::DOUBLE PRECISION, 12::DOUBLE PRECISION),
  (4, 85::DOUBLE PRECISION, 20::DOUBLE PRECISION, 10::DOUBLE PRECISION, 48::DOUBLE PRECISION),
  (5, 35::DOUBLE PRECISION, 5::DOUBLE PRECISION, 48::DOUBLE PRECISION, 13::DOUBLE PRECISION)
)
INSERT INTO locations (
  id, warehouse, zone, rack, type, parent_location_id, is_active,
  map_section, map_label, map_x, map_y, map_width, map_height
)
SELECT
  md5('q1-official:colorantes/rack/' || rack_no), 'Q1', 'COLORANTES',
  'C' || LPAD(rack_no::TEXT, 2, '0'), 'rack', md5('q1-official:colorantes'), TRUE,
  'colorantes', 'C' || LPAD(rack_no::TEXT, 2, '0'), map_x, map_y, map_width, map_height
FROM racks;

-- The auxiliary rack and four single-level zones.
INSERT INTO locations (
  id, warehouse, zone, rack, type, parent_location_id, is_active,
  map_section, map_label, map_x, map_y, map_width, map_height
)
VALUES
  (md5('q1-official:auxiliares/rack/A01'), 'Q1', 'AUXILIARES', 'A01', 'rack', md5('q1-official:auxiliares'), TRUE, 'auxiliares', 'A01', 21, 7, 63, 14),
  (md5('q1-official:auxiliares/zona/A02'), 'Q1', 'AUXILIARES', 'A02', 'zone', md5('q1-official:auxiliares'), TRUE, 'auxiliares', 'A02', 4, 36, 25, 12),
  (md5('q1-official:auxiliares/zona/A03'), 'Q1', 'AUXILIARES', 'A03', 'zone', md5('q1-official:auxiliares'), TRUE, 'auxiliares', 'A03', 31, 36, 27, 12),
  (md5('q1-official:auxiliares/zona/A04'), 'Q1', 'AUXILIARES', 'A04', 'zone', md5('q1-official:auxiliares'), TRUE, 'auxiliares', 'A04', 4, 53, 54, 12),
  (md5('q1-official:auxiliares/zona/A05'), 'Q1', 'AUXILIARES', 'A05', 'zone', md5('q1-official:auxiliares'), TRUE, 'auxiliares', 'A05', 69, 31, 27, 12);

-- Five racks × four levels (20 selectable locations).
INSERT INTO locations (id, warehouse, zone, rack, shelf, type, parent_location_id, is_active, map_label)
SELECT
  md5('q1-official:colorantes/rack/' || rack_no || '/nivel/' || level_no),
  'Q1', 'COLORANTES', 'C' || LPAD(rack_no::TEXT, 2, '0'), 'N' || level_no,
  'shelf', md5('q1-official:colorantes/rack/' || rack_no), TRUE,
  'C' || LPAD(rack_no::TEXT, 2, '0') || '-N' || level_no
FROM generate_series(1, 5) AS rack_no
CROSS JOIN generate_series(1, 4) AS level_no;

-- Auxiliary rack: three levels with nine compartments each (27 selectable locations).
INSERT INTO locations (id, warehouse, zone, rack, shelf, type, parent_location_id, is_active, map_label)
SELECT
  md5('q1-official:auxiliares/rack/A01/nivel/' || level_no),
  'Q1', 'AUXILIARES', 'A01', 'N' || level_no, 'shelf',
  md5('q1-official:auxiliares/rack/A01'), TRUE, NULL
FROM generate_series(1, 3) AS level_no;

INSERT INTO locations (id, warehouse, zone, rack, shelf, position, type, parent_location_id, is_active, map_label)
SELECT
  md5('q1-official:auxiliares/rack/A01/nivel/' || level_no || '/compartimiento/' || compartment_no),
  'Q1', 'AUXILIARES', 'A01', 'N' || level_no, LPAD(compartment_no::TEXT, 2, '0'),
  'position', md5('q1-official:auxiliares/rack/A01/nivel/' || level_no), TRUE,
  'A01-N' || level_no || '-' || LPAD(compartment_no::TEXT, 2, '0')
FROM generate_series(1, 3) AS level_no
CROSS JOIN generate_series(1, 9) AS compartment_no;

-- Zones A02–A05 each have one level (four selectable locations).
INSERT INTO locations (id, warehouse, zone, rack, shelf, type, parent_location_id, is_active, map_label)
SELECT
  md5('q1-official:auxiliares/zona/' || zone_no || '/nivel/1'),
  'Q1', 'AUXILIARES', 'A' || LPAD(zone_no::TEXT, 2, '0'), 'N1', 'shelf',
  md5('q1-official:auxiliares/zona/A' || LPAD(zone_no::TEXT, 2, '0')), TRUE,
  'A' || LPAD(zone_no::TEXT, 2, '0') || '-N1'
FROM generate_series(2, 5) AS zone_no;

-- One Inmovilizados zone, five cans for every year from 2013 through the current year.
INSERT INTO locations (id, warehouse, zone, rack, type, parent_location_id, is_active)
SELECT
  md5('q1-official:inmovilizados/year/' || year_no), 'Q1', 'INMOVILIZADOS',
  year_no::TEXT, 'rack', md5('q1-official:inmovilizados'), TRUE
FROM generate_series(2013, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER) AS year_no;

INSERT INTO locations (id, warehouse, zone, rack, shelf, type, parent_location_id, is_active, map_label)
SELECT
  md5('q1-official:inmovilizados/year/' || year_no || '/lata/' || LPAD(can_no::TEXT, 2, '0')),
  'Q1', 'INMOVILIZADOS', year_no::TEXT, 'L' || LPAD(can_no::TEXT, 2, '0'),
  'shelf', md5('q1-official:inmovilizados/year/' || year_no), TRUE,
  'I01-' || year_no || '-L' || LPAD(can_no::TEXT, 2, '0')
FROM generate_series(2013, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER) AS year_no
CROSS JOIN generate_series(1, 5) AS can_no;
