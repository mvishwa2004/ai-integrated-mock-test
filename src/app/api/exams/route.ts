import type { PoolConnection, RowDataPacket } from "mysql2/promise"
import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { getDatabaseErrorMessage } from "@/lib/db-errors"

export const runtime = "nodejs"

interface ExamQuestion {
  questionId?: string
  questionText?: string
  topic?: string
  correctAnswer?: string
  options?: string[]
  [key: string]: unknown
}

interface ExamPayload {
  id: string
  type?: string
  category?: string
  timestamp?: number
  difficulty?: string
  duration?: number
  questions: ExamQuestion[]
  answers: Record<string, string>
  result: {
    overallScore: number
    correctAnswers: number
    totalQuestions: number
    [key: string]: unknown
  }
}

interface ExamRow extends RowDataPacket {
  source_exam_id: string
  category: string
  completed_at: Date | string
  score: number | string
  correct_count: number
  total_questions: number
  duration_seconds: number
  questions_json: ExamQuestion[] | string
  answers_json: Record<string, string> | string
  result_json: ExamPayload["result"] | string
}

function parseJson<T>(value: T | string): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T
}

function cleanAnswer(answer: string) {
  return answer
    .replace(/^option\s+/i, "")
    .replace(/^([A-D])[).:\s-]*/i, "$1")
    .trim()
    .toUpperCase()
    .charAt(0)
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: "Please sign in to view exam history." }, { status: 401 })

    const [rows] = await db.execute<ExamRow[]>(
      `SELECT source_exam_id, category, completed_at, score, correct_count,
              total_questions, duration_seconds, questions_json, answers_json, result_json
       FROM exams
       WHERE user_id = ?
       ORDER BY completed_at DESC`,
      [user.id]
    )
    const [weakTopics] = await db.execute<RowDataPacket[]>(
      `SELECT ts.topic,
              ROUND(SUM(ts.correct_count) * 100.0 /
                    NULLIF(SUM(ts.total_questions), 0), 2) AS accuracy_percent
       FROM exam_topic_scores AS ts
       JOIN exams AS e ON e.id = ts.exam_id
       WHERE e.user_id = ?
       GROUP BY ts.topic
       HAVING SUM(ts.total_questions) > 0
       ORDER BY accuracy_percent ASC
       LIMIT 3`,
      [user.id]
    )

    const exams = rows.map((row) => ({
      id: row.source_exam_id,
      type: row.category,
      category: row.category,
      difficulty: "medium",
      timestamp: new Date(row.completed_at).getTime(),
      questions: parseJson(row.questions_json),
      answers: parseJson(row.answers_json),
      result: parseJson(row.result_json),
      duration: Math.round(row.duration_seconds / 60),
      totalQuestions: row.total_questions,
    }))
    return NextResponse.json({
      exams,
      weakestTopics: weakTopics.map((row) => ({
        topic: String(row.topic),
        accuracyPercent: Number(row.accuracy_percent),
      })),
    })
  } catch (error) {
    console.error("Failed to load exam history:", error)
    return NextResponse.json(
      { error: getDatabaseErrorMessage(error, "Unable to load exam history.") },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  let body: { exam?: ExamPayload }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  const exam = body?.exam
  if (
    !exam || typeof exam.id !== "string" || !exam.id || exam.id.length > 100 ||
    !Array.isArray(exam.questions) || !exam.questions.length || exam.questions.length > 200 ||
    !exam.questions.every((question) =>
      question && typeof question.questionId === "string" &&
      typeof question.topic === "string" &&
      typeof question.correctAnswer === "string"
    ) ||
    !exam.answers || typeof exam.answers !== "object" || Array.isArray(exam.answers) ||
    !Object.values(exam.answers).every((answer) => typeof answer === "string") ||
    (exam.category !== undefined && typeof exam.category !== "string") ||
    (exam.type !== undefined && typeof exam.type !== "string") ||
    (exam.duration !== undefined && (!Number.isFinite(exam.duration) || exam.duration < 0)) ||
    !exam.result || !Number.isFinite(exam.result.overallScore) ||
    !Number.isFinite(exam.result.correctAnswers) || !Number.isFinite(exam.result.totalQuestions) ||
    exam.result.totalQuestions !== exam.questions.length ||
    exam.result.correctAnswers < 0 || exam.result.correctAnswers > exam.result.totalQuestions
  ) {
    return NextResponse.json({ error: "Exam result data is incomplete." }, { status: 400 })
  }

  const score = Math.max(0, Math.min(100, Number(exam.result.overallScore)))
  const questionStats = new Map<string, { correct: number; total: number }>()
  for (const question of exam.questions) {
    if (typeof question.topic !== "string" || !question.topic.trim()) continue
    const topic = question.topic.trim()
    const stats = questionStats.get(topic) ?? { correct: 0, total: 0 }
    stats.total += 1
    const answer = typeof question.questionId === "string" ? exam.answers[question.questionId] : undefined
    if (
      typeof answer === "string" &&
      cleanAnswer(answer) !== "" &&
      cleanAnswer(answer) === cleanAnswer(String(question.correctAnswer ?? ""))
    ) {
      stats.correct += 1
    }
    questionStats.set(topic, stats)
  }

  let connection: PoolConnection | undefined
  let transactionStarted = false
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: "Please sign in to save exam results." }, { status: 401 })

    connection = await db.getConnection()
    await connection.beginTransaction()
    transactionStarted = true
    await connection.execute(
      `INSERT INTO exams (
         user_id, source_exam_id, category, completed_at, score,
         correct_count, total_questions, duration_seconds,
         questions_json, answers_json, result_json
       ) VALUES (?, ?, ?, UTC_TIMESTAMP(3), ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         category = VALUES(category),
         completed_at = VALUES(completed_at),
         score = VALUES(score),
         correct_count = VALUES(correct_count),
         total_questions = VALUES(total_questions),
         duration_seconds = VALUES(duration_seconds),
         questions_json = VALUES(questions_json),
         answers_json = VALUES(answers_json),
         result_json = VALUES(result_json)`,
      [
        user.id,
        exam.id,
        (exam.category || exam.type || "General").slice(0, 255),
        score,
        Math.max(0, Math.floor(Number(exam.result.correctAnswers))),
        Math.max(0, Math.floor(Number(exam.result.totalQuestions))),
        Math.floor((exam.duration ?? 0) * 60),
        JSON.stringify(exam.questions),
        JSON.stringify(exam.answers),
        JSON.stringify(exam.result),
      ]
    )

    const [existingRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM exams WHERE user_id = ? AND source_exam_id = ? LIMIT 1",
      [user.id, exam.id]
    )
    if (!existingRows[0]) throw new Error("Saved exam could not be found after insert.")
    const examRowId = existingRows[0].id

    await connection.execute("DELETE FROM exam_topic_scores WHERE exam_id = ?", [examRowId])
    for (const [topic, stats] of questionStats) {
      await connection.execute(
        `INSERT INTO exam_topic_scores (exam_id, topic, correct_count, total_questions)
         VALUES (?, ?, ?, ?)`,
        [examRowId, topic.slice(0, 255), stats.correct, stats.total]
      )
    }

    await connection.commit()
    transactionStarted = false
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection?.rollback()
      } catch (rollbackError) {
        console.error("Failed to roll back exam save:", rollbackError)
      }
    }
    console.error("Failed to save exam result:", error)
    return NextResponse.json(
      { error: getDatabaseErrorMessage(error, "Unable to save exam result.") },
      { status: 500 }
    )
  } finally {
    connection?.release()
  }
}
