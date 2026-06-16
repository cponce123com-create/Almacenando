-- Migration 0012: Inventory cycles and cycle products
-- Tracks each "round" of physical inventory counting and per-product progress.

CREATE TABLE IF NOT EXISTS inventory_cycles (
  id TEXT PRIMARY KEY,
  warehouse TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  total_products INTEGER NOT NULL DEFAULT 0,
  counted_products INTEGER NOT NULL DEFAULT 0,
  without_movement INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  closed_by TEXT REFERENCES users(id),
  closed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_cycle_products (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES inventory_cycles(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  initial_balance_batch_id TEXT,
  final_balance_batch_id TEXT,
  initial_quantity DOUBLE PRECISION,
  final_quantity DOUBLE PRECISION,
  initial_ultimo_consumo DATE,
  final_ultimo_consumo DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_date DATE,
  counted_date DATE,
  physical_count DOUBLE PRECISION,
  counted_by TEXT REFERENCES users(id),
  difference DOUBLE PRECISION,
  notes TEXT,
  inventory_record_id TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS icp_cycle_status_idx ON inventory_cycle_products (cycle_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS icp_cycle_product_uniq ON inventory_cycle_products (cycle_id, product_id);
