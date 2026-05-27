import type {
  MemoryDiaryEventOptimizationRequest,
  MemoryDiaryGenerateRequest,
  MemoryDiaryGenerateResult,
  MemoryDiaryTimelineBucket
} from '../../../shared/memoryDiary'
import { buildMemoryDiaryDailyInsight } from '../../../shared/memoryDiary'

type EventOptimizationPayload = {
  events?: Array<{
    id?: unknown
    title?: unknown
    summary?: unknown
    activityLabel?: unknown
    topics?: unknown
  }>
}

export class MemoryDiaryAdapter {
  buildEventOptimizationCompletion(input: MemoryDiaryEventOptimizationRequest) {
    const eventLines = input.buckets.slice(0, 80).map((bucket) => {
      const event = bucket.event
      const evidence = this.buildPromptEvidence(bucket)
      return [
        `- id: ${bucket.id}`,
        `  时间：${bucket.start} - ${bucket.end}`,
        `  本地标题：${event.title || bucket.title}`,
        `  本地摘要：${event.summary || bucket.summary}`,
        `  活动：${event.activityLabel}`,
        `  项目：${event.primaryProject}`,
        `  应用：${event.primaryApp}`,
        `  主题：${event.topics.slice(0, 6).join(', ') || '无'}`,
        `  证据：${evidence.slice(0, 3).join(' / ') || bucket.summary}`,
        `  具体线索：${evidence.slice(0, 6).join(' / ') || bucket.summary}`
      ].join('\n')
    }).join('\n')

    return {
      systemPrompt: [
        '你是中文工作时间线整理器。',
        '输入包含 ScreenPipe 本地规则压缩过的工作事件，以及经过脱敏的原始来源线索。',
        '请把标题和摘要改得更像人对一天工作的描述，并减少界面噪声。',
        '不要新增输入中没有的事实，不要保留 Token、API 地址、窗口按钮、菜单栏等无意义内容。',
        '摘要必须写出具体动作、对象或结论；不要写“了解...相关内容”“处理相关工作”这类空泛句。',
        '必须保留每个事件的 id，不要合并、删除或新增事件。',
        '只返回 JSON：{"events":[{"id":"","title":"","summary":"","activityLabel":"","topics":[]}]}'
      ].join('\n'),
      userPrompt: [
        `日期：${input.date}`,
        `时区：${input.timezone}`,
        '[本地理解事件]',
        eventLines || '无事件'
      ].join('\n')
    }
  }

  buildCompletion(input: MemoryDiaryGenerateRequest) {
    const dailyInsight = buildMemoryDiaryDailyInsight(input.buckets)
    const styleSystemPromptLines = this.buildDiaryStyleSystemPromptLines(input.config.diaryStyle)
    const styleUserPromptLines = this.buildDiaryStyleUserPromptLines(input.config.diaryStyle)
    const tone = input.config.diaryTone ?? 'daily'
    const toneSystemPromptLines = this.buildDiaryToneSystemPromptLines(tone)
    const toneUserPromptLines = this.buildDiaryToneUserPromptLines(tone)
    const understoodLines = input.buckets.map((bucket) => {
      const insight = bucket.insight
      const event = bucket.event
      return [
        `- ${bucket.start} - ${bucket.end}`,
        `  事件：${event?.title || bucket.title}`,
        `  摘要：${event?.summary || bucket.summary}`,
        `  活动：${event?.activityLabel || insight.activityLabel}（置信度 ${Math.round((event?.confidence ?? insight.confidence) * 100)}%）`,
        `  主项目：${event?.primaryProject || insight.projectHints[0] || '无'}`,
        `  主应用：${event?.primaryApp || insight.dominantAppName}`,
        `  主窗口：${insight.dominantWindowName}`,
        `  主题：${event?.topics.join(', ') || insight.projectHints.join(', ') || '无'}`,
        `  关键词：${insight.keywords.join(', ') || '无'}`,
        `  去重文本：${insight.uniqueTextCount} 条，重复率：${Math.round(insight.duplicateRatio * 100)}%`,
        `  证据：${(event?.evidenceTexts || insight.evidenceTexts).slice(0, 3).join(' / ') || bucket.summary}`
      ].join('\n')
    }).join('\n')
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
        '优先使用“理解后的活动”，只把“原始时间线摘要”当作证据校验。',
        '忽略菜单栏、按钮文字、重复 OCR、API 地址、Token 表单、窗口控制按钮等界面噪声。',
        '如果同一时间段只有配置页或调试页证据，应概括为“配置/调试工具”，不要逐字复述界面字段。',
        ...styleSystemPromptLines,
        ...toneSystemPromptLines,
        '只返回 JSON：{"title":"","summary":"","markdown":""}'
      ].join('\n'),
      userPrompt: [
        `日期：${input.date}`,
        `时区：${input.timezone}`,
        `日报风格：${input.config.diaryStyle}`,
        `表达口吻：${this.getDiaryToneLabel(tone)}`,
        `包含音频：${input.config.includeAudio ? '是' : '否'}`,
        `包含 input：${input.config.includeInput ? '是' : '否'}`,
        `用户补充：${input.userNotes || '无'}`,
        ...styleUserPromptLines,
        ...toneUserPromptLines,
        '[今日概览]',
        `活跃时间：${dailyInsight.activeMinutes} 分钟`,
        `记录数：${dailyInsight.recordCount}`,
        `去重文本：${dailyInsight.uniqueTextCount}`,
        `重复率：${Math.round(dailyInsight.duplicateRatio * 100)}%`,
        `主要应用：${dailyInsight.topApps.map((item) => `${item.label} ${Math.round(item.share * 100)}%`).join(', ') || '无'}`,
        `活动构成：${dailyInsight.activityMix.map((item) => `${item.label} ${Math.round(item.share * 100)}%`).join(', ') || '无'}`,
        `连续工作块：${dailyInsight.focusBlocks.map((block) => `${block.title} ${block.bucketCount}段`).join(' / ') || '无'}`,
        '[理解后的活动]',
        understoodLines || '当天没有可用活动理解结果',
        '[原始时间线摘要]',
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
      : this.buildFallbackDiaryTitle(input)
    const summary = typeof payload.summary === 'string' && payload.summary.trim()
      ? payload.summary.trim()
      : this.buildFallbackDiarySummary(input)
    const markdown = typeof payload.markdown === 'string' && payload.markdown.trim()
      ? payload.markdown.trim()
      : this.buildFallbackDiaryMarkdown(input, title, summary)

    return {
      id: `${input.date}-${Date.now()}`,
      date: input.date,
      title,
      summary,
      markdown,
      createdAt
    }
  }

  mapEventOptimizationResult(
    input: MemoryDiaryEventOptimizationRequest,
    payload: EventOptimizationPayload
  ): MemoryDiaryTimelineBucket[] {
    if (!Array.isArray(payload.events)) {
      return input.buckets
    }

    const eventsById = new Map(
      payload.events
        .map((event) => [this.cleanText(event?.id, 120), event] as const)
        .filter(([id]) => Boolean(id))
    )

    return input.buckets.map((bucket) => {
      const optimized = eventsById.get(bucket.id)
      if (!optimized) {
        return bucket
      }

      const title = this.cleanText(optimized.title, 48)
      const summary = this.cleanText(optimized.summary, 120)
      const activityLabel = this.cleanText(optimized.activityLabel, 12)
      const topics = this.cleanTextList(optimized.topics, 20).slice(0, 5)
      const modelTextIsGeneric = this.isGenericEventWording(title, summary)
      const nextEvent = {
        ...bucket.event,
        title: modelTextIsGeneric ? bucket.event.title : title || bucket.event.title,
        summary: modelTextIsGeneric ? bucket.event.summary : summary || bucket.event.summary,
        activityLabel: activityLabel || bucket.event.activityLabel,
        topics: topics.length > 0 ? topics : bucket.event.topics
      }

      return {
        ...bucket,
        title: nextEvent.title || bucket.title,
        summary: nextEvent.summary || bucket.summary,
        event: nextEvent
      }
    })
  }

  private cleanText(value: unknown, maxLength: number): string {
    if (typeof value !== 'string') {
      return ''
    }

    const normalized = value.replace(/\s+/g, ' ').trim()
    if (!normalized) {
      return ''
    }

    return normalized.length <= maxLength
      ? normalized
      : `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
  }

  private cleanTextList(value: unknown, maxLength: number): string[] {
    if (!Array.isArray(value)) {
      return []
    }

    return Array.from(new Set(
      value
        .map((item) => this.cleanText(item, maxLength))
        .filter(Boolean)
    ))
  }

  private buildPromptEvidence(bucket: MemoryDiaryTimelineBucket): string[] {
    return Array.from(new Set([
      ...(bucket.event?.evidenceTexts || []),
      ...bucket.keyTexts,
      ...bucket.windowNames.slice(0, 3),
      ...this.buildSourceEvidence(bucket)
    ].map((text) => this.compactPromptText(text, 180)).filter(Boolean)))
      .slice(0, 16)
  }

  private buildSourceEvidence(bucket: MemoryDiaryTimelineBucket): string[] {
    const seenTexts = new Set<string>()
    return [...bucket.items]
      .sort((left, right) => (
        this.getSourcePriority(left.contentType) - this.getSourcePriority(right.contentType) ||
        left.timestamp.localeCompare(right.timestamp)
      ))
      .map((item) => {
        const text = this.compactPromptText(item.text, 260)
        if (!text) {
          return ''
        }

        const textKey = text.toLowerCase()
        if (seenTexts.has(textKey)) {
          return ''
        }
        seenTexts.add(textKey)

        const context = [
          this.formatPromptTime(item.timestamp),
          item.contentType,
          this.compactPromptText(item.appName, 36),
          this.compactPromptText(item.windowName, 72)
        ].filter(Boolean).join(' | ')
        return context ? `${context}：${text}` : text
      })
      .filter(Boolean)
      .slice(0, 12)
  }

  private getSourcePriority(contentType: string): number {
    const priority: Record<string, number> = {
      accessibility: 0,
      audio: 1,
      input: 2,
      ocr: 3
    }
    return priority[contentType] ?? 4
  }

  private formatPromptTime(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return ''
    }

    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  private isGenericEventWording(title: string, summary: string): boolean {
    const text = `${title} ${summary}`
    return /了解.+相关内容/.test(text) ||
      /处理.+相关工作/.test(text) ||
      /(?:查阅|调试|处理|配置|浏览|开发|优化).{1,40}记忆日报/.test(title)
  }

  private compactPromptText(value: string, maxLength: number): string {
    return this.cleanText(this.redactSensitiveText(value), maxLength)
  }

  private redactSensitiveText(value: string): string {
    return value
      .replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, '$1[SECRET]')
      .replace(/\b(?:api[_-]?key|token|password|passwd|pwd|secret)\s*[:=]\s*["']?[^"',;\s]+/gi, (match) => {
        const key = match.split(/[:=]/)[0] || 'secret'
        return `${key}=[SECRET]`
      })
      .replace(/\b(?:sk|ghp|xoxb|xoxp|xoxa|github_pat)[-_][A-Za-z0-9_-]{8,}\b/gi, '[SECRET]')
      .replace(/https?:\/\/[^/\s:@]+:[^@\s]+@/gi, 'https://[CREDENTIALS]@')
  }

  private buildDiaryStyleSystemPromptLines(style: MemoryDiaryGenerateRequest['config']['diaryStyle']): string[] {
    if (style === 'brief') {
      return [
        '当前输出风格是一页工作简报。',
        'Markdown 必须包含这些二级标题：## 今日概况、## 关键进展、## 时间线、## 风险/待办。',
        '简报要短，优先写结论和进展；每条 bullet 都要包含具体对象、动作或结果。',
        '不写长篇博客，不写抒情开场，不逐条复述所有 OCR。'
      ]
    }

    if (style === 'blog') {
      return [
        '当前输出风格是博客草稿。',
        'Markdown 应包含标题、导言、过程、收获和下一步，语气可以更完整，但仍必须基于时间线事实。'
      ]
    }

    return [
      '当前输出风格是工作流日志。',
      'Markdown 应按时间顺序整理主要工作块，突出每段在做什么和推进到了哪里。'
    ]
  }

  private buildDiaryStyleUserPromptLines(style: MemoryDiaryGenerateRequest['config']['diaryStyle']): string[] {
    if (style !== 'brief') {
      return []
    }

    return [
      '[简报输出要求]',
      '写成可直接发给自己或团队看的短简报。',
      '今日概况 2-3 条，关键进展 3-5 条，时间线只列主要工作块，风险/待办只写能从时间线或用户补充中看出的内容。',
      '不写长篇博客，不写“看起来在做相关工作”这类空话。'
    ]
  }

  private buildDiaryToneSystemPromptLines(tone: MemoryDiaryGenerateRequest['config']['diaryTone']): string[] {
    if (tone === 'professional') {
      return [
        '当前表达口吻是专业分析风格。',
        '语气适合工作复盘和团队同步，简洁、稳重，强调进展、证据、风险、下一步。',
        '每个判断都尽量绑定时间线证据，不写泛泛的鼓励或流水账。'
      ]
    }

    return [
      '当前表达口吻是日常日记风格。',
      '像给自己复盘一天一样自然，少用术语和报告腔，但保留具体对象和进展。'
    ]
  }

  private buildDiaryToneUserPromptLines(tone: MemoryDiaryGenerateRequest['config']['diaryTone']): string[] {
    if (tone === 'professional') {
      return [
        '[口吻要求]',
        '表达口吻：专业分析风格。',
        '优先写清楚判断依据、进展、影响、阻塞和下一步，避免闲聊式表达。'
      ]
    }

    return [
      '[口吻要求]',
      '表达口吻：日常日记风格。',
      '表达自然一点，像每日复盘，减少过度正式的报告腔。'
    ]
  }

  private getDiaryToneLabel(tone: MemoryDiaryGenerateRequest['config']['diaryTone']): string {
    if (tone === 'professional') return '专业分析风格'
    return '日常日记风格'
  }

  private buildFallbackDiaryTitle(input: MemoryDiaryGenerateRequest): string {
    if (input.config.diaryStyle === 'brief') {
      return `${input.date} 工作简报`
    }
    if (input.config.diaryStyle === 'blog') {
      return `${input.date} 工作复盘草稿`
    }
    return `${input.date} 工作日报`
  }

  private buildFallbackDiarySummary(input: MemoryDiaryGenerateRequest): string {
    const dailyInsight = buildMemoryDiaryDailyInsight(input.buckets)
    if (input.config.diaryStyle === 'brief') {
      return `${input.buckets.length} 个时间段，${dailyInsight.activeMinutes} 分钟活跃记录，已整理为工作简报。`
    }
    return '已生成当天工作日报'
  }

  private buildFallbackDiaryMarkdown(
    input: MemoryDiaryGenerateRequest,
    title: string,
    summary: string
  ): string {
    if (input.config.diaryStyle !== 'brief') {
      return `# ${title}\n\n${summary}\n`
    }

    const dailyInsight = buildMemoryDiaryDailyInsight(input.buckets)
    const topApps = dailyInsight.topApps.map((item) => item.label).slice(0, 3).join('、') || '暂无'
    const activityMix = dailyInsight.activityMix
      .map((item) => `${item.label} ${Math.round(item.share * 100)}%`)
      .slice(0, 4)
      .join('、') || '暂无'
    const progressLines = input.buckets.slice(0, 5).map((bucket) => (
      `- ${bucket.event?.title || bucket.title}：${bucket.event?.summary || bucket.summary}`
    ))
    const timelineLines = input.buckets.slice(0, 8).map((bucket) => (
      `- ${this.formatBriefTime(bucket.start)}-${this.formatBriefTime(bucket.end)} ${bucket.event?.title || bucket.title}`
    ))

    return [
      `# ${title}`,
      '',
      summary,
      '',
      '## 今日概况',
      `- 活跃 ${dailyInsight.activeMinutes} 分钟，覆盖 ${dailyInsight.bucketCount} 个时间段、${dailyInsight.recordCount} 条记录。`,
      `- 主要应用：${topApps}。`,
      `- 活动构成：${activityMix}。`,
      '',
      '## 关键进展',
      ...(progressLines.length > 0 ? progressLines : ['- 暂无可用进展。']),
      '',
      '## 时间线',
      ...(timelineLines.length > 0 ? timelineLines : ['- 暂无可用时间线。']),
      '',
      '## 风险/待办',
      '- 未从时间线识别到明确风险或待办，建议人工补充确认。'
    ].join('\n')
  }

  private formatBriefTime(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return value
    }

    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }
}
