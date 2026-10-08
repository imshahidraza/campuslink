/**
 * Auth routes throw plain `new Error("...")` for messages we authored
 * ourselves and are safe to show a user (e.g. "No account found"). Anything
 * else — a Prisma error, a network error, a typo in our own code — is NOT
 * safe to forward verbatim, since it can leak internal details (table/column
 * names, connection strings in stack traces, etc). This picks those apart.
 */
export function safeErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  // `new Error(...)` has this exact constructor; subclasses (PrismaClientKnownRequestError,
  // ZodError, etc.) don't, so this reliably isolates "errors we deliberately threw."
  if (err instanceof Error && err.constructor === Error) {
    return err.message;
  }
  return fallback;
}
