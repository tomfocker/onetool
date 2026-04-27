const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { EventEmitter } = require('node:events')

function transpileModule(filePath, customRequire) {
  const source = fs.readFileSync(filePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    },
    fileName: filePath
  }).outputText

  const module = { exports: {} }
  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require: customRequire ?? require,
    __dirname: path.dirname(filePath),
    __filename: filePath,
    console,
    process,
    Buffer,
    setTimeout,
    clearTimeout
  }, { filename: filePath })

  return module.exports
}

function loadCalendarModule() {
  return transpileModule(path.join(__dirname, '..', '..', 'shared', 'calendar.ts'))
}

function loadCalendarReminderServiceModule(overrides = {}) {
  const calendarModule = loadCalendarModule()
  return transpileModule(path.join(__dirname, 'CalendarReminderService.ts'), (specifier) => {
    if (specifier === 'electron') {
      return {
        Notification: overrides.Notification
      }
    }
    if (specifier === '../../shared/calendar') {
      return calendarModule
    }
    if (specifier === './SettingsService') {
      return {
        settingsService: overrides.settingsService || createSettingsService()
      }
    }
    return require(specifier)
  })
}

function createSettingsService(initialSettings = {}) {
  const service = new EventEmitter()
  service.settings = {
    calendarReminderLeadMinutes: 15,
    ...initialSettings
  }
  service.getSettings = () => service.settings
  service.changeSettings = (updates) => {
    service.settings = { ...service.settings, ...updates }
    service.emit('changed', service.settings)
  }
  return service
}

function createScheduler() {
  let nextId = 1
  const timers = new Map()
  const cleared = []

  return {
    timers,
    cleared,
    schedule(handler, delayMs) {
      const id = nextId
      nextId += 1
      timers.set(id, {
        handler: () => {
          timers.delete(id)
          handler()
        },
        delayMs
      })
      return id
    },
    clear(id) {
      cleared.push(id)
      timers.delete(id)
    }
  }
}

function createNotificationRecorder() {
  const notifications = []

  class MockNotification {
    static isSupported() {
      return true
    }

    constructor(options) {
      this.options = options
      this.handlers = {}
      this.shown = false
      notifications.push(this)
    }

    on(event, handler) {
      this.handlers[event] = handler
      return this
    }

    show() {
      this.shown = true
    }
  }

  return { MockNotification, notifications }
}

function createEvent(overrides = {}) {
  return {
    id: 'event-1',
    title: '客户电话',
    date: '2026-04-27',
    start: '10:00',
    end: '11:00',
    calendar: '工作',
    color: '#2563eb',
    location: '远程会议',
    participants: 'Ada',
    description: '确认下周计划',
    ...overrides
  }
}

test('CalendarReminderService schedules future events and shows native notifications', () => {
  const { CalendarReminderService } = loadCalendarReminderServiceModule()
  const scheduler = createScheduler()
  const { MockNotification, notifications } = createNotificationRecorder()
  const settingsService = createSettingsService({ calendarReminderLeadMinutes: 15 })
  let opened = 0
  const nowMs = new Date(2026, 3, 27, 9, 0).getTime()

  const service = new CalendarReminderService({
    settingsService,
    Notification: MockNotification,
    nowProvider: () => nowMs,
    scheduleTimeout: scheduler.schedule,
    clearScheduledTimeout: scheduler.clear,
    openCalendar: () => {
      opened += 1
    }
  })

  service.replaceEvents([
    createEvent(),
    { id: 'broken', title: 'missing fields' },
    createEvent({ id: 'past', start: '08:00', end: '09:00' })
  ])

  assert.equal(scheduler.timers.size, 1)
  const timer = [...scheduler.timers.values()][0]
  assert.equal(timer.delayMs, 45 * 60 * 1000)

  timer.handler()

  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].shown, true)
  assert.equal(notifications[0].options.title, '日程提醒')
  assert.match(notifications[0].options.body, /10:00-11:00/)
  assert.match(notifications[0].options.body, /客户电话/)
  assert.match(notifications[0].options.body, /远程会议/)

  notifications[0].handlers.click()
  assert.equal(opened, 1)
})

test('CalendarReminderService cancels stale timers and does not repeat a shown occurrence', () => {
  const { CalendarReminderService } = loadCalendarReminderServiceModule()
  const scheduler = createScheduler()
  const { MockNotification, notifications } = createNotificationRecorder()
  const settingsService = createSettingsService({ calendarReminderLeadMinutes: 15 })
  const nowMs = new Date(2026, 3, 27, 9, 0).getTime()

  const service = new CalendarReminderService({
    settingsService,
    Notification: MockNotification,
    nowProvider: () => nowMs,
    scheduleTimeout: scheduler.schedule,
    clearScheduledTimeout: scheduler.clear,
    openCalendar: () => undefined
  })

  service.replaceEvents([createEvent()])
  const firstTimerId = [...scheduler.timers.keys()][0]
  service.replaceEvents([createEvent({ start: '11:00', end: '12:00' })])

  assert.deepEqual(scheduler.cleared, [firstTimerId])
  assert.equal(scheduler.timers.size, 1)
  const movedTimer = [...scheduler.timers.values()][0]
  assert.equal(movedTimer.delayMs, 105 * 60 * 1000)

  movedTimer.handler()
  assert.equal(notifications.length, 1)

  service.replaceEvents([createEvent({ start: '11:00', end: '12:00' })])
  assert.equal(scheduler.timers.size, 0)
})

test('CalendarReminderService reschedules pending reminders when lead-time settings change', () => {
  const { CalendarReminderService } = loadCalendarReminderServiceModule()
  const scheduler = createScheduler()
  const { MockNotification } = createNotificationRecorder()
  const settingsService = createSettingsService({ calendarReminderLeadMinutes: 10 })
  const nowMs = new Date(2026, 3, 27, 9, 0).getTime()

  const service = new CalendarReminderService({
    settingsService,
    Notification: MockNotification,
    nowProvider: () => nowMs,
    scheduleTimeout: scheduler.schedule,
    clearScheduledTimeout: scheduler.clear,
    openCalendar: () => undefined
  })

  service.replaceEvents([createEvent()])
  const firstTimerId = [...scheduler.timers.keys()][0]
  assert.equal([...scheduler.timers.values()][0].delayMs, 50 * 60 * 1000)

  settingsService.changeSettings({ calendarReminderLeadMinutes: 30 })

  assert.deepEqual(scheduler.cleared, [firstTimerId])
  assert.equal(scheduler.timers.size, 1)
  assert.equal([...scheduler.timers.values()][0].delayMs, 30 * 60 * 1000)
})
