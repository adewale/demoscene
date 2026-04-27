CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cron TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  summary_json TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS sync_runs_started_at_idx
ON sync_runs(started_at);
