-- Migration 0009: FK performance indexes
-- PostgreSQL does NOT auto-index foreign key columns.
-- Without these, JOINs and FK lookups do sequential scans at scale.
-- This migration adds indexes for every FK column that lacks one.

-- ── inventory_records ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inventory_records_registered_by ON inventory_records(registered_by);

-- ── samples ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_samples_product_id ON samples(product_id);
CREATE INDEX IF NOT EXISTS idx_samples_taken_by ON samples(taken_by);

-- ── dye_lots ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_dye_lots_product_id ON dye_lots(product_id);
CREATE INDEX IF NOT EXISTS idx_dye_lots_approved_by ON dye_lots(approved_by);
CREATE INDEX IF NOT EXISTS idx_dye_lots_registered_by ON dye_lots(registered_by);

-- ── immobilized_products ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_immobilized_products_product_id ON immobilized_products(product_id);
CREATE INDEX IF NOT EXISTS idx_immobilized_products_released_by ON immobilized_products(released_by);
CREATE INDEX IF NOT EXISTS idx_immobilized_products_registered_by ON immobilized_products(registered_by);

-- ── final_disposition ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_final_disposition_product_id ON final_disposition(product_id);
CREATE INDEX IF NOT EXISTS idx_final_disposition_approved_by ON final_disposition(approved_by);
CREATE INDEX IF NOT EXISTS idx_final_disposition_registered_by ON final_disposition(registered_by);

-- ── epp_deliveries ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_epp_deliveries_epp_id ON epp_deliveries(epp_id);
CREATE INDEX IF NOT EXISTS idx_epp_deliveries_personnel_id ON epp_deliveries(personnel_id);
CREATE INDEX IF NOT EXISTS idx_epp_deliveries_delivered_by ON epp_deliveries(delivered_by);

-- ── epp_checklists ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_epp_checklists_personnel_id ON epp_checklists(personnel_id);
CREATE INDEX IF NOT EXISTS idx_epp_checklists_reviewed_by ON epp_checklists(reviewed_by);

-- ── cuadre_records ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cuadre_records_registered_by ON cuadre_records(registered_by);

-- ── cuadre_items ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cuadre_items_cuadre_id ON cuadre_items(cuadre_id);

-- ── balance_records ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_balance_records_registered_by ON balance_records(registered_by);

-- ── documents ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);

-- ── lot_evaluations ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lot_evaluations_registered_by ON lot_evaluations(registered_by);

-- ── inventory_boxes ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inventory_boxes_inventory_record_id ON inventory_boxes(inventory_record_id);

-- ── surplus_products ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_surplus_products_product_id ON surplus_products(product_id);
CREATE INDEX IF NOT EXISTS idx_surplus_products_registered_by ON surplus_products(registered_by);

-- ── user_permissions ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_permissions_updated_by ON user_permissions(updated_by);
