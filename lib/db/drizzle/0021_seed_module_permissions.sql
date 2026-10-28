WITH pages(page_id) AS (
  VALUES
    ('dashboard'), ('products'), ('inventory'), ('balances'), ('availability'), ('cuadre'),
    ('immobilized'), ('samples'), ('dye_lots'), ('lot_evals'), ('disposition'), ('epp'),
    ('personnel'), ('documents'), ('supplies'), ('surplus'), ('reports'), ('notifications'),
    ('admin_users'), ('msds'), ('compatibility'), ('lot_change_notification'),
    ('product_out_notification'), ('email_notifications'), ('locations'), ('rounds'),
    ('inventory_progress'), ('scanner'), ('picking'), ('warehouse_map')
), roles(role) AS (
  VALUES ('admin'::warehouse_role), ('supervisor'::warehouse_role), ('operator'::warehouse_role),
         ('quality'::warehouse_role), ('readonly'::warehouse_role)
), defaults AS (
  SELECT r.role, p.page_id,
    CASE r.role
      WHEN 'admin' THEN true
      WHEN 'supervisor' THEN p.page_id <> 'admin_users'
      WHEN 'operator' THEN p.page_id IN ('dashboard','products','inventory','balances','availability','cuadre','immobilized','epp','personnel','supplies','surplus','notifications','lot_change_notification','product_out_notification','email_notifications','locations','rounds','inventory_progress','scanner','picking','warehouse_map')
      WHEN 'quality' THEN p.page_id IN ('dashboard','products','samples','dye_lots','lot_evals','disposition','epp','reports','notifications','msds','compatibility','documents')
      WHEN 'readonly' THEN p.page_id IN ('dashboard','products','inventory','balances','reports')
      ELSE false
    END AS can_view,
    CASE r.role WHEN 'admin' THEN true WHEN 'supervisor' THEN true WHEN 'quality' THEN true ELSE false END AS can_import,
    CASE r.role WHEN 'admin' THEN true WHEN 'supervisor' THEN true WHEN 'quality' THEN true ELSE false END AS can_export,
    CASE r.role WHEN 'admin' THEN true WHEN 'supervisor' THEN true WHEN 'operator' THEN true WHEN 'quality' THEN true ELSE false END AS can_edit,
    CASE r.role WHEN 'admin' THEN true WHEN 'supervisor' THEN true ELSE false END AS can_delete
  FROM roles r CROSS JOIN pages p
)
INSERT INTO user_permissions (id, role, page_id, can_view, can_import, can_export, can_edit, can_delete, updated_at)
SELECT md5(role::text || ':' || page_id), role, page_id, can_view,
  can_view AND can_import, can_view AND can_export, can_view AND can_edit, can_view AND can_delete, now()
FROM defaults
ON CONFLICT (role, page_id) DO NOTHING;
