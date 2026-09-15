const SENSITIVE_VALUE = /(^|[?&\s])((?:token|access_token|refresh_token|password|secret|key)=)[^&\s]+/gi;

export function createRequestId() {
  return crypto.randomUUID();
}

export function redactMessage(message: string) {
  return message.replace(SENSITIVE_VALUE, "$1$2[REDACTED]").slice(0, 500);
}

export function logRequestError(input: { requestId: string; path?: string; code?: string; message?: string }) {
  console.error(JSON.stringify({
    event: "api_error",
    requestId: input.requestId,
    path: input.path ?? "unknown",
    code: input.code ?? "INTERNAL_SERVER_ERROR",
    message: redactMessage(input.message ?? "Unhandled API error"),
    timestamp: new Date().toISOString(),
  }));
}

export function logRequestSignal(input: { event: "auth_failure" | "slow_query" | "storage_error" | "automation_failure"; requestId: string; path?: string; durationMs?: number; code?: string; message?: string }) {
  console.warn(JSON.stringify({
    event: input.event,
    requestId: input.requestId,
    path: input.path ?? "unknown",
    ...(input.durationMs === undefined ? {} : { durationMs: Math.round(input.durationMs) }),
    ...(input.code ? { code: input.code } : {}),
    ...(input.message ? { message: redactMessage(input.message) } : {}),
    timestamp: new Date().toISOString(),
  }));
}
