import type { CalendarEvent } from '../../../shared/calendar'

export interface DesktopCalendarWidgetCell {
  date: string
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
  eventCount: number
  eventColors: string[]
}

export interface DesktopCalendarWidgetModel {
  monthLabel: string
  dayLabel: string
  todayDate: string
  selectedDate: string
  cells: DesktopCalendarWidgetCell[]
  todayEvents: CalendarEvent[]
  upcomingEvents: CalendarEvent[]
}

export interface BuildDesktopCalendarWidgetModelInput {
  events: CalendarEvent[]
  selectedDate?: string
  now?: Date
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function buildDesktopCalendarWidgetModel({
  events,
  selectedDate,
  now = new Date()
}: BuildDesktopCalendarWidgetModelInput): DesktopCalendarWidgetModel {
  const todayDate = formatLocalDate(now)
  const activeDate = selectedDate ?? todayDate
  const activeParts = parseDateKey(activeDate) ?? parseDateKey(todayDate)!
  const firstOfMonth = new Date(Date.UTC(activeParts.year, activeParts.month - 1, 1))
  const gridStart = addUtcDays(firstOfMonth, -firstOfMonth.getUTCDay())
  const nowTimestamp = now.getTime()
  const futureEvents = sortEvents(events.filter((event) => getEventEndTimestamp(event) >= nowTimestamp))

  return {
    monthLabel: `${activeParts.year}年${activeParts.month}月`,
    dayLabel: formatWidgetDayLabel(activeDate),
    todayDate,
    selectedDate: activeDate,
    cells: Array.from({ length: 42 }, (_, index) => {
      const cellDate = addUtcDays(gridStart, index)
      const date = formatUtcDate(cellDate)
      const cellEvents = events.filter((event) => event.date === date)
      return {
        date,
        day: cellDate.getUTCDate(),
        isCurrentMonth: cellDate.getUTCMonth() + 1 === activeParts.month,
        isToday: date === todayDate,
        isSelected: date === activeDate,
        eventCount: cellEvents.length,
        eventColors: uniqueEventColors(cellEvents)
      }
    }),
    todayEvents: futureEvents.filter((event) => event.date === todayDate),
    upcomingEvents: futureEvents.slice(0, 5)
  }
}

export function formatWidgetDayLabel(date: string): string {
  const parts = parseDateKey(date)
  if (!parts) return date
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  return `${parts.month}月${parts.day}日 ${WEEKDAY_LABELS[utcDate.getUTCDay()]}`
}

function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((left, right) => {
    const byStart = getEventStartTimestamp(left) - getEventStartTimestamp(right)
    if (byStart !== 0) return byStart
    return left.title.localeCompare(right.title, 'zh-CN')
  })
}

function uniqueEventColors(events: CalendarEvent[]): string[] {
  return [...new Set(events.map((event) => event.color).filter(Boolean))].slice(0, 3)
}

function formatLocalDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

function formatUtcDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-')
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function getEventStartTimestamp(event: Pick<CalendarEvent, 'date' | 'start'>): number {
  return getEventTimeTimestamp(event.date, event.start)
}

function getEventEndTimestamp(event: Pick<CalendarEvent, 'date' | 'start' | 'end'>): number {
  const start = getEventStartTimestamp(event)
  const end = getEventTimeTimestamp(event.date, event.end)
  return Number.isFinite(end) && end > start ? end : start
}

function getEventTimeTimestamp(date: string, time: string): number {
  const parts = parseDateKey(date)
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!parts || !match) return Number.POSITIVE_INFINITY
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59 || (hours === 24 && minutes !== 0)) {
    return Number.POSITIVE_INFINITY
  }
  return new Date(parts.year, parts.month - 1, parts.day, hours, minutes, 0, 0).getTime()
}

function parseDateKey(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}
