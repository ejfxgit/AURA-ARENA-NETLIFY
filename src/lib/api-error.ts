import { NextResponse } from "next/server";

export type ServiceErrorKind =
  | "database_unavailable"
  | "migration_required"
  | "persistence_failed"
  | "unknown";

export interface ServiceErrorBody {
  error: {
    kind: ServiceErrorKind;
    message: string;
    retryable: boolean;
  };
  requestId: string;
  occurredAt: string;
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now().toString(36)}`;
}

export function serviceErrorResponse(params: {
  error: unknown;
  scope: string;
  message: string;
  kind?: ServiceErrorKind;
  status?: number;
  retryable?: boolean;
}): NextResponse<ServiceErrorBody> {
  const id = requestId();
  const details = params.error instanceof Error
    ? { name: params.error.name, message: params.error.message, cause: params.error.cause }
    : params.error;
  console.error(`[api] ${params.scope} failed [${id}]`, details);
  return NextResponse.json(
    {
      error: {
        kind: params.kind ?? "unknown",
        message: params.message,
        retryable: params.retryable ?? true,
      },
      requestId: id,
      occurredAt: new Date().toISOString(),
    },
    { status: params.status ?? 503 },
  );
}
