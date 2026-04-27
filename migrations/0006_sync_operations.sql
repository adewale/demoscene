CREATE TABLE sync_runs_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cron TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  planned_owner_count INTEGER NOT NULL DEFAULT 0,
  processed_owner_count INTEGER NOT NULL DEFAULT 0,
  planned_repo_count INTEGER NOT NULL DEFAULT 0,
  processed_repo_count INTEGER NOT NULL DEFAULT 0,
  last_checkpoint_json TEXT,
  rate_limit_snapshot_json TEXT,
  repos_deferred_by_rate_limit INTEGER NOT NULL DEFAULT 0,
  rate_limited_until TEXT,
  summary_json TEXT,
  error_message TEXT
);

INSERT INTO sync_runs_v2 (
  id,
  cron,
  mode,
  status,
  started_at,
  finished_at,
  summary_json,
  error_message
)
SELECT
  id,
  cron,
  mode,
  status,
  started_at,
  finished_at,
  summary_json,
  error_message
FROM sync_runs;

DROP TABLE sync_runs;
ALTER TABLE sync_runs_v2 RENAME TO sync_runs;
CREATE INDEX IF NOT EXISTS sync_runs_started_at_idx ON sync_runs(started_at);

CREATE TABLE IF NOT EXISTS sync_state (
  mode TEXT PRIMARY KEY NOT NULL,
  next_owner_cursor INTEGER NOT NULL,
  pending_repository_urls_json TEXT NOT NULL,
  checkpoint_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS github_response_cache (
  request_url TEXT PRIMARY KEY NOT NULL,
  etag TEXT,
  last_modified TEXT,
  link_header TEXT,
  response_body TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
