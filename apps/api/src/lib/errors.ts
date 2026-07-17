export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "PAYLOAD_TOO_LARGE"
  | "UPSTREAM_ERROR"
  | "UPSTREAM_PROTOCOL_ERROR"
  | "UPSTREAM_TIMEOUT"
  | "INTERNAL_ERROR"

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number

  constructor(code: ErrorCode, message: string, status?: number) {
    super(message)
    this.name = "AppError"
    this.code = code
    this.status =
      status ??
      ({
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        PAYLOAD_TOO_LARGE: 413,
        UPSTREAM_ERROR: 502,
        UPSTREAM_PROTOCOL_ERROR: 502,
        UPSTREAM_TIMEOUT: 504,
        INTERNAL_ERROR: 500,
      }[code] as number)
  }
}

export function toErrorBody(err: unknown): {
  ok: false
  error: { code: ErrorCode; message: string }
  status: number
} {
  if (err instanceof AppError) {
    return {
      ok: false,
      error: { code: err.code, message: err.message },
      status: err.status,
    }
  }
  return {
    ok: false,
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    status: 500,
  }
}
