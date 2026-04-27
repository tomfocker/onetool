import { Notification } from 'electron'
import {
  createCalendarReminderKey,
  DEFAULT_CALENDAR_REMINDER_LEAD_MINUTES,
  getCalendarReminderDelay,
  normalizeCalendarEvents,
  sortCalendarEvents,
  type CalendarEvent
} from '../../shared/calendar'
import { settingsService } from './SettingsService'

type SettingsLike = {
  getSettings(): { calendarReminderLeadMinutes?: number }
  on?(event: 'changed', handler: (settings: { calendarReminderLeadMinutes?: number }) => void): void
}

type NotificationInstance = {
  on?(event: 'click', handler: () => void): unknown
  show(): void
}

type NotificationConstructor = {
  new (options: { title: string; body: string; silent?: boolean }): NotificationInstance
  isSupported?(): boolean
}

type CalendarReminderServiceDependencies = {
  settingsService: SettingsLike
  Notification?: NotificationConstructor
  nowProvider?: () => number
  scheduleTimeout?: (handler: () => void, delayMs: number) => unknown
  clearScheduledTimeout?: (timer: unknown) => void
  openCalendar?: () => void
}

export class CalendarReminderService {
  private events: CalendarEvent[] = []
  private readonly timers = new Map<string, unknown>()
  private readonly shownReminderKeys = new Set<string>()
  private readonly settingsService: SettingsLike
  private readonly Notification: NotificationConstructor
  private readonly nowProvider: () => number
  private readonly scheduleTimeout: (handler: () => void, delayMs: number) => unknown
  private readonly clearScheduledTimeout: (timer: unknown) => void
  private openCalendarHandler: () => void

  constructor(dependencies: CalendarReminderServiceDependencies) {
    this.settingsService = dependencies.settingsService
    this.Notification = dependencies.Notification ?? Notification
    this.nowProvider = dependencies.nowProvider ?? Date.now
    this.scheduleTimeout = dependencies.scheduleTimeout ?? setTimeout
    this.clearScheduledTimeout = dependencies.clearScheduledTimeout ?? ((timer) => {
      clearTimeout(timer as ReturnType<typeof setTimeout>)
    })
    this.openCalendarHandler = dependencies.openCalendar ?? (() => undefined)

    this.settingsService.on?.('changed', () => {
      this.reschedulePendingReminders()
    })
  }

  setOpenCalendarHandler(handler: () => void): void {
    this.openCalendarHandler = handler
  }

  replaceEvents(events: unknown): void {
    this.events = sortCalendarEvents(normalizeCalendarEvents(events))
    this.reschedulePendingReminders()
  }

  clear(): void {
    this.clearTimers()
    this.events = []
  }

  private reschedulePendingReminders(): void {
    this.clearTimers()
    for (const event of this.events) {
      this.scheduleEvent(event)
    }
  }

  private clearTimers(): void {
    for (const timer of this.timers.values()) {
      this.clearScheduledTimeout(timer)
    }
    this.timers.clear()
  }

  private scheduleEvent(event: CalendarEvent): void {
    const reminderKey = createCalendarReminderKey(event)
    if (this.shownReminderKeys.has(reminderKey)) {
      return
    }

    const delayMs = getCalendarReminderDelay(event, this.nowProvider(), this.getReminderLeadMinutes())
    if (delayMs === null) {
      return
    }

    const timer = this.scheduleTimeout(() => {
      this.timers.delete(reminderKey)
      this.showReminder(event, reminderKey)
    }, delayMs)
    this.timers.set(reminderKey, timer)
  }

  private getReminderLeadMinutes(): number {
    const rawLeadMinutes = this.settingsService.getSettings().calendarReminderLeadMinutes
    const leadMinutes = Number(rawLeadMinutes)
    if (!Number.isFinite(leadMinutes)) {
      return DEFAULT_CALENDAR_REMINDER_LEAD_MINUTES
    }
    return Math.min(1440, Math.max(0, Math.floor(leadMinutes)))
  }

  private showReminder(event: CalendarEvent, reminderKey: string): void {
    if (this.shownReminderKeys.has(reminderKey)) {
      return
    }
    this.shownReminderKeys.add(reminderKey)

    if (typeof this.Notification.isSupported === 'function' && !this.Notification.isSupported()) {
      return
    }

    const notification = new this.Notification({
      title: '日程提醒',
      body: this.createNotificationBody(event),
      silent: false
    })

    notification.on?.('click', () => {
      this.openCalendarHandler()
    })
    notification.show()
  }

  private createNotificationBody(event: CalendarEvent): string {
    const timeRange = `${event.start}-${event.end}`
    const location = event.location.trim()
    return location
      ? `${timeRange} ${event.title}\n${location}`
      : `${timeRange} ${event.title}`
  }
}

export const calendarReminderService = new CalendarReminderService({
  settingsService
})
