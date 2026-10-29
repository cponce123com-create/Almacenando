-- Create Q1 locations for immobilized dye cans:
-- Inmovilizados → year (2013 through the migration year) → five cans.
-- Reuse the editable map landmark as the parent zone so the map and inventory
-- selector point to the same location. Existing map coordinates are preserved.
DO $$
DECLARE
  root_id TEXT;
  year_id TEXT;
  year_value INTEGER;
  current_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  can_number INTEGER;
  year_label TEXT;
  can_label TEXT;
BEGIN
  SELECT id INTO root_id
  FROM locations
  WHERE warehouse = 'Q1'
    AND type = 'zone'
    AND LOWER(zone) = 'inmovilizados'
    AND rack IS NULL
    AND shelf IS NULL
    AND position IS NULL
    AND parent_location_id IS NULL
  ORDER BY created_at, id
  LIMIT 1;

  IF root_id IS NULL THEN
    root_id := md5('q1-location:auxiliares/reference/immobilized');
    INSERT INTO locations (
      id, warehouse, zone, shelf, type, is_active,
      map_section, map_label, map_x, map_y, map_width, map_height
    )
    VALUES (
      root_id, 'Q1', 'INMOVILIZADOS', NULL, 'zone', TRUE,
      'auxiliares', 'Inmovilizados', 4, 7, 14, 13
    )
    ON CONFLICT (id) DO UPDATE SET
      warehouse = 'Q1',
      zone = 'INMOVILIZADOS',
      rack = NULL,
      shelf = NULL,
      position = NULL,
      type = 'zone',
      parent_location_id = NULL,
      is_active = TRUE,
      map_section = COALESCE(locations.map_section, EXCLUDED.map_section),
      map_label = COALESCE(locations.map_label, EXCLUDED.map_label),
      map_x = COALESCE(locations.map_x, EXCLUDED.map_x),
      map_y = COALESCE(locations.map_y, EXCLUDED.map_y),
      map_width = COALESCE(locations.map_width, EXCLUDED.map_width),
      map_height = COALESCE(locations.map_height, EXCLUDED.map_height);
  END IF;

  UPDATE locations SET
    map_section = COALESCE(map_section, 'auxiliares'),
    map_label = COALESCE(map_label, 'Inmovilizados'),
    map_x = COALESCE(map_x, 4),
    map_y = COALESCE(map_y, 7),
    map_width = COALESCE(map_width, 14),
    map_height = COALESCE(map_height, 13)
  WHERE id = root_id;

  FOR year_value IN 2013..current_year LOOP
    year_label := year_value::TEXT;

    SELECT id INTO year_id
    FROM locations
    WHERE warehouse = 'Q1'
      AND parent_location_id = root_id
      AND type = 'rack'
      AND rack = year_label
      AND shelf IS NULL
      AND position IS NULL
    ORDER BY created_at, id
    LIMIT 1;

    IF year_id IS NULL THEN
      year_id := md5('q1-location:inmovilizados/year/' || year_label);
      INSERT INTO locations (id, warehouse, zone, rack, type, parent_location_id, is_active)
      VALUES (year_id, 'Q1', 'INMOVILIZADOS', year_label, 'rack', root_id, TRUE)
      ON CONFLICT (id) DO NOTHING;
    END IF;

    FOR can_number IN 1..5 LOOP
      can_label := 'Lata ' || LPAD(can_number::TEXT, 2, '0');

      IF NOT EXISTS (
        SELECT 1
        FROM locations
        WHERE warehouse = 'Q1'
          AND parent_location_id = year_id
          AND type = 'shelf'
          AND rack = year_label
          AND shelf = can_label
          AND position IS NULL
      ) THEN
        INSERT INTO locations (
          id, warehouse, zone, rack, shelf, type, parent_location_id, is_active
        )
        VALUES (
          md5('q1-location:inmovilizados/year/' || year_label || '/can/' || LPAD(can_number::TEXT, 2, '0')),
          'Q1', 'INMOVILIZADOS', year_label, can_label, 'shelf', year_id, TRUE
        )
        ON CONFLICT (id) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END $$;
