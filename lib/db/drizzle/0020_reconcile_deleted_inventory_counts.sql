-- Reconcile active cycle entries whose linked physical count was deleted.
-- Restore the most recent remaining physical count when available; otherwise
-- put the product back in the pending lane.
WITH stale_cycle_products AS (
  SELECT
    cycle_product.id AS cycle_product_id,
    cycle_product.cycle_id,
    cycle_product.product_id,
    cycle.warehouse
  FROM inventory_cycle_products AS cycle_product
  JOIN inventory_cycles AS cycle ON cycle.id = cycle_product.cycle_id
  WHERE cycle.status = 'active'
    AND cycle_product.inventory_record_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM inventory_records AS record
      WHERE record.id = cycle_product.inventory_record_id
    )
), previous_counts AS (
  SELECT DISTINCT ON (stale.cycle_product_id)
    stale.cycle_product_id,
    record.id,
    record.physical_count,
    record.record_date,
    record.registered_by,
    record.previous_balance
  FROM stale_cycle_products AS stale
  JOIN inventory_records AS record
    ON record.product_id = stale.product_id
   AND record.warehouse = stale.warehouse
   AND record.physical_count IS NOT NULL
  ORDER BY stale.cycle_product_id, record.record_date DESC, record.created_at DESC
), repaired AS (
  UPDATE inventory_cycle_products AS cycle_product
  SET status = CASE WHEN previous.id IS NULL THEN 'pending' ELSE 'counted' END,
      physical_count = previous.physical_count,
      final_quantity = previous.physical_count,
      counted_date = previous.record_date,
      counted_by = previous.registered_by,
      difference = CASE
        WHEN previous.id IS NULL THEN NULL
        ELSE previous.physical_count - previous.previous_balance
      END,
      inventory_record_id = previous.id,
      final_ultimo_consumo = previous.record_date,
      final_balance_batch_id = NULL,
      updated_at = now()
  FROM stale_cycle_products AS stale
  LEFT JOIN previous_counts AS previous
    ON previous.cycle_product_id = stale.cycle_product_id
  WHERE cycle_product.id = stale.cycle_product_id
  RETURNING cycle_product.cycle_id
)
UPDATE inventory_cycles AS cycle
SET counted_products = (
      SELECT COUNT(*)::integer
      FROM inventory_cycle_products AS cycle_product
      WHERE cycle_product.cycle_id = cycle.id
        AND cycle_product.status IN ('counted', 'verified')
    ),
    without_movement = (
      SELECT COUNT(*)::integer
      FROM inventory_cycle_products AS cycle_product
      WHERE cycle_product.cycle_id = cycle.id
        AND cycle_product.status = 'without_movement'
    ),
    updated_at = now()
WHERE cycle.id IN (SELECT DISTINCT cycle_id FROM repaired);
