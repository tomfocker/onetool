const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadTypeScriptModule(fileName, resolver = require) {
  const filePath = path.join(__dirname, fileName)
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
    require: resolver,
    __dirname,
    __filename: filePath,
    console,
    process
  }, { filename: filePath })

  return module.exports
}

function loadCalendarNativeSyncModule() {
  const calendarStorage = loadTypeScriptModule('calendarStorage.ts')
  return loadTypeScriptModule('calendarNativeSync.ts', (request) => {
    if (request === './calendarStorage') return calendarStorage
    return require(request)
  })
}

const storedEvent = {
  id: 'event-1',
  title: '客户电话',
  date: '2026-04-27',
  start: '10:00',
  end: '10:30',
  calendar: '工作',
  color: '#38b887',
  location: '',
  participants: '',
  description: ''
}

test('syncStoredCalendarEventsToNativeBridge sends stored calendar events to the native reminder bridge', async () => {
  const { syncStoredCalendarEventsToNativeBridge } = loadCalendarNativeSyncModule()
  const calls = []

  const synced = await syncStoredCalendarEventsToNativeBridge(
    {
      getItem() {
        return JSON.stringify([storedEvent])
      }
    },
    {
      async replaceEvents(events) {
        calls.push(events)
        return events
      }
    }
  )

  assert.equal(synced, true)
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [[storedEvent]])
})

test('syncCalendarEventsToNativeBridge is a safe no-op when the native bridge is unavailable', async () => {
  const { syncCalendarEventsToNativeBridge } = loadCalendarNativeSyncModule()

  assert.equal(await syncCalendarEventsToNativeBridge([storedEvent], undefined), false)
})
