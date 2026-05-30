-- Migration 0010: Locations, Picking, Notifications, Barcodes
-- Agrega las tablas para ubicación estructurada, picking, notificaciones,
-- y campos de código de barras.

-- 1. ENUMS
CREATE TYPE location_type AS ENUM ('warehouse', 'zone', 'rack', 'shelf', 'position', 'pallet');
CREATE TYPE pick_order_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
CREATE TYPE notification_type AS ENUM ('low_stock', 'expiring_lot', 'info', 'warning');

-- 2. LOCATIONS
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  warehouse TEXT NOT NULL,
  zone TEXT,
  rack TEXT,
  shelf TEXT,
  position TEXT,
  barcode TEXT UNIQUE,
  type location_type NOT NULL DEFAULT 'rack',
  parent_location_id TEXT REFERENCES locations(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_near_scale BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. PICK ORDERS
CREATE TABLE IF NOT EXISTS pick_orders (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  status pick_order_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- 4. PICK ITEMS
CREATE TABLE IF NOT EXISTS pick_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES pick_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  picked_quantity INTEGER NOT NULL DEFAULT 0,
  location_id TEXT REFERENCES locations(id),
  picked_at TIMESTAMP
);

-- 5. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type notification_type NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 6. ADD COLUMNS TO EXISTING TABLES
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT UNIQUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS location_id TEXT REFERENCES locations(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE inventory_records ADD COLUMN IF NOT EXISTS location_id TEXT REFERENCES locations(id);

-- 7. INDEXES
CREATE INDEX IF NOT EXISTS locations_warehouse_idx ON locations(warehouse);
CREATE INDEX IF NOT EXISTS locations_zone_idx ON locations(zone);
CREATE INDEX IF NOT EXISTS locations_rack_idx ON locations(rack);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS pick_orders_status_idx ON pick_orders(status);
CREATE INDEX IF NOT EXISTS pick_items_order_id_idx ON pick_items(order_id);
CREATE INDEX IF NOT EXISTS products_barcode_idx ON products(barcode);
