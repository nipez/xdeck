-- Cheap personal mode: timeline feed cache + monthly X read counter

ALTER TABLE usage_counters ADD COLUMN reads_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS feed_cache (
  column_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  posts_json TEXT NOT NULL DEFAULT '[]',
  newest_post_id TEXT,
  newest_posted_at TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feed_cache_user ON feed_cache(user_id);
