import { createHash } from "node:crypto"
import type { RowDataPacket } from "mysql2/promise"
import { db } from "@/lib/db"

export const SESSION_COOKIE = "mocktest_session"
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export interface AuthenticatedUser {
  id: string
  name: string
  email: string
}

export function getSessionToken(cookieHeader: string | null) {
  const cookie = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))

  return cookie ? cookie.slice(SESSION_COOKIE.length + 1) : null
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export async function getAuthenticatedUser(request: Request): Promise<AuthenticatedUser | null> {
  const token = getSessionToken(request.headers.get("cookie"))
  if (!token) return null

  interface UserRow extends RowDataPacket {
    id: string | number
    name: string
    email: string
  }

  const [rows] = await db.execute<UserRow[]>(
    `SELECT u.id, u.name, u.email
     FROM user_sessions AS s
     JOIN users AS u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3)
     LIMIT 1`,
    [hashSessionToken(token)]
  )

  const user = rows[0]
  return user ? { id: String(user.id), name: user.name, email: user.email } : null
}
