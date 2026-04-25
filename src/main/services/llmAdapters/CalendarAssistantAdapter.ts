import type {
  LlmCalendarAssistantRequest,
  LlmCalendarAssistantResult,
  LlmCalendarName
} from '../../../shared/llm'
import type { StructuredCompletionPrompts } from './shared'

type CalendarAssistantPayload = {
  action?: unknown
  message?: unknown
  search?: unknown
  event?: Partial<{
    title: unknown
    date: unknown
    start: unknown
    end: unknown
    calendar: unknown
    location: unknown
    participants: unknown
    description: unknown
  }>
}

const CALENDAR_COLORS: Record<LlmCalendarName, string> = {
  个人: '#2f6df6',
  工作: '#38b887',
  家庭: '#7457d8',
  重要: '#ca8528'
}

export class CalendarAssistantAdapter {
  buildCompletion(input: LlmCalendarAssistantRequest): StructuredCompletionPrompts {
    const eventLines = input.context.events
      .slice(0, 24)
      .map((event, index) => {
        const details = [
          `${event.date} ${event.start}-${event.end}`,
          event.calendar,
          event.location ? `地点:${event.location}` : '',
          event.participants ? `参与者:${event.participants}` : ''
        ].filter(Boolean).join(' / ')
        return `${index + 1}. ${event.title} (${details})`
      })
      .join('\n')

    return {
      systemPrompt: [
        '你是 OneTool 的自然语言日历意图解析器。',
        '任务是把用户的一句话解析成日历操作，不要闲聊，不要编造不存在的信息。',
        '只返回 JSON，不要 Markdown，不要解释。',
        'JSON 格式：{"action":"create|filter|help","message":"","search":"","event":{"title":"","date":"YYYY-MM-DD","start":"HH:mm","end":"HH:mm","calendar":"个人|工作|家庭|重要","location":"","participants":"","description":""}}。',
        '如果用户想新建、安排、提醒、约某人、开会，action=create。',
        'create 必须给出 title、date、start、end；只说“上午/一上午”表示 09:00-12:00，“下午/一下午”表示 14:00-18:00，“晚上/一晚上”表示 19:00-21:00，“中午”表示 12:00-13:00；只有明确单点时间且没有结束时间时默认 60 分钟；没有日期时使用当前选中日期；相对日期以当前日期为基准。',
        'calendar 根据语义选择：会议/客户/方案/评审默认工作，家人/家庭/聚餐默认家庭，健身/午餐/约会默认个人，明确重要则重要。',
        '如果用户想查看、搜索、筛选日程，action=filter 并返回 search。',
        '如果标题或时间不足以创建日程，action=help，并用 message 说明还缺什么。'
      ].join('\n'),
      userPrompt: [
        `当前日期：${input.context.today}`,
        `当前选中日期：${input.context.selectedDate}`,
        eventLines ? `[现有日程]\n${eventLines}` : '[现有日程]\n无',
        `[用户输入]\n${input.message}`
      ].join('\n\n')
    }
  }

  mapAssistantResult(
    input: LlmCalendarAssistantRequest,
    payload: CalendarAssistantPayload
  ): LlmCalendarAssistantResult {
    const action = sanitizeText(payload.action)

    if (action === 'filter') {
      const search = sanitizeText(payload.search)
      return search
        ? { type: 'filter', search, message: sanitizeText(payload.message, `已帮你筛选「${search}」。`) }
        : helpResult('我还需要知道你想筛选什么关键词。')
    }

    if (action !== 'create') {
      return helpResult(sanitizeText(payload.message, '你可以直接说：明天下午3点安排设计评审，地点会议室A。'))
    }

    const event = payload.event ?? {}
    const title = sanitizeText(event.title)
    const date = sanitizeText(event.date)
    const broadTimeRange = inferBroadTimeRange(input.message)
    const start = broadTimeRange?.start ?? sanitizeText(event.start)
    const end = broadTimeRange?.end ?? sanitizeText(event.end)

    if (!title || !isDate(date) || !isTime(start) || !isTime(end) || minutesFromTime(end) <= minutesFromTime(start)) {
      return helpResult('我还需要有效的标题、日期、开始和结束时间，才能创建日程。')
    }

    const calendar = normalizeCalendarName(event.calendar)
    const normalizedMessage = `已创建「${title}」：${date} ${start} - ${end}。`
    return {
      type: 'create',
      message: broadTimeRange ? normalizedMessage : sanitizeText(payload.message, normalizedMessage),
      event: {
        title,
        date,
        start,
        end,
        calendar,
        color: CALENDAR_COLORS[calendar],
        location: sanitizeText(event.location),
        participants: sanitizeText(event.participants),
        description: sanitizeText(event.description, `由 OneTool LLM 根据「${input.message.trim()}」创建。`)
      }
    }
  }
}

function normalizeCalendarName(value: unknown): LlmCalendarName {
  const text = sanitizeText(value)
  return isCalendarName(text) ? text : '工作'
}

function isCalendarName(value: string): value is LlmCalendarName {
  return value === '个人' || value === '工作' || value === '家庭' || value === '重要'
}

function sanitizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function minutesFromTime(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function inferBroadTimeRange(message: string): { start: string; end: string } | null {
  if (hasSpecificTimeExpression(message)) return null
  if (/全天|一整天|整天/.test(message)) return { start: '09:00', end: '18:00' }
  if (/一上午|整个上午|上午/.test(message)) return { start: '09:00', end: '12:00' }
  if (/早上/.test(message)) return { start: '08:00', end: '10:00' }
  if (/一下午|整个下午|下午/.test(message)) return { start: '14:00', end: '18:00' }
  if (/一晚上|整个晚上|晚上/.test(message)) return { start: '19:00', end: '21:00' }
  if (/中午/.test(message)) return { start: '12:00', end: '13:00' }
  return null
}

function hasSpecificTimeExpression(message: string): boolean {
  return /(\d{1,2})(?::|点半?|\.)(\d{1,2})?/.test(message)
    || /[零一二两三四五六七八九十]{1,3}点半?/.test(message)
}

function helpResult(message: string): LlmCalendarAssistantResult {
  return {
    type: 'help',
    message
  }
}
