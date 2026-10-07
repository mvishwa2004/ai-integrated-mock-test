import { NextResponse } from "next/server"
import { getSessionToken, hashSessionToken, SESSION_COOKIE } from "@/lib/auth"
import { db } from "@/lib/db"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const token = getSessionToken(request.headers.get("cookie"))
  const response = NextResponse.json({ success: true })
  try {
    if (token) {
      await db.execute("DELETE FROM user_sessions WHERE token_hash = ?", [hashSessionToken(token)])
    }
  } catch (error) {
    console.error("Failed to revoke login session:", error)
    response.headers.set("X-Logout-Warning", "Session will expire automatically")
  }
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  return response
}
