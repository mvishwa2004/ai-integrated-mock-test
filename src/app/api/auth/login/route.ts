import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"
import type { RowDataPacket } from "mysql2/promise"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getDatabaseErrorMessage } from "@/lib/db-errors"
import { hashSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth"

const scrypt = promisify(scryptCallback)

export const runtime = "nodejs"

interface UserRow extends RowDataPacket {
  id: string | number
  name: string
  email: string
  password_hash: string
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { email, password } = (body ?? {}) as Record<string, unknown>
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 })
  }

  try {
    const [users] = await db.execute<UserRow[]>(
      "SELECT id, name, email, password_hash FROM users WHERE email = ? LIMIT 1",
      [email.trim().toLowerCase()]
    )
    const user = users[0]
    const [algorithm, salt, storedHash] = user?.password_hash.split("$") ?? []
    if (!user || algorithm !== "scrypt" || !salt || !storedHash) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 })
    }

    const expected = Buffer.from(storedHash, "hex")
    const actual = (await scrypt(password, salt, expected.length)) as Buffer
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 })
    }

    const sessionToken = randomBytes(32).toString("hex")
    await db.execute(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 DAY))`,
      [user.id, hashSessionToken(sessionToken)]
    )

    const response = NextResponse.json({
      user: { id: String(user.id), name: user.name, email: user.email },
    })
    response.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    })
    return response
  } catch (error) {
    console.error("Failed to sign in:", error)
    return NextResponse.json(
      { error: getDatabaseErrorMessage(error, "Unable to sign in right now.") },
      { status: 500 }
    )
  }
}
