export interface CalendarGridConfig {
  startHour: number
  endHour: number
  hourHeight: number
  snapMinutes: number
  minEventMinutes: number
  eventGapPx: number
  minEventHeightPx: number
}

export interface CalendarTimeRange {
  start: string
  end: string
  startMinutes: number
  endMinutes: number
}

export interface CalendarRangePosition {
  top: number
  height: number
}

export interface DraggedEventInput {
  date: string
  durationMinutes: number
  grabOffsetY: number
  pointerY: number
}

export interface DraggedEventTime extends CalendarTimeRange, CalendarRangePosition {
  date: string
}

export interface DraggedEventPreview extends CalendarRangePosition {
  date: string
  drop: DraggedEventTime
}

export const DEFAULT_CALENDAR_GRID_CONFIG: CalendarGridConfig = {
  startHour: 8,
  endHour: 18,
  hourHeight: 92,
  snapMinutes: 15,
  minEventMinutes: 30,
  eventGapPx: 10,
  minEventHeightPx: 48
}

export function minutesFromTime(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function timeFromMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export function getCalendarGridHeight(config = DEFAULT_CALENDAR_GRID_CONFIG): number {
  return (config.endHour - config.startHour) * config.hourHeight
}

export function calculateEventPosition(
  event: { start: string; end: string },
  config = DEFAULT_CALENDAR_GRID_CONFIG
): CalendarRangePosition {
  const range = {
    startMinutes: minutesFromTime(event.start),
    endMinutes: minutesFromTime(event.end)
  }
  const position = calculateMinutesPosition(range, config)
  return {
    top: position.top,
    height: Math.max(position.height - config.eventGapPx, config.minEventHeightPx)
  }
}

export function calculateSelectionPosition(
  range: CalendarTimeRange,
  config = DEFAULT_CALENDAR_GRID_CONFIG
): CalendarRangePosition {
  return calculateMinutesPosition(range, config)
}

export function resolveSelectionRange(
  startY: number,
  currentY: number,
  config = DEFAULT_CALENDAR_GRID_CONFIG
): CalendarTimeRange {
  const anchorMinutes = minutesFromGridY(startY, config)
  const currentMinutes = minutesFromGridY(currentY, config)
  const dayStart = config.startHour * 60
  const dayEnd = config.endHour * 60
  let startMinutes: number
  let endMinutes: number

  if (currentMinutes >= anchorMinutes) {
    startMinutes = anchorMinutes
    endMinutes = Math.max(currentMinutes, anchorMinutes + config.minEventMinutes)
  } else {
    endMinutes = anchorMinutes
    startMinutes = Math.min(currentMinutes, anchorMinutes - config.minEventMinutes)
  }

  startMinutes = clamp(startMinutes, dayStart, dayEnd)
  endMinutes = clamp(endMinutes, dayStart, dayEnd)

  if (endMinutes - startMinutes < config.minEventMinutes) {
    if (currentMinutes < anchorMinutes) {
      startMinutes = Math.max(dayStart, endMinutes - config.minEventMinutes)
    } else {
      endMinutes = Math.min(dayEnd, startMinutes + config.minEventMinutes)
    }
  }

  if (endMinutes - startMinutes < config.minEventMinutes) {
    startMinutes = Math.max(dayStart, dayEnd - config.minEventMinutes)
    endMinutes = dayEnd
  }

  return {
    start: timeFromMinutes(startMinutes),
    end: timeFromMinutes(endMinutes),
    startMinutes,
    endMinutes
  }
}

export function resolveDraggedEventTime(
  input: DraggedEventInput,
  config = DEFAULT_CALENDAR_GRID_CONFIG
): DraggedEventTime {
  const dayStart = config.startHour * 60
  const dayEnd = config.endHour * 60
  const durationMinutes = clamp(input.durationMinutes, config.snapMinutes, dayEnd - dayStart)
  const maxStart = dayEnd - durationMinutes
  const startMinutes = clamp(minutesFromGridY(input.pointerY - input.grabOffsetY, config), dayStart, maxStart)
  const endMinutes = startMinutes + durationMinutes
  const position = calculateMinutesPosition({ startMinutes, endMinutes }, config)

  return {
    date: input.date,
    start: timeFromMinutes(startMinutes),
    end: timeFromMinutes(endMinutes),
    startMinutes,
    endMinutes,
    top: position.top,
    height: Math.max(position.height - config.eventGapPx, config.minEventHeightPx)
  }
}

export function resolveDraggedEventPreview(
  input: DraggedEventInput,
  config = DEFAULT_CALENDAR_GRID_CONFIG
): DraggedEventPreview {
  const dayStart = config.startHour * 60
  const dayEnd = config.endHour * 60
  const gridHeight = getCalendarGridHeight(config)
  const durationMinutes = clamp(input.durationMinutes, config.snapMinutes, dayEnd - dayStart)
  const rawEventHeight = (durationMinutes / 60) * config.hourHeight
  const maxTop = Math.max(0, gridHeight - rawEventHeight)
  const top = clamp(input.pointerY - input.grabOffsetY, 0, maxTop)

  return {
    date: input.date,
    top,
    height: Math.max(rawEventHeight - config.eventGapPx, config.minEventHeightPx),
    drop: resolveDraggedEventTime(input, config)
  }
}

function calculateMinutesPosition(
  range: { startMinutes: number; endMinutes: number },
  config: CalendarGridConfig
): CalendarRangePosition {
  const dayStart = config.startHour * 60
  const top = ((range.startMinutes - dayStart) / 60) * config.hourHeight
  const height = ((range.endMinutes - range.startMinutes) / 60) * config.hourHeight
  return {
    top: Math.max(top, 0),
    height: Math.max(height, 0)
  }
}

function minutesFromGridY(y: number, config: CalendarGridConfig): number {
  const gridHeight = getCalendarGridHeight(config)
  const clampedY = clamp(y, 0, gridHeight)
  const rawMinutes = config.startHour * 60 + (clampedY / config.hourHeight) * 60
  return snapToStep(rawMinutes, config.snapMinutes)
}

function snapToStep(value: number, step: number): number {
  return Math.round(value / step) * step
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
