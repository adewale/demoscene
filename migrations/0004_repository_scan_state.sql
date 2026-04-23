CREATE TABLE IF NOT EXISTS repository_scan_state (
  repo_url TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  status TEXT NOT NULL,
  last_checked_at TEXT NOT NULL,
  next_check_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS repository_scan_state_next_check_idx
ON repository_scan_state(next_check_at);
