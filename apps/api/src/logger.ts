/**
 * Minimal server logger. Callers pass only safe metadata: never passwords, tokens, cookies,
 * request bodies or full URLs with query strings.
 */
export interface Logger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

export const consoleLogger: Logger = {
  info: (message, meta) => {
    console.info(message, ...(meta ? [meta] : []));
  },
  error: (message, meta) => {
    console.error(message, ...(meta ? [meta] : []));
  },
};

/** Serializes an unknown thrown value for server logs (stack included, server side only). */
export function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { value: String(error) };
}
