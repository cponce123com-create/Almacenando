ALTER TABLE locations ADD COLUMN IF NOT EXISTS map_section TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS map_label TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS map_x DOUBLE PRECISION;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS map_y DOUBLE PRECISION;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS map_width DOUBLE PRECISION;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS map_height DOUBLE PRECISION;

-- Default positions follow the user's hand-drawn plans and remain fully editable.
WITH layout(location_key, section, label, x, y, width, height) AS (VALUES
  ('colorantes/rack/1', 'colorantes', 'RACK 1', 4, 76, 24, 12),
  ('colorantes/rack/2', 'colorantes', 'RACK 2', 31, 76, 24, 12),
  ('colorantes/rack/3', 'colorantes', 'RACK 3', 58, 76, 24, 12),
  ('colorantes/rack/4', 'colorantes', 'RACK 4', 85, 20, 10, 48),
  ('colorantes/rack/5', 'colorantes', 'RACK 5', 35, 5, 48, 13),
  ('auxiliares/zona/A/rack/1', 'auxiliares', 'AUXILIARES · A', 21, 7, 63, 14),
  ('auxiliares/zona/B', 'auxiliares', 'AUXILIARES · B', 4, 36, 54, 12),
  ('auxiliares/zona/C', 'auxiliares', 'AUXILIARES · C', 4, 53, 54, 12),
  ('auxiliares/zona/D', 'auxiliares', 'AUXILIARES · D', 4, 77, 60, 12)
)
UPDATE locations l SET
  map_section = layout.section,
  map_label = layout.label,
  map_x = layout.x,
  map_y = layout.y,
  map_width = layout.width,
  map_height = layout.height
FROM layout
WHERE l.id = md5('q1-location:' || layout.location_key);

WITH landmarks(location_key, section, label, x, y, width, height) AS (VALUES
  ('colorantes/reference/lockers', 'colorantes', 'Casilleros personal', 4, 31, 15, 12),
  ('colorantes/reference/scale', 'colorantes', 'Balanza', 4, 51, 15, 12),
  ('auxiliares/reference/immobilized', 'auxiliares', 'Inmovilizados', 4, 7, 14, 13),
  ('auxiliares/reference/oxygen', 'auxiliares', 'Agua oxigenada', 69, 31, 13, 12),
  ('auxiliares/reference/blends-2', 'auxiliares', 'Blends 2', 84, 31, 12, 12),
  ('auxiliares/reference/work-table', 'auxiliares', 'Mesa de trabajo', 69, 49, 27, 14),
  ('auxiliares/reference/scale-1', 'auxiliares', 'Balanza 1', 69, 68, 13, 12),
  ('auxiliares/reference/blends-1', 'auxiliares', 'Blends 1', 84, 68, 12, 12),
  ('auxiliares/reference/caustic-soda', 'auxiliares', 'Soda cáustica', 69, 83, 27, 12)
)
INSERT INTO locations (
  id, warehouse, zone, shelf, type, is_active,
  map_section, map_label, map_x, map_y, map_width, map_height
)
SELECT md5('q1-location:' || location_key), 'Q1', 'REFERENCIAS', label, 'zone'::location_type, true,
  section, label, x, y, width, height
FROM landmarks
ON CONFLICT (id) DO UPDATE SET
  map_section = EXCLUDED.map_section,
  map_label = EXCLUDED.map_label,
  map_x = EXCLUDED.map_x,
  map_y = EXCLUDED.map_y,
  map_width = EXCLUDED.map_width,
  map_height = EXCLUDED.map_height;
