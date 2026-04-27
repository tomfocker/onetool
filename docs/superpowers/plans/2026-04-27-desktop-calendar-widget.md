# Desktop Calendar Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop-resident OneTool calendar widget and Windows native schedule reminders for the existing local calendar.

**Architecture:** Add a shared calendar contract so renderer and main process agree on event shape and reminder timing. Mirror calendar events into a main-process reminder service, expose calendar widget controls through preload IPC, and render a compact `#/calendar-widget` React entry in a dedicated Electron window managed by `WindowManagerService`.

**Tech Stack:** Electron 33, React 18, TypeScript, Tailwind v3, lucide-react, node:test, zod-backed settings schema.

---

## File Map

- Create: `src/shared/calendar.ts`
  Responsibility: shared calendar event type, event normalization, local timestamp parsing, reminder key/timing helpers, and widget-safe sorting helpers.
- Create: `src/shared/calendar.test.cjs`
  Responsibility: lock shared date/time parsing, filtering, sorting, and reminder timing behavior.
- Create: `src/main/services/CalendarReminderService.ts`
  Responsibility: mirror normalized events, schedule Windows notifications, de-duplicate fired reminders, clear stale timers, and expose event-change subscriptions.
- Create: `src/main/services/CalendarReminderService.test.cjs`
  Responsibility: verify future-only scheduling, immediate reminders for soon-starting events, duplicate prevention, stale timer clearing, and notification click behavior.
- Modify: `src/shared/types.ts`
  Responsibility: add app settings fields for widget visibility and bounds.
- Modify: `src/shared/settingsSchema.ts`
  Responsibility: migrate/default desktop calendar widget settings.
- Modify: `src/shared/settingsSchema.test.cjs`
  Responsibility: verify old settings migrate with calendar widget defaults.
- Modify: `src/main/services/WindowManagerService.ts`
  Responsibility: create, show, hide, toggle, move-persist, and report desktop calendar widget window state.
- Modify: `src/main/services/WindowManagerService.test.cjs`
  Responsibility: verify widget window options, route hash, state transitions, and bounds persistence call.
- Create: `src/main/ipc/calendarIpc.ts`
  Responsibility: expose calendar sync, event fetch, widget open/close/toggle/state, and full-calendar opening IPC.
- Modify: `src/main/bootstrap/registerIpc.ts`
  Responsibility: register calendar IPC with the main window provider.
- Modify: `src/main/bootstrap/registerIpc.test.cjs`
  Responsibility: verify calendar IPC is part of bootstrap registration.
- Modify: `src/main/index.ts`
  Responsibility: import and register calendar IPC.
- Modify: `src/preload/createElectronBridge.ts`
  Responsibility: expose `window.electron.calendar`.
- Modify: `src/preload/createElectronBridge.test.cjs`
  Responsibility: verify calendar IPC channel mapping and subscriptions.
- Modify: `src/renderer/src/types/electron.d.ts`
  Responsibility: type the new calendar preload API.
- Modify: `src/renderer/src/bootstrapRoute.ts`
  Responsibility: add `calendar-widget` lightweight route.
- Modify: `src/renderer/src/bootstrapRoute.test.cjs`
  Responsibility: verify `#/calendar-widget` routing.
- Modify: `src/renderer/src/main.tsx`
  Responsibility: render `CalendarWidget` for the new route and make the window background transparent.
- Create: `src/renderer/src/tools/calendarWidgetData.ts`
  Responsibility: compute today's events, next event, marked month days, and month cells for the widget UI.
- Create: `src/renderer/src/tools/calendarWidgetData.test.cjs`
  Responsibility: verify widget data derivation from shared calendar events.
- Create: `src/renderer/src/tools/CalendarWidget.tsx`
  Responsibility: compact desktop calendar widget UI and open/close behavior.
- Create: `src/renderer/src/tools/calendarWidget.test.cjs`
  Responsibility: source-level guard that widget subscribes to calendar events, opens the full calendar, closes itself, and uses drag/no-drag regions.
- Modify: `src/renderer/src/tools/CalendarTool.tsx`
  Responsibility: sync event changes to main process and expose the desktop calendar toggle.
- Modify: `src/renderer/src/tools/calendarOverlay.test.cjs`
  Responsibility: verify calendar sync and widget toggle source hooks.

## Task 1: Shared Calendar Contract And Settings Defaults

**Files:**
- Create: `src/shared/calendar.ts`
- Create: `src/shared/calendar.test.cjs`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/settingsSchema.ts`
- Modify: `src/shared/settingsSchema.test.cjs`

- [ ] **Step 1: Write the failing shared calendar tests**

Add to new file `src/shared/calendar.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadCalendarModule() {
  const filePath = path.join(__dirname, 'calendar.ts')
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
    require,
    __dirname,
    __filename: filePath,
    console,
    process
  }, { filename: filePath })

  return module.exports
}

test('normalizeCalendarEvents keeps complete user events and drops malformed entries', () => {
  const { normalizeCalendarEvents } = loadCalendarModule()

  const events = normalizeCalendarEvents([
    {
      id: 'event-1',
      title: '设计评审',
      date: '2026-04-27',
      start: '14:00',
      end: '15:00',
      calendar: '工作',
      color: '#38b887',
      location: '会议室 A',
      participants: '林澈',
      description: ''
    },
    { id: 'broken', title: '缺少时间' }
  ])

  assert.equal(events.length, 1)
  assert.equal(events[0].id, 'event-1')
})

test('getCalendarEventStartTimestamp parses local date and time', () => {
  const { getCalendarEventStartTimestamp } = loadCalendarModule()
  const timestamp = getCalendarEventStartTimestamp({
    id: 'event-1',
    title: '站会',
    date: '2026-04-27',
    start: '09:30',
    end: '10:00',
    calendar: '工作',
    color: '#38b887',
    location: '',
    participants: '',
    description: ''
  })
  const date = new Date(timestamp)

  assert.equal(date.getFullYear(), 2026)
  assert.equal(date.getMonth(), 3)
  assert.equal(date.getDate(), 27)
  assert.equal(date.getHours(), 9)
  assert.equal(date.getMinutes(), 30)
})

test('getCalendarReminderDelay schedules future and soon-starting events without scheduling past events', () => {
  const { getCalendarReminderDelay } = loadCalendarModule()
  const now = new Date(2026, 3, 27, 8, 55, 0).getTime()
  const future = { date: '2026-04-27', start: '09:30' }
  const soon = { date: '2026-04-27', start: '09:00' }
  const past = { date: '2026-04-27', start: '08:30' }

  assert.equal(getCalendarReminderDelay(future, now, 10), 25 * 60 * 1000)
  assert.equal(getCalendarReminderDelay(soon, now, 10), 0)
  assert.equal(getCalendarReminderDelay(past, now, 10), null)
})

test('createCalendarReminderKey changes when an event occurrence changes', () => {
  const { createCalendarReminderKey } = loadCalendarModule()
  const base = {
    id: 'event-1',
    title: '站会',
    date: '2026-04-27',
    start: '09:30',
    end: '10:00',
    calendar: '工作',
    color: '#38b887',
    location: '',
    participants: '',
    description: ''
  }

  assert.equal(createCalendarReminderKey(base), 'event-1:2026-04-27:09:30')
  assert.equal(createCalendarReminderKey({ ...base, start: '10:30' }), 'event-1:2026-04-27:10:30')
})
```

Add to `src/shared/settingsSchema.test.cjs`:

```js
test('migrateSettings adds desktop calendar widget defaults for older settings files', () => {
  const { migrateSettings } = loadSettingsSchemaModule()

  const migrated = migrateSettings({
    schemaVersion: 1,
    recorderHotkey: 'Alt+Shift+R',
    screenshotHotkey: 'Alt+Shift+S',
    floatBallHotkey: 'Alt+Shift+F',
    clipboardHotkey: 'Alt+Shift+C',
    screenshotSavePath: '',
    autoSaveScreenshot: false,
    autoCheckForUpdates: true,
    minimizeToTray: true,
    translateApiUrl: 'https://api.openai.com/v1',
    translateApiKey: '',
    translateModel: 'gpt-4o',
    taskbarAppearanceEnabled: false,
    taskbarAppearancePreset: 'default',
    taskbarAppearanceIntensity: 70,
    taskbarAppearanceTint: '#00000000'
  })

  assert.equal(migrated.calendarWidgetEnabled, false)
  assert.equal(migrated.calendarWidgetBounds, null)
  assert.equal(migrated.calendarReminderLeadMinutes, 10)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- --test-name-pattern "normalizeCalendarEvents|migrateSettings adds desktop calendar widget defaults"
```

Expected: FAIL because `src/shared/calendar.ts` does not exist and the settings defaults are not defined.

- [ ] **Step 3: Add the shared implementation and settings fields**

Create `src/shared/calendar.ts`:

```ts
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

export interface CalendarWidgetState {
  exists: boolean
  visible: boolean
  enabled: boolean
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
```

Modify `src/shared/types.ts`:

```ts
import type { CalendarWidgetBounds } from './calendar'
```

Add these fields to `AppSettings`:

```ts
  calendarWidgetEnabled: boolean
  calendarWidgetBounds: CalendarWidgetBounds | null
  calendarReminderLeadMinutes: number
```

Modify `src/shared/settingsSchema.ts` defaults:

```ts
    calendarWidgetEnabled: false,
    calendarWidgetBounds: null,
    calendarReminderLeadMinutes: 10
```

Add these fields to `SettingsSchema`:

```ts
  calendarWidgetEnabled: z.boolean(),
  calendarWidgetBounds: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  }).nullable(),
  calendarReminderLeadMinutes: z.number().int().min(0).max(1440)
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- --test-name-pattern "normalizeCalendarEvents|migrateSettings adds desktop calendar widget defaults|getCalendarReminderDelay|createCalendarReminderKey"
```

Expected: PASS for the new shared calendar and settings migration tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/calendar.ts src/shared/calendar.test.cjs src/shared/types.ts src/shared/settingsSchema.ts src/shared/settingsSchema.test.cjs
git commit -m "feat: add shared calendar reminder contract"
```

## Task 2: Main-Process Reminder Service

**Files:**
- Create: `src/main/services/CalendarReminderService.ts`
- Create: `src/main/services/CalendarReminderService.test.cjs`

- [ ] **Step 1: Write the failing reminder service tests**

Create `src/main/services/CalendarReminderService.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const Module = require('node:module')
const ts = require('typescript')

function loadReminderServiceModule() {
  const filePath = path.join(__dirname, 'CalendarReminderService.ts')
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
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === '../../shared/calendar') {
      const sharedPath = path.join(__dirname, '..', '..', 'shared', 'calendar.ts')
      const sharedSource = fs.readFileSync(sharedPath, 'utf8')
      const sharedTranspiled = ts.transpileModule(sharedSource, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          esModuleInterop: true
        },
        fileName: sharedPath
      }).outputText
      const sharedModule = { exports: {} }
      vm.runInNewContext(sharedTranspiled, {
        module: sharedModule,
        exports: sharedModule.exports,
        require,
        __dirname: path.dirname(sharedPath),
        __filename: sharedPath,
        console,
        process
      }, { filename: sharedPath })
      return sharedModule.exports
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    vm.runInNewContext(transpiled, {
      module,
      exports: module.exports,
      require,
      __dirname,
      __filename: filePath,
      console,
      process,
      setTimeout,
      clearTimeout
    }, { filename: filePath })
  } finally {
    Module._load = originalLoad
  }

  return module.exports
}

function createEvent(overrides = {}) {
  return {
    id: 'event-1',
    title: '设计评审',
    date: '2026-04-27',
    start: '09:30',
    end: '10:00',
    calendar: '工作',
    color: '#38b887',
    location: '会议室 A',
    participants: '',
    description: '',
    ...overrides
  }
}

function createHarness(now = new Date(2026, 3, 27, 8, 55, 0).getTime()) {
  const { CalendarReminderService } = loadReminderServiceModule()
  const scheduled = []
  const cleared = []
  const notifications = []
  let nextTimerId = 1

  class NotificationMock {
    constructor(options) {
      this.options = options
      this.handlers = new Map()
      notifications.push(this)
    }

    on(event, handler) {
      this.handlers.set(event, handler)
    }

    show() {
      this.shown = true
    }

    click() {
      this.handlers.get('click')?.()
    }
  }

  const service = new CalendarReminderService({
    now: () => now,
    setTimeout(handler, delay) {
      const timer = { id: nextTimerId++, handler, delay }
      scheduled.push(timer)
      return timer
    },
    clearTimeout(timer) {
      cleared.push(timer)
    },
    Notification: NotificationMock,
    openCalendar: () => {
      service.openedCalendar = true
    },
    logger: {
      error() {}
    }
  })

  return { service, scheduled, cleared, notifications }
}

test('syncEvents schedules future reminders at the default lead time', () => {
  const { service, scheduled } = createHarness()

  const result = service.syncEvents([createEvent()])

  assert.equal(result.success, true)
  assert.equal(scheduled.length, 1)
  assert.equal(scheduled[0].delay, 25 * 60 * 1000)
})

test('syncEvents fires soon-starting future reminders immediately', () => {
  const { service, scheduled, notifications } = createHarness()

  service.syncEvents([createEvent({ start: '09:00' })])
  scheduled[0].handler()

  assert.equal(scheduled[0].delay, 0)
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].shown, true)
  assert.equal(notifications[0].options.title, '设计评审')
})

test('syncEvents does not schedule past events or duplicate fired reminders', () => {
  const { service, scheduled, notifications } = createHarness()

  service.syncEvents([createEvent({ start: '09:00' })])
  scheduled[0].handler()
  service.syncEvents([createEvent({ start: '09:00' })])

  assert.equal(notifications.length, 1)
  assert.equal(scheduled.length, 1)
})

test('syncEvents clears stale timers when events are removed or moved', () => {
  const { service, scheduled, cleared } = createHarness()

  service.syncEvents([createEvent()])
  service.syncEvents([createEvent({ start: '10:30' })])
  service.syncEvents([])

  assert.equal(scheduled.length, 2)
  assert.equal(cleared.length, 2)
})

test('notification click opens the full calendar', () => {
  const { service, scheduled, notifications } = createHarness()

  service.syncEvents([createEvent({ start: '09:00' })])
  scheduled[0].handler()
  notifications[0].click()

  assert.equal(service.openedCalendar, true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- --test-name-pattern "syncEvents schedules future reminders|notification click opens the full calendar"
```

Expected: FAIL because `CalendarReminderService.ts` does not exist.

- [ ] **Step 3: Add the reminder service implementation**

Create `src/main/services/CalendarReminderService.ts`:

```ts
import { EventEmitter } from 'events'
import { Notification } from 'electron'
import type { IpcResponse } from '../../shared/types'
import {
  CalendarEvent,
  DEFAULT_CALENDAR_REMINDER_LEAD_MINUTES,
  createCalendarReminderKey,
  getCalendarReminderDelay,
  normalizeCalendarEvents,
  sortCalendarEvents
} from '../../shared/calendar'
import { logger as defaultLogger } from '../utils/logger'

type TimerHandle = ReturnType<typeof setTimeout>

type CalendarReminderDependencies = {
  now?: () => number
  setTimeout?: typeof setTimeout
  clearTimeout?: typeof clearTimeout
  Notification?: typeof Notification
  openCalendar?: () => void
  logger?: Pick<typeof defaultLogger, 'error'>
}

export class CalendarReminderService extends EventEmitter {
  private events: CalendarEvent[] = []
  private timers = new Map<string, TimerHandle>()
  private firedKeys = new Set<string>()
  private readonly now: () => number
  private readonly scheduleTimeout: typeof setTimeout
  private readonly clearScheduledTimeout: typeof clearTimeout
  private readonly NotificationConstructor: typeof Notification
  private readonly openCalendar: () => void
  private readonly logger: Pick<typeof defaultLogger, 'error'>

  constructor(dependencies: CalendarReminderDependencies = {}) {
    super()
    this.now = dependencies.now ?? Date.now
    this.scheduleTimeout = dependencies.setTimeout ?? setTimeout
    this.clearScheduledTimeout = dependencies.clearTimeout ?? clearTimeout
    this.NotificationConstructor = dependencies.Notification ?? Notification
    this.openCalendar = dependencies.openCalendar ?? (() => undefined)
    this.logger = dependencies.logger ?? defaultLogger
  }

  setOpenCalendarHandler(handler: () => void): void {
    ;(this as { openCalendar: () => void }).openCalendar = handler
  }

  getEvents(): CalendarEvent[] {
    return sortCalendarEvents(this.events)
  }

  syncEvents(input: unknown, leadMinutes = DEFAULT_CALENDAR_REMINDER_LEAD_MINUTES): IpcResponse<CalendarEvent[]> {
    this.events = sortCalendarEvents(normalizeCalendarEvents(input))
    this.reschedule(leadMinutes)
    this.emit('events-changed', this.getEvents())
    return { success: true, data: this.getEvents() }
  }

  dispose(): void {
    this.timers.forEach((timer) => this.clearScheduledTimeout(timer))
    this.timers.clear()
  }

  private reschedule(leadMinutes: number): void {
    const nextKeys = new Set<string>()
    const now = this.now()

    this.events.forEach((event) => {
      const key = createCalendarReminderKey(event)
      const delay = getCalendarReminderDelay(event, now, leadMinutes)
      if (delay === null || this.firedKeys.has(key)) return
      nextKeys.add(key)

      if (this.timers.has(key)) return
      const timer = this.scheduleTimeout(() => {
        this.timers.delete(key)
        if (this.firedKeys.has(key)) return
        this.firedKeys.add(key)
        this.showNotification(event)
      }, delay)
      this.timers.set(key, timer)
    })

    this.timers.forEach((timer, key) => {
      if (nextKeys.has(key)) return
      this.clearScheduledTimeout(timer)
      this.timers.delete(key)
    })
  }

  private showNotification(event: CalendarEvent): void {
    try {
      const bodyParts = [`${event.date} ${event.start} - ${event.end}`]
      if (event.location.trim()) {
        bodyParts.push(event.location.trim())
      }
      const notification = new this.NotificationConstructor({
        title: event.title,
        body: bodyParts.join(' | '),
        silent: false
      })
      notification.on('click', () => {
        this.openCalendar()
      })
      notification.show()
    } catch (error) {
      this.logger.error('Calendar reminder notification failed', error)
    }
  }
}

export const calendarReminderService = new CalendarReminderService()
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- --test-name-pattern "syncEvents schedules future reminders|syncEvents fires soon-starting future reminders|syncEvents does not schedule past events|syncEvents clears stale timers|notification click opens the full calendar"
```

Expected: PASS for all reminder service tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/CalendarReminderService.ts src/main/services/CalendarReminderService.test.cjs
git commit -m "feat: add calendar reminder scheduler"
```

## Task 3: Desktop Calendar Window And Calendar IPC

**Files:**
- Modify: `src/main/services/WindowManagerService.ts`
- Modify: `src/main/services/WindowManagerService.test.cjs`
- Create: `src/main/ipc/calendarIpc.ts`
- Modify: `src/main/bootstrap/registerIpc.ts`
- Modify: `src/main/bootstrap/registerIpc.test.cjs`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Write the failing window and IPC tests**

Add to `src/main/services/WindowManagerService.test.cjs`:

```js
test('createCalendarWidgetWindow creates a transparent desktop widget window on the calendar widget route', () => {
  const settingsUpdates = []
  const { WindowManagerService, browserWindowInstances } = loadWindowManagerServiceModule({
    settingsService: {
      getSettings: () => ({
        calendarWidgetEnabled: false,
        calendarWidgetBounds: null
      }),
      updateSettings: (updates) => {
        settingsUpdates.push(updates)
        return Promise.resolve({ success: true })
      }
    }
  })
  const service = new WindowManagerService()

  const result = service.showCalendarWidgetWindow()

  assert.equal(result.success, true)
  assert.equal(browserWindowInstances.length, 1)
  assert.equal(browserWindowInstances[0].options.width, 360)
  assert.equal(browserWindowInstances[0].options.height, 520)
  assert.equal(browserWindowInstances[0].options.frame, false)
  assert.equal(browserWindowInstances[0].options.transparent, true)
  assert.equal(browserWindowInstances[0].options.skipTaskbar, true)
  assert.equal(browserWindowInstances[0].options.webPreferences.contextIsolation, true)
  assert.equal(browserWindowInstances[0].loadedFiles[0].options.hash, '/calendar-widget')
  assert.deepEqual(settingsUpdates.at(-1), { calendarWidgetEnabled: true })
})

test('calendar widget window persists moved bounds and reports visibility state', () => {
  const settingsUpdates = []
  const { WindowManagerService, browserWindowInstances } = loadWindowManagerServiceModule({
    settingsService: {
      getSettings: () => ({
        calendarWidgetEnabled: true,
        calendarWidgetBounds: { x: 1400, y: 220, width: 360, height: 520 }
      }),
      updateSettings: (updates) => {
        settingsUpdates.push(updates)
        return Promise.resolve({ success: true })
      }
    }
  })
  const service = new WindowManagerService()

  service.showCalendarWidgetWindow()
  browserWindowInstances[0].setBounds({ x: 1320, y: 180, width: 360, height: 520 })
  browserWindowInstances[0].emit('moved')
  const state = service.getCalendarWidgetState()
  service.hideCalendarWidgetWindow()

  assert.equal(state.success, true)
  assert.equal(state.data.exists, true)
  assert.equal(state.data.enabled, true)
  assert.deepEqual(settingsUpdates.find((update) => update.calendarWidgetBounds), {
    calendarWidgetBounds: { x: 1320, y: 180, width: 360, height: 520 }
  })
  assert.deepEqual(settingsUpdates.at(-1), { calendarWidgetEnabled: false })
})
```

Update the `loadWindowManagerServiceModule` helper in `WindowManagerService.test.cjs` to accept a `settingsService` override and resolve `./SettingsService`:

```js
if (specifier === './SettingsService') {
  return {
    settingsService: overrides.settingsService ?? {
      getSettings: () => ({
        calendarWidgetEnabled: false,
        calendarWidgetBounds: null
      }),
      updateSettings: () => Promise.resolve({ success: true })
    }
  }
}
```

Add to `src/main/bootstrap/registerIpc.test.cjs` registrars:

```js
registerCalendarIpc: (getMainWindow) => calls.push(['registerCalendarIpc', getMainWindow()]),
```

And include it in the expected window-aware calls:

```js
['registerCalendarIpc', 'main-window'],
```

Create `src/main/ipc/calendarIpc.test.cjs` with the same module-loading style as `createElectronBridge.test.cjs` and assert registered channels:

```js
test('registerCalendarIpc wires calendar sync and widget channels', () => {
  const registeredHandle = []
  const sent = []
  const mocks = {
    electron: {
      ipcMain: {
        handle(channel, handler) {
          registeredHandle.push([channel, handler])
        }
      }
    },
    calendarReminderServiceModule: {
      calendarReminderService: {
        setOpenCalendarHandler() {},
        syncEvents: () => ({ success: true, data: [] }),
        getEvents: () => [],
        on() {}
      }
    },
    windowManagerServiceModule: {
      windowManagerService: {
        showCalendarWidgetWindow: () => ({ success: true }),
        hideCalendarWidgetWindow: () => ({ success: true }),
        toggleCalendarWidgetWindow: () => ({ success: true }),
        getCalendarWidgetState: () => ({ success: true, data: { exists: false, visible: false, enabled: false, bounds: null } }),
        getCalendarWidgetWindow: () => null
      }
    }
  }

  const { registerCalendarIpc } = loadCalendarIpcModule(mocks)
  registerCalendarIpc(() => ({
    isDestroyed: () => false,
    show: () => sent.push('show'),
    focus: () => sent.push('focus'),
    webContents: { send: (...args) => sent.push(args) }
  }))

  assert.deepEqual(registeredHandle.map(([channel]) => channel), [
    'calendar-sync-events',
    'calendar-get-events',
    'calendar-open-widget',
    'calendar-close-widget',
    'calendar-toggle-widget',
    'calendar-get-widget-state',
    'calendar-open-full'
  ])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- --test-name-pattern "createCalendarWidgetWindow|calendar widget window persists|registerCalendarIpc|registerIpc registers both plain"
```

Expected: FAIL because calendar widget window methods and calendar IPC registration do not exist.

- [ ] **Step 3: Add window manager and IPC implementation**

Modify `src/main/services/WindowManagerService.ts` imports:

```ts
import { settingsService } from './SettingsService'
import type { CalendarWidgetBounds, CalendarWidgetState } from '../../shared/calendar'
```

Add fields:

```ts
  private calendarWidgetWindow: BrowserWindow | null = null
  private readonly calendarWidgetDefaultBounds = { width: 360, height: 520 }
```

Add methods:

```ts
  getCalendarWidgetWindow() {
    return this.calendarWidgetWindow
  }

  private getDefaultCalendarWidgetBounds(): CalendarWidgetBounds {
    const saved = settingsService.getSettings().calendarWidgetBounds
    if (saved) return saved
    const { x, y, width, height } = screen.getPrimaryDisplay().workArea
    return {
      x: Math.round(x + width - this.calendarWidgetDefaultBounds.width - 28),
      y: Math.round(y + Math.max(28, (height - this.calendarWidgetDefaultBounds.height) / 2)),
      width: this.calendarWidgetDefaultBounds.width,
      height: this.calendarWidgetDefaultBounds.height
    }
  }

  private persistCalendarWidgetBounds() {
    if (!this.calendarWidgetWindow || this.calendarWidgetWindow.isDestroyed()) return
    void settingsService.updateSettings({
      calendarWidgetBounds: this.calendarWidgetWindow.getBounds()
    })
  }

  private broadcastCalendarWidgetState() {
    const state = this.getCalendarWidgetState()
    ;[this.mainWindow, this.calendarWidgetWindow].forEach((target) => {
      if (!target || target.isDestroyed()) return
      target.webContents.send('calendar-widget-state-changed', state.data)
    })
  }

  createCalendarWidgetWindow(): BrowserWindow | null {
    if (this.calendarWidgetWindow && !this.calendarWidgetWindow.isDestroyed()) return this.calendarWidgetWindow
    const bounds = this.getDefaultCalendarWidgetBounds()

    this.calendarWidgetWindow = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: true,
      webPreferences: createIsolatedPreloadWebPreferences(join(__dirname, '../preload/index.js'))
    })

    this.calendarWidgetWindow.setAlwaysOnTop(true, 'floating')

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.calendarWidgetWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/calendar-widget`)
    } else {
      this.calendarWidgetWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: '/calendar-widget'
      })
    }

    this.calendarWidgetWindow.on('moved', () => this.persistCalendarWidgetBounds())
    this.calendarWidgetWindow.on('closed', () => {
      this.calendarWidgetWindow = null
      this.broadcastCalendarWidgetState()
    })

    return this.calendarWidgetWindow
  }

  showCalendarWidgetWindow(): IpcResponse<CalendarWidgetState> {
    const widget = this.createCalendarWidgetWindow()
    if (!widget || widget.isDestroyed()) return { success: false, error: '桌面日历窗口不存在' }
    widget.showInactive()
    widget.moveTop()
    void settingsService.updateSettings({ calendarWidgetEnabled: true })
    this.broadcastCalendarWidgetState()
    return this.getCalendarWidgetState()
  }

  hideCalendarWidgetWindow(): IpcResponse<CalendarWidgetState> {
    if (this.calendarWidgetWindow && !this.calendarWidgetWindow.isDestroyed()) {
      this.calendarWidgetWindow.hide()
    }
    void settingsService.updateSettings({ calendarWidgetEnabled: false })
    this.broadcastCalendarWidgetState()
    return this.getCalendarWidgetState()
  }

  toggleCalendarWidgetWindow(): IpcResponse<CalendarWidgetState> {
    const visible = Boolean(this.calendarWidgetWindow && !this.calendarWidgetWindow.isDestroyed() && this.calendarWidgetWindow.isVisible())
    return visible ? this.hideCalendarWidgetWindow() : this.showCalendarWidgetWindow()
  }

  getCalendarWidgetState(): IpcResponse<CalendarWidgetState> {
    const exists = Boolean(this.calendarWidgetWindow && !this.calendarWidgetWindow.isDestroyed())
    const visible = Boolean(exists && this.calendarWidgetWindow?.isVisible())
    return {
      success: true,
      data: {
        exists,
        visible,
        enabled: settingsService.getSettings().calendarWidgetEnabled,
        bounds: exists ? this.calendarWidgetWindow!.getBounds() : settingsService.getSettings().calendarWidgetBounds
      }
    }
  }
```

Create `src/main/ipc/calendarIpc.ts`:

```ts
import { BrowserWindow, ipcMain } from 'electron'
import { calendarReminderService } from '../services/CalendarReminderService'
import { windowManagerService } from '../services/WindowManagerService'

function sendToWindow(window: BrowserWindow | null, channel: string, payload: unknown) {
  if (!window || window.isDestroyed()) return
  window.webContents.send(channel, payload)
}

function openFullCalendar(getMainWindow: () => BrowserWindow | null) {
  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('open-tool', 'calendar')
  }
}

export function registerCalendarIpc(getMainWindow: () => BrowserWindow | null) {
  calendarReminderService.setOpenCalendarHandler(() => openFullCalendar(getMainWindow))
  calendarReminderService.on('events-changed', (events) => {
    sendToWindow(getMainWindow(), 'calendar-events-changed', events)
    sendToWindow(windowManagerService.getCalendarWidgetWindow(), 'calendar-events-changed', events)
  })

  ipcMain.handle('calendar-sync-events', (_event, events) => {
    return calendarReminderService.syncEvents(events)
  })

  ipcMain.handle('calendar-get-events', () => {
    return { success: true, data: calendarReminderService.getEvents() }
  })

  ipcMain.handle('calendar-open-widget', () => windowManagerService.showCalendarWidgetWindow())
  ipcMain.handle('calendar-close-widget', () => windowManagerService.hideCalendarWidgetWindow())
  ipcMain.handle('calendar-toggle-widget', () => windowManagerService.toggleCalendarWidgetWindow())
  ipcMain.handle('calendar-get-widget-state', () => windowManagerService.getCalendarWidgetState())
  ipcMain.handle('calendar-open-full', () => {
    openFullCalendar(getMainWindow)
    return { success: true }
  })
}
```

Modify `src/main/bootstrap/registerIpc.ts`:

```ts
  registerCalendarIpc(getMainWindow: () => BrowserWindow | null): void
```

and call it after `registerFloatBallIpc()`:

```ts
  registrars.registerCalendarIpc(mainWindowProvider)
```

Modify `src/main/index.ts`:

```ts
import { registerCalendarIpc } from './ipc/calendarIpc'
```

and include it in `registerMainProcessIpc` registrars:

```ts
    registerCalendarIpc,
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- --test-name-pattern "createCalendarWidgetWindow|calendar widget window persists|registerCalendarIpc|registerIpc registers both plain"
```

Expected: PASS for widget window and calendar IPC registration tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/WindowManagerService.ts src/main/services/WindowManagerService.test.cjs src/main/ipc/calendarIpc.ts src/main/ipc/calendarIpc.test.cjs src/main/bootstrap/registerIpc.ts src/main/bootstrap/registerIpc.test.cjs src/main/index.ts
git commit -m "feat: add desktop calendar window ipc"
```

## Task 4: Preload Calendar API And Widget Route

**Files:**
- Modify: `src/preload/createElectronBridge.ts`
- Modify: `src/preload/createElectronBridge.test.cjs`
- Modify: `src/renderer/src/types/electron.d.ts`
- Modify: `src/renderer/src/bootstrapRoute.ts`
- Modify: `src/renderer/src/bootstrapRoute.test.cjs`
- Modify: `src/renderer/src/main.tsx`

- [ ] **Step 1: Write the failing preload and route tests**

Add to `src/preload/createElectronBridge.test.cjs`:

```js
test('createElectronBridge exposes calendar widget and sync APIs', async () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  let events = null
  let widgetState = null
  const unsubscribeEvents = bridge.calendar.onEventsChanged((nextEvents) => {
    events = nextEvents
  })
  const unsubscribeWidgetState = bridge.calendar.onWidgetStateChanged((nextState) => {
    widgetState = nextState
  })

  await bridge.calendar.syncEvents([{ id: 'event-1' }])
  await bridge.calendar.getEvents()
  await bridge.calendar.openWidget()
  await bridge.calendar.closeWidget()
  await bridge.calendar.toggleWidget()
  await bridge.calendar.getWidgetState()
  await bridge.calendar.openFull()

  mocks.listeners.get('calendar-events-changed')({}, [{ id: 'event-1' }])
  mocks.listeners.get('calendar-widget-state-changed')({}, { visible: true })

  assert.deepEqual(events, [{ id: 'event-1' }])
  assert.deepEqual(widgetState, { visible: true })
  assert.deepEqual(mocks.invokeCalls, [
    ['calendar-sync-events', [{ id: 'event-1' }]],
    ['calendar-get-events'],
    ['calendar-open-widget'],
    ['calendar-close-widget'],
    ['calendar-toggle-widget'],
    ['calendar-get-widget-state'],
    ['calendar-open-full']
  ])

  unsubscribeEvents()
  unsubscribeWidgetState()
  assert.equal(mocks.removed.at(-2)[0], 'calendar-events-changed')
  assert.equal(mocks.removed.at(-1)[0], 'calendar-widget-state-changed')
})
```

Add to `src/renderer/src/bootstrapRoute.test.cjs`:

```js
test('resolveBootstrapRoute detects calendar widget routes as a lightweight entry', () => {
  const { resolveBootstrapRoute } = loadBootstrapRouteModule()
  assert.equal(resolveBootstrapRoute('#/calendar-widget'), 'calendar-widget')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- --test-name-pattern "calendar widget and sync APIs|calendar widget routes"
```

Expected: FAIL because the preload bridge and bootstrap route do not expose calendar widget behavior.

- [ ] **Step 3: Add preload API, route type, and renderer bootstrap**

Modify `src/preload/createElectronBridge.ts`:

```ts
  const calendarAPI = {
    syncEvents: (events: unknown[]) => ipcRenderer.invoke('calendar-sync-events', events),
    getEvents: () => ipcRenderer.invoke('calendar-get-events'),
    openWidget: () => ipcRenderer.invoke('calendar-open-widget'),
    closeWidget: () => ipcRenderer.invoke('calendar-close-widget'),
    toggleWidget: () => ipcRenderer.invoke('calendar-toggle-widget'),
    getWidgetState: () => ipcRenderer.invoke('calendar-get-widget-state'),
    openFull: () => ipcRenderer.invoke('calendar-open-full'),
    onEventsChanged: (callback: (events: unknown[]) => void) => onChannel('calendar-events-changed', callback),
    onWidgetStateChanged: (callback: (state: unknown) => void) => onChannel('calendar-widget-state-changed', callback)
  }
```

Add `calendar: calendarAPI` to the returned bridge object.

Modify `src/renderer/src/types/electron.d.ts` imports:

```ts
import type { CalendarEvent, CalendarWidgetState } from '../../../shared/calendar'
```

Add this API to `Window.electron`:

```ts
      calendar: {
        syncEvents: (events: CalendarEvent[]) => Promise<IpcResponse<CalendarEvent[]>>
        getEvents: () => Promise<IpcResponse<CalendarEvent[]>>
        openWidget: () => Promise<IpcResponse<CalendarWidgetState>>
        closeWidget: () => Promise<IpcResponse<CalendarWidgetState>>
        toggleWidget: () => Promise<IpcResponse<CalendarWidgetState>>
        getWidgetState: () => Promise<IpcResponse<CalendarWidgetState>>
        openFull: () => Promise<IpcResponse>
        onEventsChanged: (callback: (events: CalendarEvent[]) => void) => () => void
        onWidgetStateChanged: (callback: (state: CalendarWidgetState) => void) => () => void
      }
```

Modify `src/renderer/src/bootstrapRoute.ts`:

```ts
  | 'calendar-widget'
```

and add:

```ts
  if (normalizedHash.startsWith('#/calendar-widget')) {
    return 'calendar-widget'
  }
```

Modify `src/renderer/src/main.tsx` before the main app branch:

```tsx
  if (bootstrapRoute === 'calendar-widget') {
    applyTransparentWindowBackground()
    const module = await import('./tools/CalendarWidget')
    root.render(
      <React.StrictMode>
        <module.CalendarWidget />
      </React.StrictMode>
    )
    return
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- --test-name-pattern "calendar widget and sync APIs|calendar widget routes"
```

Expected: PASS for bridge and route tests.

- [ ] **Step 5: Commit**

```bash
git add src/preload/createElectronBridge.ts src/preload/createElectronBridge.test.cjs src/renderer/src/types/electron.d.ts src/renderer/src/bootstrapRoute.ts src/renderer/src/bootstrapRoute.test.cjs src/renderer/src/main.tsx
git commit -m "feat: expose calendar widget bridge"
```

## Task 5: Desktop Widget UI And Calendar Tool Integration

**Files:**
- Create: `src/renderer/src/tools/calendarWidgetData.ts`
- Create: `src/renderer/src/tools/calendarWidgetData.test.cjs`
- Create: `src/renderer/src/tools/CalendarWidget.tsx`
- Create: `src/renderer/src/tools/calendarWidget.test.cjs`
- Modify: `src/renderer/src/tools/CalendarTool.tsx`
- Modify: `src/renderer/src/tools/calendarOverlay.test.cjs`

- [ ] **Step 1: Write failing renderer data and source tests**

Create `src/renderer/src/tools/calendarWidgetData.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const Module = require('node:module')
const ts = require('typescript')

function loadCalendarWidgetDataModule() {
  const filePath = path.join(__dirname, 'calendarWidgetData.ts')
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
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === '../../../shared/calendar') {
      const sharedPath = path.join(__dirname, '..', '..', '..', 'shared', 'calendar.ts')
      const sharedSource = fs.readFileSync(sharedPath, 'utf8')
      const sharedTranspiled = ts.transpileModule(sharedSource, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          esModuleInterop: true
        },
        fileName: sharedPath
      }).outputText
      const sharedModule = { exports: {} }
      vm.runInNewContext(sharedTranspiled, {
        module: sharedModule,
        exports: sharedModule.exports,
        require,
        __dirname: path.dirname(sharedPath),
        __filename: sharedPath,
        console,
        process
      }, { filename: sharedPath })
      return sharedModule.exports
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    vm.runInNewContext(transpiled, {
      module,
      exports: module.exports,
      require,
      __dirname,
      __filename: filePath,
      console,
      process
    }, { filename: filePath })
  } finally {
    Module._load = originalLoad
  }

  return module.exports
}

function event(overrides) {
  return {
    id: 'event-1',
    title: '站会',
    date: '2026-04-27',
    start: '09:00',
    end: '09:30',
    calendar: '工作',
    color: '#38b887',
    location: '',
    participants: '',
    description: '',
    ...overrides
  }
}

test('createCalendarWidgetModel returns today events, next event, and marked days', () => {
  const { createCalendarWidgetModel } = loadCalendarWidgetDataModule()
  const model = createCalendarWidgetModel([
    event({ id: 'today-later', title: '设计评审', start: '15:00', end: '16:00' }),
    event({ id: 'tomorrow', title: '客户沟通', date: '2026-04-28', start: '10:00', end: '10:30' })
  ], new Date(2026, 3, 27, 9, 30, 0))

  assert.equal(model.todayDate, '2026-04-27')
  assert.equal(model.todayEvents.length, 1)
  assert.equal(model.nextEvent.id, 'today-later')
  assert.equal(model.markedDates.has('2026-04-28'), true)
  assert.equal(model.monthCells.length >= 35, true)
})
```

Create `src/renderer/src/tools/calendarWidget.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('CalendarWidget subscribes to calendar events and exposes desktop window actions', () => {
  const source = fs.readFileSync(path.join(__dirname, 'CalendarWidget.tsx'), 'utf8')

  assert.match(source, /calendar\.getEvents\(\)/)
  assert.match(source, /calendar\.onEventsChanged/)
  assert.match(source, /calendar\.openFull\(\)/)
  assert.match(source, /calendar\.closeWidget\(\)/)
  assert.match(source, /-webkit-app-region:drag/)
  assert.match(source, /-webkit-app-region:no-drag/)
  assert.match(source, /今日日程/)
  assert.match(source, /下一项/)
})
```

Add to `src/renderer/src/tools/calendarOverlay.test.cjs`:

```js
test('calendar syncs events to the main process and exposes the desktop widget toggle', () => {
  const source = readCalendarToolSource()

  assert.match(source, /window\.electron\?\.calendar\?\.syncEvents/)
  assert.match(source, /window\.electron\?\.calendar\?\.getWidgetState/)
  assert.match(source, /window\.electron\?\.calendar\?\.toggleWidget/)
  assert.match(source, /桌面日历/)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- --test-name-pattern "createCalendarWidgetModel|CalendarWidget subscribes|calendar syncs events"
```

Expected: FAIL because widget data helpers, widget component, and calendar tool integration do not exist.

- [ ] **Step 3: Add widget data helper, widget UI, and calendar tool hooks**

Create `src/renderer/src/tools/calendarWidgetData.ts`:

```ts
import {
  CalendarEvent,
  getCalendarEventStartTimestamp,
  normalizeCalendarEvents,
  sortCalendarEvents
} from '../../../shared/calendar'

export interface CalendarWidgetModel {
  todayDate: string
  monthTitle: string
  weekdayLabel: string
  todayEvents: CalendarEvent[]
  nextEvent: CalendarEvent | null
  markedDates: Set<string>
  monthCells: Array<{ key: string; date: string | null; day: number | null; inMonth: boolean; isToday: boolean }>
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function createCalendarWidgetModel(input: unknown, now = new Date()): CalendarWidgetModel {
  const events = sortCalendarEvents(normalizeCalendarEvents(input))
  const todayDate = formatDate(now)
  const month = now.getMonth()
  const year = now.getFullYear()
  const todayEvents = events.filter((event) => event.date === todayDate)
  const nowMs = now.getTime()
  const nextEvent = events.find((event) => {
    const startMs = getCalendarEventStartTimestamp(event)
    return Number.isFinite(startMs) && startMs > nowMs
  }) ?? null
  const markedDates = new Set(events.map((event) => event.date))
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthCells: CalendarWidgetModel['monthCells'] = []

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    monthCells.push({ key: `empty-${index}`, date: null, day: null, inMonth: false, isToday: false })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    monthCells.push({ key: date, date, day, inMonth: true, isToday: date === todayDate })
  }

  while (monthCells.length % 7 !== 0 || monthCells.length < 35) {
    monthCells.push({ key: `tail-${monthCells.length}`, date: null, day: null, inMonth: false, isToday: false })
  }

  return {
    todayDate,
    monthTitle: `${year}年${month + 1}月`,
    weekdayLabel: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()],
    todayEvents,
    nextEvent,
    markedDates,
    monthCells
  }
}
```

Create `src/renderer/src/tools/CalendarWidget.tsx`:

```tsx
import React, { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ExternalLink, X } from 'lucide-react'
import type { CalendarEvent } from '../../../shared/calendar'
import { cn } from '@/lib/utils'
import { createCalendarWidgetModel } from './calendarWidgetData'

export function CalendarWidget(): React.JSX.Element {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const model = useMemo(() => createCalendarWidgetModel(events), [events])

  useEffect(() => {
    let mounted = true
    void window.electron?.calendar?.getEvents().then((response) => {
      if (mounted && response.success && response.data) {
        setEvents(response.data)
      }
    })
    const unsubscribe = window.electron?.calendar?.onEventsChanged((nextEvents) => {
      setEvents(nextEvents)
    })
    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  const openFullCalendar = () => {
    void window.electron?.calendar?.openFull()
  }

  const closeWidget = () => {
    void window.electron?.calendar?.closeWidget()
  }

  return (
    <div className="h-screen w-screen bg-transparent p-3 text-white">
      <section className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-white/20 bg-slate-950/82 shadow-2xl shadow-slate-950/35 backdrop-blur-2xl">
        <header className="[-webkit-app-region:drag] flex items-start justify-between gap-3 border-b border-white/10 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-white/50">
              <CalendarDays size={15} />
              桌面日历
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight">{model.todayDate}</h1>
            <p className="mt-1 text-sm font-bold text-white/60">{model.weekdayLabel} · {model.monthTitle}</p>
          </div>
          <div className="[-webkit-app-region:no-drag] flex gap-2">
            <button type="button" onClick={openFullCalendar} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 transition hover:bg-white/15" aria-label="打开完整日历">
              <ExternalLink size={16} />
            </button>
            <button type="button" onClick={closeWidget} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 transition hover:bg-white/15" aria-label="关闭桌面日历">
              <X size={16} />
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto p-4">
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-black text-white/45">
            {['日', '一', '二', '三', '四', '五', '六'].map((label) => <span key={label}>{label}</span>)}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1.5">
            {model.monthCells.map((cell) => (
              <span
                key={cell.key}
                className={cn(
                  'relative grid h-8 place-items-center rounded-xl text-xs font-black',
                  cell.inMonth ? 'text-white/75' : 'text-transparent',
                  cell.isToday && 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                )}
              >
                {cell.day}
                {cell.date && model.markedDates.has(cell.date) && !cell.isToday && (
                  <span className="absolute bottom-1 h-1 w-1 rounded-full bg-blue-300" />
                )}
              </span>
            ))}
          </div>

          <section className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-black">下一项</h2>
            </div>
            {model.nextEvent ? (
              <button type="button" onClick={openFullCalendar} className="w-full rounded-2xl border border-white/10 bg-white/10 p-3 text-left transition hover:bg-white/15">
                <span className="block text-xs font-black text-white/50">{model.nextEvent.date} {model.nextEvent.start}</span>
                <span className="mt-1 block truncate text-base font-black">{model.nextEvent.title}</span>
                {model.nextEvent.location && <span className="mt-1 block truncate text-xs font-bold text-white/55">{model.nextEvent.location}</span>}
              </button>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/8 p-3 text-sm font-bold text-white/55">暂无即将开始的日程</div>
            )}
          </section>

          <section className="mt-5">
            <h2 className="mb-2 text-sm font-black">今日日程</h2>
            <div className="space-y-2">
              {model.todayEvents.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/8 p-3 text-sm font-bold text-white/55">今天还没有安排</div>
              )}
              {model.todayEvents.map((event) => (
                <button key={event.id} type="button" onClick={openFullCalendar} className="grid w-full grid-cols-[auto_1fr] gap-3 rounded-2xl border border-white/10 bg-white/10 p-3 text-left transition hover:bg-white/15">
                  <span className="h-10 w-1.5 rounded-full" style={{ backgroundColor: event.color }} />
                  <span className="min-w-0">
                    <span className="block text-xs font-black text-white/50">{event.start} - {event.end}</span>
                    <span className="mt-1 block truncate text-sm font-black">{event.title}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </main>
      </section>
    </div>
  )
}
```

Modify `src/renderer/src/tools/CalendarTool.tsx` imports:

```tsx
  MonitorUp,
```

Add state:

```tsx
  const [desktopCalendarVisible, setDesktopCalendarVisible] = useState(false)
```

Add effects after localStorage effects:

```tsx
  useEffect(() => {
    void window.electron?.calendar?.syncEvents?.(events)
  }, [events])

  useEffect(() => {
    let mounted = true
    void window.electron?.calendar?.getWidgetState?.().then((response) => {
      if (mounted && response.success && response.data) {
        setDesktopCalendarVisible(response.data.visible || response.data.enabled)
      }
    })
    const unsubscribe = window.electron?.calendar?.onWidgetStateChanged?.((state) => {
      setDesktopCalendarVisible(state.visible || state.enabled)
    })
    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])
```

Add a toggle handler:

```tsx
  const toggleDesktopCalendar = async () => {
    const response = await window.electron?.calendar?.toggleWidget?.()
    if (!response?.success) {
      showToast(response?.error ?? '桌面日历暂时无法打开')
      return
    }
    setDesktopCalendarVisible(Boolean(response.data?.visible || response.data?.enabled))
    showToast(response.data?.visible || response.data?.enabled ? '桌面日历已打开' : '桌面日历已关闭')
  }
```

Add the button near the existing view controls:

```tsx
                <button
                  type="button"
                  onClick={toggleDesktopCalendar}
                  className={cn(
                    'flex h-12 items-center justify-center gap-2 rounded-2xl px-4 font-black transition',
                    desktopCalendarVisible ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-white/15 text-white/70 hover:bg-white/20'
                  )}
                >
                  <MonitorUp size={18} />
                  桌面日历
                </button>
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- --test-name-pattern "createCalendarWidgetModel|CalendarWidget subscribes|calendar syncs events"
```

Expected: PASS for widget model, widget source, and calendar tool source tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/tools/calendarWidgetData.ts src/renderer/src/tools/calendarWidgetData.test.cjs src/renderer/src/tools/CalendarWidget.tsx src/renderer/src/tools/calendarWidget.test.cjs src/renderer/src/tools/CalendarTool.tsx src/renderer/src/tools/calendarOverlay.test.cjs
git commit -m "feat: add desktop calendar widget ui"
```

## Task 6: Startup Restore And Full Verification

**Files:**
- Modify: `src/main/bootstrap/runtimeBootstrap.ts`
- Modify: `src/main/bootstrap/runtimeBootstrap.test.cjs`
- Modify: `src/main/index.ts`
- Optional modify: `README.md`

- [ ] **Step 1: Write the failing startup restore test**

Add to `src/main/bootstrap/runtimeBootstrap.test.cjs`:

```js
test('initializeMainRuntime restores the desktop calendar widget when enabled in settings', async () => {
  const { initializeMainRuntime } = loadRuntimeBootstrapModule()
  const calls = []

  await initializeMainRuntime({
    settingsService: {
      getSettings: () => ({
        minimizeToTray: true,
        autoCheckForUpdates: false,
        calendarWidgetEnabled: true
      }),
      updateSettings: async () => ({ success: true }),
      on() {}
    },
    downloadOrganizerService: { ensureWatchStateFromConfig: () => calls.push('download-organizer') },
    windowManagerService: {
      setTrayEnabled: () => calls.push('tray'),
      showCalendarWidgetWindow: () => calls.push('calendar-widget')
    },
    appUpdateService: { checkForUpdates: () => calls.push('updates') },
    autoClickerService: { updateShortcut: () => calls.push('autoclicker') },
    hotkeyService: {
      registerClipboardHotkey: () => calls.push('clipboard-hotkey'),
      registerFloatBallHotkey: () => calls.push('floatball-hotkey'),
      registerScreenshotHotkey: () => calls.push('screenshot-hotkey')
    },
    registerAutoUpdateSettingsChangeHandler: () => calls.push('updates-settings'),
    createBeforeQuitAndInstallHook: () => () => undefined,
    runtime: {
      platform: 'win32',
      isPackaged: false,
      isDevelopment: true,
      isPortableWindowsRuntime: false
    }
  })

  assert.equal(calls.includes('calendar-widget'), true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --test-name-pattern "restores the desktop calendar widget"
```

Expected: FAIL because startup restore does not call `showCalendarWidgetWindow`.

- [ ] **Step 3: Add startup restore**

Modify `src/main/bootstrap/runtimeBootstrap.ts` input type for `windowManagerService`:

```ts
    showCalendarWidgetWindow?(): unknown
```

Add after tray setup:

```ts
  if (settingsService.getSettings().calendarWidgetEnabled) {
    windowManagerService.showCalendarWidgetWindow?.()
  }
```

Ensure `src/main/index.ts` already passes `windowManagerService` into `initializeMainRuntime`.

- [ ] **Step 4: Run focused tests and type checks**

Run:

```bash
npm test -- --test-name-pattern "restores the desktop calendar widget|calendar widget|calendar reminder|calendar syncs events|calendar widget and sync APIs|createCalendarWidgetWindow"
npm run typecheck:node
npm run typecheck:web
```

Expected: all focused tests pass and both typecheck commands exit 0.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm test
npm run typecheck
```

Expected: the full test suite passes and both node/web TypeScript projects typecheck.

- [ ] **Step 6: Commit**

```bash
git add src/main/bootstrap/runtimeBootstrap.ts src/main/bootstrap/runtimeBootstrap.test.cjs src/main/index.ts
git commit -m "feat: restore desktop calendar widget on startup"
```

## Self-Review Checklist

- Spec coverage:
  - Desktop widget window: Tasks 3, 4, 5, 6.
  - Open/close/toggle from main calendar: Tasks 4 and 5.
  - Persistent visibility and position: Tasks 1, 3, 6.
  - Compact widget with today, month, today events, next event: Task 5.
  - Renderer-to-main event sync: Tasks 2, 3, 4, 5.
  - Windows native notifications: Task 2.
  - Notification click opens full calendar: Tasks 2 and 3.
  - OneTool-running limitation remains documented in the approved design and does not require implementation.
- Completeness scan:
  - This plan contains no unresolved markers or deferred implementation notes.
  - Optional README update is explicitly optional and not required for feature completion.
- Type consistency:
  - Calendar event type is `CalendarEvent`.
  - Widget state type is `CalendarWidgetState`.
  - Preload API namespace is `window.electron.calendar`.
  - IPC channels use the `calendar-*` prefix.
