ALTER TABLE sync_runs ADD COLUMN execution_path TEXT NOT NULL DEFAULT 'single-run';
ALTER TABLE sync_runs ADD COLUMN planning_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS sync_runs_planning_key_unique ON sync_runs(planning_key);

CREATE TABLE sync_run_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  semantic_key TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  kind TEXT NOT NULL,
  mode TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT,
  repo_url TEXT,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TEXT,
  last_error TEXT,
  last_error_stage TEXT,
  last_error_kind TEXT,
  payload_json TEXT NOT NULL,
  queued_at TEXT NOT NULL,
  replay_of_job_id TEXT,
  started_at TEXT,
  finished_at TEXT,
  rate_limited_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX sync_run_jobs_run_status_idx ON sync_run_jobs(run_id, status);
CREATE INDEX sync_run_jobs_semantic_status_idx ON sync_run_jobs(semantic_key, status);

CREATE TABLE sync_run_phases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  error_count INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT
);

CREATE INDEX sync_run_phases_run_phase_idx ON sync_run_phases(run_id, phase);

CREATE TABLE sync_planner_locks (
  name TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
