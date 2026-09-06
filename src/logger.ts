type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, string | number | boolean | null | undefined>;

const MAX_LOG_VALUE_LENGTH = 2_000;
const SENSITIVE_CONTEXT_KEY = /token|secret|password|private|credential|authorization/i;
const SENSITIVE_TEXT = /(bearer\s+|(?:password|secret|token|private[_ -]?key|authorization)\s*[:=]\s*)[^\s,;]+/gi;

function sanitizeString(value: string): string {
  return value.replace(SENSITIVE_TEXT, "$1<redacted>").slice(0, MAX_LOG_VALUE_LENGTH);
}

function sanitizeContext(context: LogContext): LogContext {
  return Object.fromEntries(Object.entries(context).map(([key, value]) => [
    key,
    typeof value === "string"
      ? (SENSITIVE_CONTEXT_KEY.test(key) ? "<redacted>" : sanitizeString(value))
      : value,
  ]));
}

function write(level: LogLevel, message: string, context: LogContext = {}): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message: sanitizeString(message),
    ...Object.fromEntries(Object.entries(sanitizeContext(context)).filter(([, value]) => value !== undefined)),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = Object.freeze({
  debug(message: string, context?: LogContext): void { write("debug", message, context); },
  info(message: string, context?: LogContext): void { write("info", message, context); },
  warn(message: string, context?: LogContext): void { write("warn", message, context); },
  error(message: string, context?: LogContext): void { write("error", message, context); },
});

export function errorContext(error: unknown): LogContext {
  return {
    error: error instanceof Error ? error.message : String(error),
  };
}
