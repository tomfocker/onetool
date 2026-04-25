import {
  DEFAULT_CALENDAR_GRID_CONFIG,
  calculateEventPosition,
  minutesFromTime,
  type CalendarGridConfig
} from './calendarTime'

export interface CalendarEventLayoutItem<T extends { start: string; end: string }> {
  event: T
  top: number
  height: number
  leftPercent: number
  widthPercent: number
  overlapCount: number
}

interface IndexedCalendarEvent<T extends { start: string; end: string }> {
  event: T
  index: number
  startMinutes: number
  endMinutes: number
}

export function layoutCalendarEventsForDay<T extends { start: string; end: string }>(
  events: T[],
  config: CalendarGridConfig = DEFAULT_CALENDAR_GRID_CONFIG
): CalendarEventLayoutItem<T>[] {
  const indexedEvents = events
    .map((event, index): IndexedCalendarEvent<T> => ({
      event,
      index,
      startMinutes: minutesFromTime(event.start),
      endMinutes: minutesFromTime(event.end)
    }))
    .filter((event) => event.endMinutes > event.startMinutes)
    .sort((left, right) => (
      left.startMinutes - right.startMinutes
      || left.endMinutes - right.endMinutes
      || left.index - right.index
    ))

  const layouts = new Map<number, CalendarEventLayoutItem<T>>()
  let group: IndexedCalendarEvent<T>[] = []
  let groupEndMinutes = Number.NEGATIVE_INFINITY

  const flushGroup = () => {
    for (const layout of layoutEventGroup(group, config)) {
      layouts.set(layout.event.index, layout.item)
    }
    group = []
    groupEndMinutes = Number.NEGATIVE_INFINITY
  }

  for (const event of indexedEvents) {
    if (group.length > 0 && event.startMinutes >= groupEndMinutes) {
      flushGroup()
    }

    group.push(event)
    groupEndMinutes = Math.max(groupEndMinutes, event.endMinutes)
  }

  flushGroup()

  return events
    .map((_, index) => layouts.get(index))
    .filter((layout): layout is CalendarEventLayoutItem<T> => Boolean(layout))
}

export function findCalendarEventConflicts<T extends { id?: string; date: string; start: string; end: string }>(
  events: T[],
  target: { date: string; start: string; end: string },
  ignoreId?: string
): T[] {
  const targetStart = minutesFromTime(target.start)
  const targetEnd = minutesFromTime(target.end)

  return events.filter((event) => {
    if (event.date !== target.date) return false
    if (ignoreId && event.id === ignoreId) return false

    const eventStart = minutesFromTime(event.start)
    const eventEnd = minutesFromTime(event.end)
    return eventStart < targetEnd && targetStart < eventEnd
  })
}

function layoutEventGroup<T extends { start: string; end: string }>(
  group: IndexedCalendarEvent<T>[],
  config: CalendarGridConfig
): Array<{ event: IndexedCalendarEvent<T>; item: CalendarEventLayoutItem<T> }> {
  if (group.length === 0) return []

  const columnEndMinutes: number[] = []
  const assignments = group.map((event) => {
    let column = columnEndMinutes.findIndex((endMinutes) => endMinutes <= event.startMinutes)

    if (column === -1) {
      column = columnEndMinutes.length
      columnEndMinutes.push(event.endMinutes)
    } else {
      columnEndMinutes[column] = event.endMinutes
    }

    return { event, column }
  })
  const columnCount = Math.max(columnEndMinutes.length, 1)
  const widthPercent = 100 / columnCount

  return assignments.map(({ event, column }) => {
    const position = calculateEventPosition(event.event, config)
    return {
      event,
      item: {
        event: event.event,
        top: position.top,
        height: position.height,
        leftPercent: column * widthPercent,
        widthPercent,
        overlapCount: columnCount
      }
    }
  })
}
