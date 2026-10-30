-- Keep only the can number in the Q1 immobilized location labels.
UPDATE locations
SET map_label = 'Lata N.º ' || CAST(SUBSTRING(shelf FROM 2) AS INTEGER)
WHERE warehouse = 'Q1'
  AND zone = 'INMOVILIZADOS'
  AND rack = 'I01'
  AND type = 'shelf'
  AND shelf ~ '^L[0-9]{2}$';
