export const CALENDAR_STORAGE_KEY = 'onetool-calendar-events-v1'
export const CALENDAR_TIME_RANGE_STORAGE_KEY = 'onetool-calendar-time-range-v1'

export interface CalendarDisplayTimeRange {
  startHour: number
  endHour: number
}

export interface StoredCalendarEvent {
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

type CalendarStorageLike = Pick<Storage, 'getItem'>

export const DEFAULT_CALENDAR_DISPLAY_TIME_RANGE: CalendarDisplayTimeRange = {
  startHour: 8,
  endHour: 18
}

export function getTodayDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function loadCalendarEvents(storage: CalendarStorageLike, key = CALENDAR_STORAGE_KEY): StoredCalendarEvent[] {
  try {
    const stored = storage.getItem(key)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isStoredCalendarEvent).filter((event) => !isSeedCalendarEvent(event))
  } catch {
    return []
  }
}

export function loadCalendarTimeRange(
  storage: CalendarStorageLike,
  key = CALENDAR_TIME_RANGE_STORAGE_KEY
): CalendarDisplayTimeRange {
  try {
    const stored = storage.getItem(key)
    if (!stored) return DEFAULT_CALENDAR_DISPLAY_TIME_RANGE
    return normalizeCalendarTimeRange(JSON.parse(stored))
  } catch {
    return DEFAULT_CALENDAR_DISPLAY_TIME_RANGE
  }
}

export function normalizeCalendarTimeRange(value: unknown): CalendarDisplayTimeRange {
  if (!value || typeof value !== 'object') return DEFAULT_CALENDAR_DISPLAY_TIME_RANGE
  const candidate = value as Partial<CalendarDisplayTimeRange>
  const startHour = Number(candidate.startHour)
  const endHour = Number(candidate.endHour)

  if (
    !Number.isInteger(startHour)
    || !Number.isInteger(endHour)
    || startHour < 0
    || startHour > 23
    || endHour < 1
    || endHour > 24
    || endHour <= startHour
  ) {
    return DEFAULT_CALENDAR_DISPLAY_TIME_RANGE
  }

  return { startHour, endHour }
}

export function expandCalendarTimeRangeToEvent(
  range: CalendarDisplayTimeRange,
  event: Pick<StoredCalendarEvent, 'start' | 'end'>
): CalendarDisplayTimeRange {
  const normalizedRange = normalizeCalendarTimeRange(range)
  const startMinutes = parseClockMinutes(event.start)
  const endMinutes = parseClockMinutes(event.end)
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return normalizedRange

  return normalizeCalendarTimeRange({
    startHour: Math.min(normalizedRange.startHour, Math.floor(startMinutes / 60)),
    endHour: Math.max(normalizedRange.endHour, Math.ceil(endMinutes / 60))
  })
}

export function isSeedCalendarEvent(event: Pick<StoredCalendarEvent, 'id'>): boolean {
  return event.id.startsWith('seed-')
}

function isStoredCalendarEvent(value: unknown): value is StoredCalendarEvent {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return [
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
  ].every((key) => typeof candidate[key] === 'string')
}

function parseClockMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return null
  if (hours === 24 && minutes !== 0) return null
  return hours * 60 + minutes
}
