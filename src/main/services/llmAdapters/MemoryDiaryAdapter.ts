import type {
  MemoryDiaryGenerateRequest,
  MemoryDiaryGenerateResult
} from '../../../shared/memoryDiary'

export class MemoryDiaryAdapter {
  buildCompletion(input: MemoryDiaryGenerateRequest) {
    const bucketLines = input.buckets.map((bucket) => [
      `- ${bucket.start} - ${bucket.end}`,
      `  应用：${bucket.appNames.join(', ') || '未知'}`,
      `  窗口：${bucket.windowNames.slice(0, 4).join(', ') || '未知'}`,
      `  摘要：${bucket.summary}`,
      `  关键文本：${bucket.keyTexts.slice(0, 4).join(' / ')}`
    ].join('\n')).join('\n')

    return {
      systemPrompt: [
        '你是中文工作日报助手。',
        '你会基于本地 ScreenPipe 时间线生成克制、准确、可编辑的 Markdown 日报。',
        '不要编造时间线中不存在的事实。',
        '不要输出隐私设置已排除的内容。',
        '只返回 JSON：{"title":"","summary":"","markdown":""}'
      ].join('\n'),
      userPrompt: [
        `日期：${input.date}`,
        `时区：${input.timezone}`,
        `日报风格：${input.config.diaryStyle}`,
        `包含音频：${input.config.includeAudio ? '是' : '否'}`,
        `包含 input：${input.config.includeInput ? '是' : '否'}`,
        `用户补充：${input.userNotes || '无'}`,
        '[时间线]',
        bucketLines || '当天没有可用时间线记录'
      ].join('\n')
    }
  }

  mapDiaryResult(
    input: MemoryDiaryGenerateRequest,
    payload: Partial<Pick<MemoryDiaryGenerateResult, 'title' | 'summary' | 'markdown'>>
  ): MemoryDiaryGenerateResult {
    const createdAt = new Date().toISOString()
    const title = typeof payload.title === 'string' && payload.title.trim()
      ? payload.title.trim()
      : `${input.date} 工作日报`
    const summary = typeof payload.summary === 'string' && payload.summary.trim()
      ? payload.summary.trim()
      : '已生成当天工作日报'
    const markdown = typeof payload.markdown === 'string' && payload.markdown.trim()
      ? payload.markdown.trim()
      : `# ${title}\n\n${summary}\n`

    return {
      id: `${input.date}-${Date.now()}`,
      date: input.date,
      title,
      summary,
      markdown,
      createdAt
    }
  }
}
