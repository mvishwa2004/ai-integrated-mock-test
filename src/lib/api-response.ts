export async function parseApiResponse<T>(
  response: Response,
  fallbackMessage: string
): Promise<T> {
  const body = await response.text()
  let payload: (T & { error?: string }) | undefined

  if (body) {
    try {
      payload = JSON.parse(body) as T & { error?: string }
    } catch {
      const isHtml = response.headers.get("content-type")?.includes("text/html") ||
        body.trimStart().startsWith("<!DOCTYPE html")
      if (isHtml && response.status >= 500) {
        throw new Error(
          `${fallbackMessage} (HTTP ${response.status}; the development server returned an error page. Restart it and check its terminal output.)`
        )
      }
      throw new Error(`${fallbackMessage} (server returned HTTP ${response.status})`)
    }
  }

  if (!response.ok) {
    throw new Error(payload?.error || `${fallbackMessage} (HTTP ${response.status})`)
  }
  if (!payload) {
    throw new Error(`${fallbackMessage} (server returned an empty response)`)
  }

  return payload
}
