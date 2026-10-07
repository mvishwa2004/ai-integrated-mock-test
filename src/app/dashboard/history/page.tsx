"use client"

import { useEffect, useState } from "react"
import { ExamRecord } from "@/lib/store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { format } from "date-fns"
import Link from "next/link"
import { Eye, Download } from "lucide-react"
import { parseApiResponse } from "@/lib/api-response"

export default function HistoryPage() {
  const [exams, setExams] = useState<ExamRecord[]>([])
  const [weakestTopics, setWeakestTopics] = useState<Array<{ topic: string; accuracyPercent: number }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    fetch("/api/exams")
      .then(async (response) => {
        const payload = await parseApiResponse<{
          exams: ExamRecord[]
          weakestTopics: Array<{ topic: string; accuracyPercent: number }>
        }>(response, "Unable to load exam history.")
        if (!cancelled) {
          setExams(payload.exams)
          setWeakestTopics(payload.weakestTopics)
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load exam history.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const getScoreBadge = (score: number) => {
    if (score >= 80) return <Badge className="bg-green-600">Excellent</Badge>
    if (score >= 60) return <Badge className="bg-blue-600">Good</Badge>
    if (score >= 40) return <Badge className="bg-yellow-600">Average</Badge>
    return <Badge className="bg-red-600">Needs Improvement</Badge>
  }

  const downloadResult = (exam: ExamRecord) => {
    const totalQuestions = exam.result?.totalQuestions || exam.totalQuestions || exam.questions.length || 0
    const attemptedQuestions = exam.result?.attemptedQuestions ?? 0
    const weakestTopics = exam.result?.weakestTopics?.join(', ') || 'N/A'
    const content = `
Exam Report
===========
Date: ${format(new Date(exam.timestamp), "PPP p")}
Score: ${exam.result?.overallScore || 0}%
Accuracy: ${exam.result?.accuracy?.toFixed(1) || 0}%
Correct Answers: ${exam.result?.correctAnswers || 0}/${totalQuestions}
Time Spent: ${exam.duration || 0} minutes

Questions Attempted: ${attemptedQuestions}
Correct: ${exam.result?.correctAnswers || 0}
Incorrect: ${exam.result?.incorrectAnswers || 0}
Unattempted: ${totalQuestions - attemptedQuestions}
Weakest Areas: ${weakestTopics}
    `.trim()

    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `exam-result-${format(new Date(exam.timestamp), "yyyy-MM-dd-HHmmss")}.txt`
    a.click()
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Exam History</h1>
        <p className="text-muted-foreground">Review all your past mock exam attempts</p>
      </div>

      {weakestTopics.length > 0 && (
        <Card className="glass-morphism border-white/5">
          <CardHeader>
            <CardTitle>Topics to Improve</CardTitle>
            <CardDescription>Your lowest accuracy across completed exams</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {weakestTopics.map(({ topic, accuracyPercent }) => (
              <Badge key={topic} variant="outline">
                {topic}: {accuracyPercent}%
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="glass-morphism border-white/5">
        <CardHeader>
          <CardTitle>Recent Exams</CardTitle>
          <CardDescription>Details of all your mock exam attempts</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Loading exam history...</p>
          ) : error ? (
            <p role="alert" className="text-center py-8 text-destructive">{error}</p>
          ) : exams.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No exams attempted yet</p>
              <Button asChild>
                <Link href="/exam/new">Start Your First Mock Exam</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Accuracy</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exams.map((exam) => (
                    <TableRow key={exam.id} className="hover:bg-white/5">
                      <TableCell className="font-medium">
                        {format(new Date(exam.timestamp), "PPP")}
                      </TableCell>
                      <TableCell>{exam.category || "General"}</TableCell>
                      <TableCell className="font-bold">
                        {exam.result?.overallScore || 0}%
                      </TableCell>
                      <TableCell>
                        {getScoreBadge(exam.result?.overallScore || 0)}
                      </TableCell>
                      <TableCell>{exam.duration || 0} mins</TableCell>
                      <TableCell>
                        {exam.result?.accuracy || 0}%
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            title="View Details"
                          >
                            <Link href={`/exam/${exam.id}/results`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => downloadResult(exam)}
                            title="Download Result"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
