-- Migration 0011: Add index on notifications for common query pattern
-- This speeds up the deduplication check in scheduled-jobs.ts
-- and the bell icon query that loads unread notifications per user.

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_date
  ON notifications (user_id, is_read, created_at DESC);

-- Also useful for the "mark all as read" query
CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON notifications (user_id);
