WITH moved_orders AS (
  UPDATE orders
  SET status = 'preparing', updated_at = NOW()
  WHERE status = 'accepted'
  RETURNING id, order_code, outlet_id, updated_at
), history_rows AS (
  INSERT INTO order_status_history (order_id, status, note)
  SELECT id, 'preparing', 'Preparation begins immediately after restaurant acceptance'
  FROM moved_orders
  RETURNING order_id
)
SELECT pg_notify(
  'toh_order_events',
  json_build_object(
    'orderCode', order_code,
    'outletId', outlet_id,
    'status', 'preparing',
    'updatedAt', updated_at
  )::text
)
FROM moved_orders;
