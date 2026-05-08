type DashboardRun = {
  cron: string;
  executionPath: string;
  finishedAt: string;
  id: number;
  mode: string;
  plannedOwnerCount: number;
  plannedRepoCount: number;
  processedOwnerCount: number;
  processedRepoCount: number;
  rateLimitedUntil: string | null;
  reposDeferredByRateLimit: number;
  startedAt: string;
  status: string;
};

type DashboardJobCount = {
  count: number;
  kind: string;
  status: string;
};

type DashboardJob = {
  attemptCount: number;
  finishedAt: string | null;
  id: string;
  kind: string;
  lastError: string | null;
  lastErrorKind: string | null;
  lastErrorStage: string | null;
  owner: string;
  rateLimitedUntil: string | null;
  repo: string | null;
  startedAt: string | null;
  status: string;
  updatedAt: string;
};

type DashboardProject = {
  firstSeenAt: string;
  lastSeenAt: string;
  owner: string;
  repo: string;
  repoCreatedAt: string | null;
  slug: string;
};

type DashboardPageProps = {
  activeJobs: DashboardJob[];
  generatedAt: Date;
  latestJobCounts: DashboardJobCount[];
  recentProjects: DashboardProject[];
  runs: DashboardRun[];
  totalProjects: number;
};

const DAILY_CRON_HOUR_UTC = 12;
const WEEKLY_RECONCILE_DAY_UTC = 0;
const WEEKLY_RECONCILE_HOUR_UTC = 3;
const WEEKLY_RECONCILE_MINUTE_UTC = 17;

function formatDateTime(value: string | Date | null): string {
  if (!value) {
    return "not recorded";
  }

  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.valueOf())) {
    return "not recorded";
  }

  return date.toISOString().replace("T", " ").replace(".000Z", "Z");
}

function formatRelativeTime(value: string | null, now: Date): string {
  if (!value) {
    return "unknown";
  }

  const date = new Date(value);
  const elapsedMs = now.valueOf() - date.valueOf();

  if (Number.isNaN(elapsedMs)) {
    return "unknown";
  }

  const minutes = Math.max(0, Math.round(elapsedMs / 60_000));

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 48) {
    return `${hours}h ago`;
  }

  return `${Math.round(hours / 24)}d ago`;
}

function nextDailyRun(now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(DAILY_CRON_HOUR_UTC, 0, 0, 0);

  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
}

function nextWeeklyRun(now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(
    WEEKLY_RECONCILE_HOUR_UTC,
    WEEKLY_RECONCILE_MINUTE_UTC,
    0,
    0,
  );
  const daysUntilSunday = (WEEKLY_RECONCILE_DAY_UTC - next.getUTCDay() + 7) % 7;
  next.setUTCDate(next.getUTCDate() + daysUntilSunday);

  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 7);
  }

  return next;
}

function summarizePipeline(options: {
  activeJobs: DashboardJob[];
  latestRun: DashboardRun | null;
  now: Date;
}): {
  copy: string;
  label: string;
  tone: "attention" | "calm" | "watching";
} {
  const problemJob = options.activeJobs.find((job) =>
    ["deferred", "failed"].includes(job.status),
  );

  if (problemJob) {
    return {
      copy: `${problemJob.kind} ${problemJob.owner}/${problemJob.repo ?? "account"} is ${problemJob.status}.`,
      label: "Needs attention",
      tone: "attention",
    };
  }

  if (!options.latestRun) {
    return {
      copy: "No durable sync run has been recorded yet.",
      label: "No run history",
      tone: "attention",
    };
  }

  const activeCount = options.activeJobs.filter((job) =>
    ["queued", "processing"].includes(job.status),
  ).length;

  if (activeCount > 0) {
    return {
      copy: `${activeCount} queue ${activeCount === 1 ? "job is" : "jobs are"} still moving through the pipeline.`,
      label: "Working",
      tone: "watching",
    };
  }

  if (options.latestRun.status === "succeeded") {
    return {
      copy: `Last run finished ${formatRelativeTime(options.latestRun.finishedAt, options.now)} with no deferred jobs.`,
      label: "All quiet",
      tone: "calm",
    };
  }

  return {
    copy: `Latest run is ${options.latestRun.status}; check job rows before assuming ingestion is stuck.`,
    label: "Watching",
    tone: "watching",
  };
}

function jobSubject(job: DashboardJob): string {
  return job.repo ? `${job.owner}/${job.repo}` : job.owner;
}

function latestRunDuration(run: DashboardRun | null): string {
  if (!run) {
    return "unknown";
  }

  const startedAt = new Date(run.startedAt).valueOf();
  const finishedAt = new Date(run.finishedAt).valueOf();

  if (Number.isNaN(startedAt) || Number.isNaN(finishedAt)) {
    return "unknown";
  }

  return `${Math.max(0, Math.round((finishedAt - startedAt) / 1000))}s`;
}

function countByStatus(counts: DashboardJobCount[], status: string): number {
  return counts
    .filter((row) => row.status === status)
    .reduce((total, row) => total + row.count, 0);
}

function DashboardMetric({
  label,
  value,
  detail,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="dashboard-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export function DashboardPage({
  activeJobs,
  generatedAt,
  latestJobCounts,
  recentProjects,
  runs,
  totalProjects,
}: DashboardPageProps) {
  const latestRun = runs[0] ?? null;
  const summary = summarizePipeline({
    activeJobs,
    latestRun,
    now: generatedAt,
  });
  const failedJobs = countByStatus(latestJobCounts, "failed");
  const deferredJobs = countByStatus(latestJobCounts, "deferred");
  const activeJobCount = activeJobs.filter((job) =>
    ["queued", "processing"].includes(job.status),
  ).length;

  return (
    <div className="dashboard-shell">
      <section className={`dashboard-hero dashboard-hero-${summary.tone}`}>
        <p className="feed-card-kicker">Crawl control</p>
        <h2>{summary.label}</h2>
        <p>{summary.copy}</p>
        <dl>
          <div>
            <dt>Generated</dt>
            <dd>{formatDateTime(generatedAt)}</dd>
          </div>
          <div>
            <dt>Next daily</dt>
            <dd>{formatDateTime(nextDailyRun(generatedAt))}</dd>
          </div>
          <div>
            <dt>Next reconcile</dt>
            <dd>{formatDateTime(nextWeeklyRun(generatedAt))}</dd>
          </div>
        </dl>
      </section>

      <section className="dashboard-metrics" aria-label="Pipeline vitals">
        <DashboardMetric
          label="Latest run"
          value={latestRun ? latestRun.status : "missing"}
          detail={
            latestRun
              ? `${latestRun.executionPath} / ${formatRelativeTime(latestRun.finishedAt, generatedAt)}`
              : "no run rows"
          }
        />
        <DashboardMetric
          label="Queue jobs"
          value={`${countByStatus(latestJobCounts, "succeeded")} ok`}
          detail={`${activeJobCount} active, ${failedJobs} failed, ${deferredJobs} deferred`}
        />
        <DashboardMetric
          label="Projects"
          value={String(totalProjects)}
          detail={`${recentProjects[0]?.slug ?? "none"} discovered most recently`}
        />
        <DashboardMetric
          label="Duration"
          value={latestRunDuration(latestRun)}
          detail={
            latestRun
              ? `${latestRun.processedOwnerCount}/${latestRun.plannedOwnerCount} owners, ${latestRun.processedRepoCount}/${latestRun.plannedRepoCount} repos`
              : "waiting for first run"
          }
        />
      </section>

      <section className="dashboard-grid">
        <article className="card dashboard-panel">
          <div className="card-body dashboard-panel-body">
            <div className="design-heading-block">
              <p className="feed-card-kicker">Run ledger</p>
              <h3 className="project-title design-subtitle">Recent syncs</h3>
            </div>
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Status</th>
                    <th>Path</th>
                    <th>Finished</th>
                    <th>Work</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td>#{run.id}</td>
                      <td>{run.status}</td>
                      <td>{run.executionPath}</td>
                      <td>{formatRelativeTime(run.finishedAt, generatedAt)}</td>
                      <td>
                        {run.processedOwnerCount}/{run.plannedOwnerCount} owners
                        / {run.processedRepoCount}/{run.plannedRepoCount} repos
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </article>

        <article className="card dashboard-panel">
          <div className="card-body dashboard-panel-body">
            <div className="design-heading-block">
              <p className="feed-card-kicker">Latest run</p>
              <h3 className="project-title design-subtitle">Job counts</h3>
            </div>
            <ul className="dashboard-count-list">
              {latestJobCounts.length ? (
                latestJobCounts.map((row) => (
                  <li key={`${row.kind}-${row.status}`}>
                    <span>{row.kind}</span>
                    <strong>{row.count}</strong>
                    <small>{row.status}</small>
                  </li>
                ))
              ) : (
                <li>
                  <span>No job rows</span>
                  <strong>0</strong>
                  <small>nothing queued</small>
                </li>
              )}
            </ul>
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="card dashboard-panel">
          <div className="card-body dashboard-panel-body">
            <div className="design-heading-block">
              <p className="feed-card-kicker">Attention list</p>
              <h3 className="project-title design-subtitle">
                Active or problem jobs
              </h3>
            </div>
            {activeJobs.length ? (
              <ul className="dashboard-job-list">
                {activeJobs.map((job) => (
                  <li key={job.id}>
                    <div>
                      <strong>{jobSubject(job)}</strong>
                      <span>
                        {job.kind} / {job.status} / attempt {job.attemptCount}
                      </span>
                    </div>
                    <small>
                      {job.lastError ?? formatDateTime(job.updatedAt)}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dashboard-empty-copy">
                No queued, processing, failed, or deferred jobs. This is the
                line you wanted to see.
              </p>
            )}
          </div>
        </article>

        <article className="card dashboard-panel">
          <div className="card-body dashboard-panel-body">
            <div className="design-heading-block">
              <p className="feed-card-kicker">Discovery</p>
              <h3 className="project-title design-subtitle">
                Recently found projects
              </h3>
            </div>
            <ul className="dashboard-project-list">
              {recentProjects.map((project) => (
                <li key={project.slug}>
                  <a href={`/projects/${project.owner}/${project.repo}.json`}>
                    {project.slug}
                  </a>
                  <span>
                    first seen{" "}
                    {formatRelativeTime(project.firstSeenAt, generatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </article>
      </section>
    </div>
  );
}
