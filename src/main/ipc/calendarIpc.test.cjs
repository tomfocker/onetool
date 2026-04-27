const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

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
    Buffer
  }, { filename: filePath })

  return module.exports
}

function loadCalendarModule() {
  return transpileModule(path.join(__dirname, '..', '..', 'shared', 'calendar.ts'))
}

function loadCalendarIpcModule(overrides = {}) {
  const handlers = {}
  const calendarModule = loadCalendarModule()
  const windowManagerService = overrides.windowManagerService || {
    getCalendarWidgetState: () => ({ success: true, data: { exists: false, visible: false, enabled: false, alwaysOnTop: false, backgroundMode: 'solid', glassOpacity: 60, glassBlur: 32, bounds: null } }),
    showCalendarWidgetWindow: () => ({ success: true, data: { exists: true, visible: true, enabled: true, alwaysOnTop: false, backgroundMode: 'solid', glassOpacity: 60, glassBlur: 32, bounds: null } }),
    hideCalendarWidgetWindow: () => ({ success: true, data: { exists: true, visible: false, enabled: false, alwaysOnTop: false, backgroundMode: 'solid', glassOpacity: 60, glassBlur: 32, bounds: null } }),
    toggleCalendarWidgetWindow: () => ({ success: true, data: { exists: true, visible: true, enabled: true, alwaysOnTop: false, backgroundMode: 'solid', glassOpacity: 60, glassBlur: 32, bounds: null } }),
    setCalendarWidgetBounds: (bounds) => ({ success: true, data: { exists: true, visible: true, enabled: true, alwaysOnTop: false, backgroundMode: 'solid', glassOpacity: 60, glassBlur: 32, bounds } }),
    setCalendarWidgetAlwaysOnTop: (alwaysOnTop) => ({ success: true, data: { exists: true, visible: true, enabled: true, alwaysOnTop, backgroundMode: 'solid', glassOpacity: 60, glassBlur: 32, bounds: null } }),
    setCalendarWidgetBackgroundMode: (backgroundMode) => ({ success: true, data: { exists: true, visible: true, enabled: true, alwaysOnTop: false, backgroundMode, glassOpacity: 60, glassBlur: 32, bounds: null } }),
    setCalendarWidgetGlassSettings: (settings) => ({ success: true, data: { exists: true, visible: true, enabled: true, alwaysOnTop: false, backgroundMode: 'glass', glassOpacity: settings.opacity, glassBlur: settings.blur, bounds: null } }),
    broadcastCalendarEvents: () => undefined
  }
  const calendarReminderService = overrides.calendarReminderService || {
    replaceEvents: () => undefined
  }

  const exports = transpileModule(path.join(__dirname, 'calendarIpc.ts'), (specifier) => {
    if (specifier === 'electron') {
      return {
        ipcMain: {
          handle(channel, handler) {
            handlers[channel] = handler
          }
        }
      }
    }
    if (specifier === '../services/WindowManagerService') {
      return { windowManagerService }
    }
    if (specifier === '../services/CalendarReminderService') {
      return { calendarReminderService }
    }
    if (specifier === '../../shared/calendar') {
      return calendarModule
    }
    return require(specifier)
  })

  return { ...exports, handlers, windowManagerService, calendarReminderService }
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
    location: '',
    participants: '',
    description: '',
    ...overrides
  }
}

test('registerCalendarIpc wires desktop calendar widget handlers', async () => {
  const calls = []
  const { registerCalendarIpc, handlers } = loadCalendarIpcModule({
    windowManagerService: {
      getCalendarWidgetState: () => {
        calls.push(['state'])
        return { success: true, data: { exists: false, visible: false, enabled: false, alwaysOnTop: false, backgroundMode: 'solid', glassOpacity: 60, glassBlur: 32, bounds: null } }
      },
      showCalendarWidgetWindow: () => {
        calls.push(['show'])
        return { success: true, data: { exists: true, visible: true, enabled: true, alwaysOnTop: false, backgroundMode: 'solid', glassOpacity: 60, glassBlur: 32, bounds: null } }
      },
      hideCalendarWidgetWindow: () => {
        calls.push(['hide'])
        return { success: true, data: { exists: true, visible: false, enabled: false, alwaysOnTop: false, backgroundMode: 'solid', glassOpacity: 60, glassBlur: 32, bounds: null } }
      },
      toggleCalendarWidgetWindow: () => {
        calls.push(['toggle'])
        return { success: true, data: { exists: true, visible: true, enabled: true, alwaysOnTop: false, backgroundMode: 'solid', glassOpacity: 60, glassBlur: 32, bounds: null } }
      },
      setCalendarWidgetBounds: (bounds) => {
        calls.push(['bounds', bounds])
        return { success: true, data: { exists: true, visible: true, enabled: true, alwaysOnTop: false, backgroundMode: 'solid', glassOpacity: 60, glassBlur: 32, bounds } }
      },
      setCalendarWidgetAlwaysOnTop: (alwaysOnTop) => {
        calls.push(['alwaysOnTop', alwaysOnTop])
        return { success: true, data: { exists: true, visible: true, enabled: true, alwaysOnTop, backgroundMode: 'solid', glassOpacity: 60, glassBlur: 32, bounds: null } }
      },
      setCalendarWidgetBackgroundMode: (backgroundMode) => {
        calls.push(['backgroundMode', backgroundMode])
        return { success: true, data: { exists: true, visible: true, enabled: true, alwaysOnTop: false, backgroundMode, glassOpacity: 60, glassBlur: 32, bounds: null } }
      },
      setCalendarWidgetGlassSettings: (settings) => {
        calls.push(['glassSettings', settings])
        return { success: true, data: { exists: true, visible: true, enabled: true, alwaysOnTop: false, backgroundMode: 'glass', glassOpacity: settings.opacity, glassBlur: settings.blur, bounds: null } }
      },
      broadcastCalendarEvents: () => undefined
    }
  })

  registerCalendarIpc(() => null)

  assert.equal((await handlers['calendar-widget-get-state']()).success, true)
  assert.equal((await handlers['calendar-widget-show']()).data.visible, true)
  assert.equal((await handlers['calendar-widget-hide']()).data.visible, false)
  assert.equal((await handlers['calendar-widget-toggle']()).data.visible, true)
  await handlers['calendar-widget-set-bounds']({}, { x: 12, y: 24, width: 320, height: 420 })
  assert.equal((await handlers['calendar-widget-set-always-on-top']({}, true)).data.alwaysOnTop, true)
  assert.equal((await handlers['calendar-widget-set-background-mode']({}, 'glass')).data.backgroundMode, 'glass')
  assert.equal((await handlers['calendar-widget-set-glass-settings']({}, { opacity: 66, blur: 40 })).data.glassBlur, 40)

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['state'],
    ['show'],
    ['hide'],
    ['toggle'],
    ['bounds', { x: 12, y: 24, width: 320, height: 420 }],
    ['alwaysOnTop', true],
    ['backgroundMode', 'glass'],
    ['glassSettings', { opacity: 66, blur: 40 }]
  ])
})

test('registerCalendarIpc normalizes calendar events for reminders and widget broadcasts', async () => {
  const reminderEvents = []
  const broadcastEvents = []
  const { registerCalendarIpc, handlers } = loadCalendarIpcModule({
    calendarReminderService: {
      replaceEvents(events) {
        reminderEvents.push(events)
      }
    },
    windowManagerService: {
      getCalendarWidgetState: () => ({ success: true, data: { exists: false, visible: false, enabled: false, alwaysOnTop: false, backgroundMode: 'solid', glassOpacity: 60, glassBlur: 32, bounds: null } }),
      showCalendarWidgetWindow: () => ({ success: true, data: { exists: true, visible: true, enabled: true, alwaysOnTop: false, backgroundMode: 'solid', glassOpacity: 60, glassBlur: 32, bounds: null } }),
      hideCalendarWidgetWindow: () => ({ success: true, data: { exists: true, visible: false, enabled: false, alwaysOnTop: false, backgroundMode: 'solid', glassOpacity: 60, glassBlur: 32, bounds: null } }),
      toggleCalendarWidgetWindow: () => ({ success: true, data: { exists: true, visible: true, enabled: true, alwaysOnTop: false, backgroundMode: 'solid', glassOpacity: 60, glassBlur: 32, bounds: null } }),
      setCalendarWidgetBounds: (bounds) => ({ success: true, data: { exists: true, visible: true, enabled: true, alwaysOnTop: false, backgroundMode: 'solid', glassOpacity: 60, glassBlur: 32, bounds } }),
      setCalendarWidgetAlwaysOnTop: (alwaysOnTop) => ({ success: true, data: { exists: true, visible: true, enabled: true, alwaysOnTop, backgroundMode: 'solid', glassOpacity: 60, glassBlur: 32, bounds: null } }),
      setCalendarWidgetBackgroundMode: (backgroundMode) => ({ success: true, data: { exists: true, visible: true, enabled: true, alwaysOnTop: false, backgroundMode, glassOpacity: 60, glassBlur: 32, bounds: null } }),
      setCalendarWidgetGlassSettings: (settings) => ({ success: true, data: { exists: true, visible: true, enabled: true, alwaysOnTop: false, backgroundMode: 'glass', glassOpacity: settings.opacity, glassBlur: settings.blur, bounds: null } }),
      broadcastCalendarEvents(events) {
        broadcastEvents.push(events)
      }
    }
  })

  registerCalendarIpc(() => null)
  const result = await handlers['calendar-events-replace']({}, [
    createEvent(),
    { id: 'broken', title: 'missing fields' }
  ])

  assert.equal(result.success, true)
  assert.equal(result.data.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(reminderEvents[0])), [createEvent()])
  assert.deepEqual(JSON.parse(JSON.stringify(broadcastEvents[0])), [createEvent()])
})
