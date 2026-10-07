"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { useAppStore, ExamRecord } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Loader2, Timer, ChevronRight, ChevronLeft, Send, Sparkles } from "lucide-react"
import { parseApiResponse } from "@/lib/api-response"
import type { EvaluateAnswersAndProvideFeedbackOutput } from "@/ai/flows/evaluate-answers-and-provide-feedback-flow"

function stripOptionPrefix(option: string) {
  return option.replace(/^[A-D][).:\s-]+/i, "").trim()
}

function isValidQuestion(question: ExamRecord["questions"][number] | undefined) {
  return Boolean(
    question &&
    question.questionId &&
    question.questionText &&
    Array.isArray(question.options) &&
    question.options.length > 0
  )
}

export default function ExamSessionPage() {
  const params = useParams()
  const router = useRouter()
  const { getExams, saveExam } = useAppStore()
  const examId = Array.isArray(params.id) ? params.id[0] : params.id
  
  const [exam, setExam] = useState<ExamRecord | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState(3600)

  useEffect(() => {
    const allExams = getExams()
    const currentExam = allExams.find(e => e.id === examId)
    if (!currentExam) {
      router.push("/dashboard")
      return
    }
    const sanitizedQuestions = currentExam.questions.filter(isValidQuestion)
    if (sanitizedQuestions.length === 0) {
      router.push("/dashboard")
      return
    }

    setExam({
      ...currentExam,
      questions: sanitizedQuestions,
    })
    setCurrentIndex((prev) => Math.min(prev, sanitizedQuestions.length - 1))
    setTimeLeft(60 * 60)
  }, [examId, router])

  useEffect(() => {
    if (!exam || submitting) return
    if (timeLeft <= 0) {
      handleSubmit()
      return
    }
    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [exam, submitting, timeLeft])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleSelectAnswer = (ans: string) => {
    if (!exam) return
    const safeIndex = Math.min(currentIndex, Math.max(exam.questions.length - 1, 0))
    const currentQuestion = exam.questions[safeIndex]
    if (!currentQuestion) return
    const questionId = currentQuestion.questionId
    setAnswers(prev => ({ ...prev, [questionId]: ans }))
  }

  async function postEvaluation(body: any) {
    const response = await fetch('/api/exam/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const payload = await parseApiResponse<{ success: boolean; data: EvaluateAnswersAndProvideFeedbackOutput }>(
      response,
      "Evaluation request failed"
    )
    if (!payload.success) throw new Error("Evaluation request failed.")
    return payload.data
  }

  const handleSubmit = async () => {
    if (!exam || submitting) return
    setSubmitting(true)

    try {
      const evaluationInput = exam.questions.map(q => ({
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        studentAnswer: answers[q.questionId] || "No answer provided",
        topic: q.topic,
        marks: (q as any).marks ?? 1
      }))

      const evaluation = await postEvaluation({ examAttempt: evaluationInput })
      const totalQuestions = exam.questions.length
      const correctAnswers = exam.questions.filter((question) => {
        const answer = answers[question.questionId]
        return typeof answer === "string" &&
          answer.trim().toUpperCase().replace(/^OPTION\s+/, "").charAt(0) ===
          question.correctAnswer.trim().toUpperCase().replace(/^OPTION\s+/, "").charAt(0)
      }).length
      const attemptedQuestions = exam.questions.filter((question) => Boolean(answers[question.questionId])).length
      const result: EvaluateAnswersAndProvideFeedbackOutput = {
        ...evaluation,
        totalQuestions,
        correctAnswers,
        incorrectAnswers: totalQuestions - correctAnswers,
        attemptedQuestions,
        accuracy: totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0,
      }

      const updatedExam = {
        ...exam,
        answers,
        result,
        duration: Math.max(0, Math.floor((60 * 60 - timeLeft) / 60)),
      }

      const response = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exam: updatedExam }),
      })
      await parseApiResponse<{ success: true }>(response, "Failed to save exam results.")

      saveExam(updatedExam)
      router.push(`/exam/${exam.id}/results`)
    } catch (error) {
      console.error(error)
      alert(error instanceof Error
        ? `Your exam could not be saved: ${error.message}`
        : "Your exam could not be saved. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!exam) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>

  const safeCurrentIndex = Math.min(currentIndex, Math.max(exam.questions.length - 1, 0))
  const q = exam.questions[safeCurrentIndex]

  if (!q) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>
  }

  const progress = ((safeCurrentIndex + 1) / exam.questions.length) * 100

  return (
    <div className="min-h-screen bg-[#0D0514] p-4 md:p-8 flex flex-col items-center">
      <div className="w-full max-w-4xl flex flex-col gap-6">
        <header className="flex justify-between items-center glass-morphism p-4 rounded-xl border-white/10">
          <div>
            <h1 className="text-xl font-bold">{exam.type} Mock Exam</h1>
            <p className="text-xs text-muted-foreground">Progress: Question {safeCurrentIndex + 1} of {exam.questions.length}</p>
          </div>
          <div className="flex items-center gap-2 text-accent font-mono text-xl">
            <Timer className="w-5 h-5" />
            {formatTime(timeLeft)}
          </div>
        </header>

        <Progress value={progress} className="h-2" />

        <Card className="glass-morphism border-white/10">
          <CardHeader>
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-semibold px-2 py-1 bg-primary/20 text-primary rounded uppercase tracking-wider">
                {q.topic}
              </span>
              <span className="text-xs text-muted-foreground uppercase">Difficulty: {q.difficulty}</span>
            </div>
            <CardTitle className="text-xl font-medium leading-relaxed">
              {q.questionText}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup value={answers[q.questionId]} onValueChange={handleSelectAnswer} className="space-y-3">
              {q.options.map((option, i) => {
                const label = String.fromCharCode(65 + i)
                const displayOption = stripOptionPrefix(option)
                return (
                  <div key={i} className="flex items-center space-x-2">
                    <RadioGroupItem value={label} id={`opt-${i}`} className="sr-only peer" />
                    <Label
                      htmlFor={`opt-${i}`}
                      className="flex-1 p-4 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 peer-data-[state=checked]:border-accent peer-data-[state=checked]:bg-accent/10 transition-all cursor-pointer flex items-center gap-3"
                    >
                      <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-sm">
                        {label}
                      </span>
                      {displayOption}
                    </Label>
                  </div>
                )
              })}
            </RadioGroup>
          </CardContent>
        </Card>

        <div className="flex justify-between items-center mt-4">
          <Button 
            variant="ghost" 
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            disabled={safeCurrentIndex === 0 || submitting}
            className="text-muted-foreground hover:text-white"
          >
            <ChevronLeft className="mr-2 w-4 h-4" /> Previous
          </Button>

          {safeCurrentIndex === exam.questions.length - 1 ? (
            <Button 
              className="bg-accent hover:bg-accent/80 px-8 relative overflow-hidden" 
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="animate-spin w-4 h-4" />
                  <span>AI Analyzing Performance...</span>
                </div>
              ) : (
                <>
                  <Send className="mr-2 w-4 h-4" />
                  Finish Exam
                </>
              )}
            </Button>
          ) : (
            <Button 
              className="bg-primary hover:bg-primary/90 px-8" 
              onClick={() => setCurrentIndex(prev => Math.min(prev + 1, exam.questions.length - 1))}
              disabled={submitting}
            >
              Next <ChevronRight className="ml-2 w-4 h-4" />
            </Button>
          )}
        </div>
        
        {submitting && (
          <p className="text-center text-xs text-muted-foreground animate-pulse mt-4 flex items-center justify-center gap-2">
            <Sparkles className="w-3 h-3 text-accent" />
            Generating deep qualitative feedback. This takes 10-15 seconds.
          </p>
        )}
      </div>
    </div>
  )
}
