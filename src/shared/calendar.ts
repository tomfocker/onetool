export interface CalendarEvent {
  id: string
  title: string
  date: string
  start: string
  end: string
  calendar: string
  color: string
  location: string
  participants: string
  description: string
}

export interface CalendarWidgetBounds {
  x: number
  y: number
  width: number
  height: number
}

export type CalendarWidgetBackgroundMode = 'solid' | 'glass'

export interface CalendarWidgetState {
  exists: boolean
  visible: boolean
  enabled: boolean
  alwaysOnTop: boolean
  backgroundMode: CalendarWidgetBackgroundMode
  bounds: CalendarWidgetBounds | null
}

export const DEFAULT_CALENDAR_REMINDER_LEAD_MINUTES = 10

const REQUIRED_EVENT_KEYS: Array<keyof CalendarEvent> = [
  'id',
  'title',
  'date',
  'start',
  'end',
  'calendar',
  'color',
  'location',
  'participants',
  'description'
]

export function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return REQUIRED_EVENT_KEYS.every((key) => typeof candidate[key] === 'string')
}

export function normalizeCalendarEvents(value: unknown): CalendarEvent[] {
  if (!Array.isArray(value)) return []
  return value.filter(isCalendarEvent).map((event) => ({ ...event }))
}

export function sortCalendarEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((left, right) => {
    const byDate = left.date.localeCompare(right.date)
    if (byDate !== 0) return byDate
    const byStart = left.start.localeCompare(right.start)
    if (byStart !== 0) return byStart
    return left.title.localeCompare(right.title)
  })
}

export function getCalendarEventStartTimestamp(event: Pick<CalendarEvent, 'date' | 'start'>): number {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(event.date)
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(event.start)
  if (!dateMatch || !timeMatch) return Number.NaN

  const year = Number(dateMatch[1])
  const month = Number(dateMatch[2])
  const day = Number(dateMatch[3])
  const hours = Number(timeMatch[1])
  const minutes = Number(timeMatch[2])

  if (month < 1 || month > 12 || day < 1 || day > 31 || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return Number.NaN
  }

  const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0)
  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day ||
    localDate.getHours() !== hours ||
    localDate.getMinutes() !== minutes
  ) {
    return Number.NaN
  }

  return localDate.getTime()
}

export function getCalendarReminderDelay(
  event: Pick<CalendarEvent, 'date' | 'start'>,
  nowMs = Date.now(),
  leadMinutes = DEFAULT_CALENDAR_REMINDER_LEAD_MINUTES
): number | null {
  const startMs = getCalendarEventStartTimestamp(event)
  if (!Number.isFinite(startMs) || startMs <= nowMs) return null
  const reminderMs = startMs - leadMinutes * 60 * 1000
  return Math.max(0, reminderMs - nowMs)
}

export function createCalendarReminderKey(event: Pick<CalendarEvent, 'id' | 'date' | 'start'>): string {
  return `${event.id}:${event.date}:${event.start}`
}
