import type { CalendarEvent } from '../../../shared/calendar'
import { loadCalendarEvents } from './calendarStorage'

type CalendarStorageLike = Pick<Storage, 'getItem'>

export interface CalendarNativeBridge {
  replaceEvents?: (events: CalendarEvent[]) => Promise<CalendarEvent[]> | CalendarEvent[]
}

export async function syncStoredCalendarEventsToNativeBridge(
  storage: CalendarStorageLike,
  bridge = getDefaultCalendarBridge()
): Promise<boolean> {
  return syncCalendarEventsToNativeBridge(loadCalendarEvents(storage) as CalendarEvent[], bridge)
}

export async function syncCalendarEventsToNativeBridge(
  events: CalendarEvent[],
  bridge = getDefaultCalendarBridge()
): Promise<boolean> {
  if (!bridge?.replaceEvents) return false

  try {
    await bridge.replaceEvents(events)
    return true
  } catch (error) {
    console.warn('Calendar native sync failed:', error)
    return false
  }
}

function getDefaultCalendarBridge(): CalendarNativeBridge | undefined {
  const maybeWindow = globalThis as typeof globalThis & {
    window?: {
      electron?: {
        calendar?: CalendarNativeBridge
      }
    }
  }

  return maybeWindow.window?.electron?.calendar
}
