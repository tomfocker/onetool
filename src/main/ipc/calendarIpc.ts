import { BrowserWindow, ipcMain } from 'electron'
import { normalizeCalendarEvents, type CalendarWidgetBounds } from '../../shared/calendar'
import { calendarReminderService } from '../services/CalendarReminderService'
import { windowManagerService } from '../services/WindowManagerService'

export function registerCalendarIpc(_getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('calendar-widget-get-state', () => {
    return windowManagerService.getCalendarWidgetState()
  })

  ipcMain.handle('calendar-widget-show', () => {
    return windowManagerService.showCalendarWidgetWindow()
  })

  ipcMain.handle('calendar-widget-hide', () => {
    return windowManagerService.hideCalendarWidgetWindow()
  })

  ipcMain.handle('calendar-widget-toggle', () => {
    return windowManagerService.toggleCalendarWidgetWindow()
  })

  ipcMain.handle('calendar-widget-set-bounds', (_event, bounds: CalendarWidgetBounds) => {
    return windowManagerService.setCalendarWidgetBounds(bounds)
  })

  ipcMain.handle('calendar-events-replace', (_event, events: unknown) => {
    const normalizedEvents = normalizeCalendarEvents(events)
    calendarReminderService.replaceEvents(normalizedEvents)
    windowManagerService.broadcastCalendarEvents(normalizedEvents)
    return { success: true, data: normalizedEvents }
  })
}
