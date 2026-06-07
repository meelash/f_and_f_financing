type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, message: string, metadata?: Record<string, unknown>) {
  const payload = {
    level,
    message,
    metadata,
    timestamp: new Date().toISOString(),
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
    return;
  }

  if (level === "warn") {
    console.warn(JSON.stringify(payload));
    return;
  }

  console.log(JSON.stringify(payload));
}
