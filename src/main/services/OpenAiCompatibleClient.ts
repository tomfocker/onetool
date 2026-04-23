type FetchLike = typeof fetch

type OpenAiCompatibleClientDependencies = {
  fetch?: FetchLike
}

export type JsonCompletionInput = {
  apiUrl: string
  apiKey: string
  model: string
  systemPrompt: string
  userPrompt: string
}

export class OpenAiCompatibleClient {
  private readonly fetchImpl: FetchLike

  constructor(dependencies: OpenAiCompatibleClientDependencies = {}) {
    this.fetchImpl = dependencies.fetch ?? fetch
  }

  async createJsonCompletion<T>({
    apiUrl,
    apiKey,
    model,
    systemPrompt,
    userPrompt
  }: JsonCompletionInput): Promise<T> {
    const response = await this.fetchImpl(`${apiUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    })

    if (!response.ok) {
      let errorMessage = `LLM 请求失败 (${response.status})`
      try {
        const errorPayload = await response.json() as { error?: { message?: string } }
        errorMessage = errorPayload?.error?.message || errorMessage
      } catch {
        // ignore
      }
      throw new Error(errorMessage)
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = payload?.choices?.[0]?.message?.content
    if (!content) {
      throw new Error('LLM 返回内容为空')
    }

    try {
      return JSON.parse(content) as T
    } catch {
      throw new Error(`LLM 返回的 JSON 解析失败: ${content.slice(0, 80)}`)
    }
  }
}
