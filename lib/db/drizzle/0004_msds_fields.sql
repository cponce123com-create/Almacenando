ALTER TABLE products ADD COLUMN hazard_level text DEFAULT 'precaucion';
ALTER TABLE products ADD COLUMN hazard_pictograms text DEFAULT '[]';
ALTER TABLE products ADD COLUMN first_aid text DEFAULT 'Lavar con agua 15 min · Usar guantes · Avisar supervisor';
