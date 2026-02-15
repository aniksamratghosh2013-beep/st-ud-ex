/**
 * Maps database/API errors to safe, user-friendly messages.
 * Prevents leaking schema, table names, or internal details.
 */
export function sanitizeError(error: { message?: string; code?: string } | null): string {
  if (!error?.message) return "Something went wrong. Please try again.";

  const msg = error.message.toLowerCase();

  if (msg.includes("duplicate key") || msg.includes("unique constraint")) {
    return "This item already exists.";
  }
  if (msg.includes("row-level security") || msg.includes("rls")) {
    return "You don't have permission for this action.";
  }
  if (msg.includes("foreign key") || msg.includes("violates foreign key")) {
    return "Cannot complete this action due to linked data.";
  }
  if (msg.includes("not found") || msg.includes("no rows")) {
    return "The requested item was not found.";
  }
  if (msg.includes("permission denied") || msg.includes("insufficient")) {
    return "You don't have permission for this action.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Network error. Please check your connection.";
  }
  if (msg.includes("timeout")) {
    return "Request timed out. Please try again.";
  }

  return "Something went wrong. Please try again.";
}
