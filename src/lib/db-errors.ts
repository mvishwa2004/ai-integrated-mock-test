export function getDatabaseErrorMessage(error: unknown, fallback: string) {
  const code = (error as { code?: string } | null)?.code

  if (code === "ER_ACCESS_DENIED_ERROR") {
    return "MySQL rejected the database login. Check MYSQL_USER, MYSQL_PASSWORD, and that this user has privileges on MYSQL_DATABASE."
  }
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT") {
    return "Cannot reach the MySQL server. Check MYSQL_HOST and MYSQL_PORT and make sure MySQL is running."
  }
  if (code === "ER_BAD_DB_ERROR") {
    return "The MySQL database in MYSQL_DATABASE does not exist. Check the database name."
  }

  return fallback
}
