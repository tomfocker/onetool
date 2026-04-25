export type AssistantCalendarName = '个人' | '工作' | '家庭' | '重要'

export interface AssistantCalendarEventDraft {
  title: string
  date: string
  start: string
  end: string
  calendar: AssistantCalendarName
  color: string
  location: string
  participants: string
  description: string
}

export interface CalendarAssistantContext {
  selectedDate: string
  today: string
}

export type CalendarAssistantResult =
  | {
    type: 'create'
    message: string
    event: AssistantCalendarEventDraft
  }
  | {
    type: 'filter'
    message: string
    search: string
  }
  | {
    type: 'help'
    message: string
  }

const CALENDAR_COLORS: Record<AssistantCalendarName, string> = {
  个人: '#2f6df6',
  工作: '#38b887',
  家庭: '#7457d8',
  重要: '#ca8528'
}

const WEEKDAY_INDEX: Record<string, number> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6
}

export function parseCalendarAssistantMessage(
  message: string,
  context: CalendarAssistantContext
): CalendarAssistantResult {
  const normalized = normalizeText(message)
  if (!normalized) return helpResult()

  const filterMatch = normalized.match(/(?:查看|搜索|找一下|筛选)(.+?)(?:日程|会议|安排)?$/)
  if (filterMatch && !hasTimeExpression(normalized)) {
    const search = cleanupTitle(filterMatch[1])
    if (search) {
      return {
        type: 'filter',
        search,
        message: `已帮你筛选「${search}」。`
      }
    }
  }

  const timeRange = parseTimeRange(normalized)
  if (!timeRange) return helpResult()

  const date = parseDateExpression(normalized, context)
  const location = parseNamedField(normalized, ['地点', '在'])
  const participants = parseNamedField(normalized, ['参与者'])
  const title = parseTitle(normalized)

  if (!title) return helpResult()

  const calendar = inferCalendar(title, normalized)
  return {
    type: 'create',
    message: `我已创建「${title}」：${date} ${timeRange.start} - ${timeRange.end}。`,
    event: {
      title,
      date,
      start: timeRange.start,
      end: timeRange.end,
      calendar,
      color: CALENDAR_COLORS[calendar],
      location,
      participants,
      description: `由 AI 日历助手根据「${message.trim()}」创建。`
    }
  }
}

function normalizeText(value: string): string {
  return value
    .trim()
    .replace(/[，。；;]/g, ' ')
    .replace(/\s+/g, ' ')
}

function parseDateExpression(message: string, context: CalendarAssistantContext): string {
  if (/后天/.test(message)) return addDays(context.today, 2)
  if (/明天/.test(message)) return addDays(context.today, 1)
  if (/今天|今日/.test(message)) return context.today

  const explicitMonthDay = message.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})(?:日|号)?/)
  if (explicitMonthDay) {
    const selected = parseDate(context.selectedDate)
    const year = explicitMonthDay[1] ? Number(explicitMonthDay[1]) : selected.getUTCFullYear()
    return formatDate(new Date(Date.UTC(year, Number(explicitMonthDay[2]) - 1, Number(explicitMonthDay[3]))))
  }

  const weekday = message.match(/(?:这周|本周|下周)?周([日天一二三四五六])/)
  if (weekday) {
    const base = startOfWeek(context.selectedDate)
    const offset = WEEKDAY_INDEX[weekday[1]]
    const extraWeek = weekday[0].includes('下周') ? 7 : 0
    return addDays(base, offset === 0 ? 6 + extraWeek : offset - 1 + extraWeek)
  }

  return context.selectedDate
}

function parseTimeRange(message: string): { start: string; end: string } | null {
  const explicitRange = message.match(/(上午|下午|晚上|中午)?(\d{1,2})(?::|点半?|\.)(\d{1,2})?\s*(?:-|~|到|至)\s*(上午|下午|晚上|中午)?(\d{1,2})(?::|点半?|\.)(\d{1,2})?/)
  if (explicitRange) {
    const start = normalizeHour(Number(explicitRange[2]), Number(explicitRange[3] ?? (explicitRange[0].includes('半') ? 30 : 0)), explicitRange[1])
    const end = normalizeHour(Number(explicitRange[5]), Number(explicitRange[6] ?? (explicitRange[0].includes('半') ? 30 : 0)), explicitRange[4] ?? explicitRange[1], start.hours)
    return {
      start: formatTime(start.hours, start.minutes),
      end: formatTime(end.hours, end.minutes)
    }
  }

  const singleTime = message.match(/(上午|下午|晚上|中午)?(\d{1,2})(?::|点半?|\.)(\d{1,2})?/)
  if (!singleTime) return parseBroadPeriodRange(message)

  const start = normalizeHour(Number(singleTime[2]), Number(singleTime[3] ?? (singleTime[0].includes('半') ? 30 : 0)), singleTime[1])
  const endMinutes = start.hours * 60 + start.minutes + 60
  return {
    start: formatTime(start.hours, start.minutes),
    end: formatTime(Math.floor(endMinutes / 60), endMinutes % 60)
  }
}

function parseBroadPeriodRange(message: string): { start: string; end: string } | null {
  if (/全天|一整天|整天/.test(message)) return { start: '09:00', end: '18:00' }
  if (/一上午|整个上午|上午/.test(message)) return { start: '09:00', end: '12:00' }
  if (/早上/.test(message)) return { start: '08:00', end: '10:00' }
  if (/一下午|整个下午|下午/.test(message)) return { start: '14:00', end: '18:00' }
  if (/一晚上|整个晚上|晚上/.test(message)) return { start: '19:00', end: '21:00' }
  if (/中午/.test(message)) return { start: '12:00', end: '13:00' }
  return null
}

function normalizeHour(hour: number, minutes: number, period?: string, referenceStartHour?: number): { hours: number; minutes: number } {
  let nextHour = hour
  if ((period === '下午' || period === '晚上') && nextHour < 12) nextHour += 12
  if (period === '中午' && nextHour < 11) nextHour += 12
  if (!period && referenceStartHour !== undefined && referenceStartHour >= 12 && nextHour < 12) nextHour += 12
  return {
    hours: nextHour,
    minutes
  }
}

function parseNamedField(message: string, labels: string[]): string {
  for (const label of labels) {
    const match = message.match(new RegExp(`${label}\\s*([^\\s，。；;]+)`))
    if (match) return cleanupTitle(match[1])
  }
  return ''
}

function parseTitle(message: string): string {
  let title = message
    .replace(/(?:(\d{4})年)?\d{1,2}月\d{1,2}(?:日|号)?/g, ' ')
    .replace(/(?:今天|今日|明天|后天|这周|本周|下周|周[日天一二三四五六])/g, ' ')
    .replace(/(?:上午|下午|晚上|中午)?\d{1,2}(?::|点半?|\.)(?:\d{1,2})?\s*(?:-|~|到|至)\s*(?:上午|下午|晚上|中午)?\d{1,2}(?::|点半?|\.)(?:\d{1,2})?/g, ' ')
    .replace(/(?:上午|下午|晚上|中午)?\d{1,2}(?::|点半?|\.)(?:\d{1,2})?/g, ' ')
    .replace(/(?:全天|一整天|整天|一上午|整个上午|上午|早上|一下午|整个下午|下午|一晚上|整个晚上|晚上|中午)/g, ' ')
    .replace(/(?:帮我|给我|安排|创建|新增|加一个|加个|提醒我|记一下|和|跟|写)/g, ' ')
    .replace(/地点\s*[^\s，。；;]+/g, ' ')
    .replace(/在\s*[^\s，。；;]+/g, ' ')
    .replace(/参与者\s*[^\s，。；;]+/g, ' ')

  title = cleanupTitle(title)
  if (title.startsWith('开')) title = title.slice(1)
  if (title.startsWith('有')) title = title.slice(1)
  return cleanupTitle(title)
}

function cleanupTitle(value: string): string {
  return value
    .trim()
    .replace(/^[：:，,\s]+|[：:，,\s]+$/g, '')
    .replace(/\s+/g, '')
}

function inferCalendar(title: string, message: string): AssistantCalendarName {
  if (/家庭|家人|聚餐/.test(title + message)) return '家庭'
  if (/重要/.test(title + message)) return '重要'
  if (/健身|午餐|约会|个人/.test(title + message)) return '个人'
  return '工作'
}

function hasTimeExpression(message: string): boolean {
  return /(\d{1,2})(?::|点半?|\.)(\d{1,2})?/.test(message)
}

function helpResult(): CalendarAssistantResult {
  return {
    type: 'help',
    message: '我还需要标题和时间。例如：明天下午3点安排设计评审，地点会议室A。'
  }
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function addDays(value: string, days: number): string {
  const date = parseDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return formatDate(date)
}

function startOfWeek(value: string): string {
  const date = parseDate(value)
  const day = date.getUTCDay()
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day))
  return formatDate(date)
}

function formatTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
