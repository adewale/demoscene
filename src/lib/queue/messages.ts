import type { SyncMode } from "../../domain";

type QueueJobKind = "scan-owner" | "sync-repo" | "verify-missing-repo";

export type QueueJobStatus =
  | "cancelled"
  | "deferred"
  | "failed"
  | "processing"
  | "queued"
  | "succeeded";

type BaseQueueMessage = {
  correlationId: string;
  kind: QueueJobKind;
  mode: SyncMode;
  owner: string;
  runId: string;
  schemaVersion: 1;
};

export type ScanOwnerQueueMessage = BaseQueueMessage & {
  cursor: number;
  kind: "scan-owner";
  scheduledAt: string;
};

export type SyncRepoQueueMessage = BaseQueueMessage & {
  discoveredAt: string;
  kind: "sync-repo";
  repo: string;
  repoUrl: string;
};

export type VerifyMissingRepoQueueMessage = BaseQueueMessage & {
  kind: "verify-missing-repo";
  repo: string;
  repoUrl: string;
};

export type QueueMessageBody =
  | ScanOwnerQueueMessage
  | SyncRepoQueueMessage
  | VerifyMissingRepoQueueMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type StringFieldName =
  | "correlationId"
  | "discoveredAt"
  | "kind"
  | "mode"
  | "owner"
  | "repo"
  | "repoUrl"
  | "runId"
  | "scheduledAt";

function readStringField(
  value: Record<string, unknown>,
  fieldName: StringFieldName,
): unknown {
  switch (fieldName) {
    case "correlationId":
      return value.correlationId;
    case "discoveredAt":
      return value.discoveredAt;
    case "kind":
      return value.kind;
    case "mode":
      return value.mode;
    case "owner":
      return value.owner;
    case "repo":
      return value.repo;
    case "repoUrl":
      return value.repoUrl;
    case "runId":
      return value.runId;
    case "scheduledAt":
      return value.scheduledAt;
  }
}

function requireString(
  value: Record<string, unknown>,
  fieldName: StringFieldName,
): string {
  const fieldValue = readStringField(value, fieldName);

  if (typeof fieldValue !== "string" || fieldValue.length === 0) {
    throw new Error(`Queue message ${fieldName} must be a non-empty string`);
  }

  return fieldValue;
}

function requireMode(value: Record<string, unknown>): SyncMode {
  const mode = requireString(value, "mode");

  if (mode !== "incremental" && mode !== "reconcile") {
    throw new Error(`Queue message mode is unsupported: ${mode}`);
  }

  return mode;
}

function requireSchemaVersion(value: Record<string, unknown>): 1 {
  if (value.schemaVersion !== 1) {
    throw new Error("Queue message schemaVersion must be 1");
  }

  return 1;
}

function requireCursor(value: Record<string, unknown>): number {
  const cursor = value.cursor;

  if (typeof cursor !== "number" || !Number.isInteger(cursor) || cursor < 0) {
    throw new Error("Queue message cursor must be a non-negative integer");
  }

  return cursor;
}

function parseBaseMessage(value: Record<string, unknown>) {
  return {
    correlationId: requireString(value, "correlationId"),
    mode: requireMode(value),
    owner: requireString(value, "owner"),
    runId: requireString(value, "runId"),
    schemaVersion: requireSchemaVersion(value),
  };
}

export function parseQueueMessage(value: unknown): QueueMessageBody {
  if (!isRecord(value)) {
    throw new Error("Queue message must be an object");
  }

  const kind = requireString(value, "kind");
  const baseMessage = parseBaseMessage(value);

  if (kind === "scan-owner") {
    return {
      ...baseMessage,
      cursor: requireCursor(value),
      kind,
      scheduledAt: requireString(value, "scheduledAt"),
    };
  }

  if (kind === "sync-repo") {
    return {
      ...baseMessage,
      discoveredAt: requireString(value, "discoveredAt"),
      kind,
      repo: requireString(value, "repo"),
      repoUrl: requireString(value, "repoUrl"),
    };
  }

  if (kind === "verify-missing-repo") {
    return {
      ...baseMessage,
      kind,
      repo: requireString(value, "repo"),
      repoUrl: requireString(value, "repoUrl"),
    };
  }

  throw new Error(`Queue message kind is unsupported: ${kind}`);
}

export function buildQueueJobId(message: QueueMessageBody): string {
  if (message.kind === "scan-owner") {
    return [message.runId, message.kind, message.mode, message.owner].join(":");
  }

  return [
    message.runId,
    message.kind,
    message.mode,
    `${message.owner}/${message.repo}`,
  ].join(":");
}

export function buildQueueSemanticKey(message: QueueMessageBody): string {
  if (message.kind === "scan-owner") {
    return `${message.kind}:${message.owner}`;
  }

  return `${message.kind}:${message.owner}/${message.repo}`;
}

export function isTerminalQueueJobStatus(status: QueueJobStatus): boolean {
  return (
    status === "cancelled" ||
    status === "deferred" ||
    status === "failed" ||
    status === "succeeded"
  );
}
