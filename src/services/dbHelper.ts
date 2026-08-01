/**
 * Database helper with retry logic and better error handling
 */

/**
 * Format error messages for user display
 */
export function formatDatabaseError(error: any): string {
  if (!error) return "Unknown database error";

  const message = error.message || String(error);

  // Network errors
  if (message.includes("Failed to fetch") || message.includes("Network")) {
    return "Network connection error. Please check your internet connection.";
  }

  // Timeout errors
  if (message.includes("timeout") || message.includes("timed out")) {
    return "Database connection timed out. Please try again.";
  }

  // Auth errors
  if (message.includes("Invalid login")) {
    return "Invalid email or password";
  }

  if (message.includes("already registered")) {
    return "This email is already registered. Please login instead.";
  }

  // Row not found
  if (message.includes("PGRST116") || message.includes("No rows")) {
    return "Record not found in database";
  }

  // Permission errors
  if (
    message.includes("permission") ||
    message.includes("denied") ||
    message.includes("403") ||
    message.includes("401")
  ) {
    return "Database permission error. Please contact support.";
  }

  // Default
  return message || "An error occurred. Please try again.";
}
