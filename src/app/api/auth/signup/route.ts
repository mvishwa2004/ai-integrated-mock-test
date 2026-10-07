import { randomBytes, scrypt as scryptCallback } from "node:crypto"
import { promisify } from "node:util"
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise"
import type { PoolConnection } from "mysql2/promise"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getDatabaseErrorMessage } from "@/lib/db-errors"
import { hashSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth"

const scrypt = promisify(scryptCallback)

export const runtime = "nodejs"

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { name, email, password } = (body ?? {}) as Record<string, unknown>
  if (
    typeof name !== "string" || !name.trim() || name.trim().length > 255 ||
    typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320 ||
    typeof password !== "string" || password.length < 8 || password.length > 256
  ) {
    return NextResponse.json(
      { error: "Enter a valid name and email, and a password of at least 8 characters." },
      { status: 400 }
    )
  }

  const salt = randomBytes(16).toString("hex")
  const passwordHash = (await scrypt(password, salt, 64)) as Buffer
  const sessionToken = randomBytes(32).toString("hex")
  let connection: PoolConnection | undefined
  let transactionStarted = false
  try {
    connection = await db.getConnection()
    await connection.beginTransaction()
    transactionStarted = true
    const [userResult] = await connection.execute<ResultSetHeader>(
      "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
      [name.trim(), email.trim().toLowerCase(), `scrypt$${salt}$${passwordHash.toString("hex")}`]
    )
    await connection.execute(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 DAY))`,
      [userResult.insertId, hashSessionToken(sessionToken)]
    )
    await connection.commit()
    transactionStarted = false

    const response = NextResponse.json({
      user: { id: String(userResult.insertId), name: name.trim(), email: email.trim().toLowerCase() },
    }, { status: 201 })
    response.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    })
    return response
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection?.rollback()
      } catch (rollbackError) {
        console.error("Failed to roll back account creation:", rollbackError)
      }
    }
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 })
    }
    console.error("Failed to create account:", error)
    return NextResponse.json(
      { error: getDatabaseErrorMessage(error, "Unable to create the account right now.") },
      { status: 500 }
    )
  } finally {
    connection?.release()
  }
}
