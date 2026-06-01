/**
 * Normalize unknown errors into a human-readable string.
 * Use this in catch blocks to build `message.error(\`...: ${formatError(err)}\`)`.
 */
export function formatError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message) return err.message;
    return err.name || "未知错误";
  }
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "未知错误";
}
