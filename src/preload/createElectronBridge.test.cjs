const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadCreateElectronBridgeModule() {
  const filePath = path.join(__dirname, 'createElectronBridge.ts')
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

function createMocks() {
  const invokeCalls = []
  const sendCalls = []
  const listeners = new Map()
  const removed = []

  return {
    deps: {
      ipcRenderer: {
        invoke(channel, ...args) {
          invokeCalls.push([channel, ...args])
          return Promise.resolve({ success: true })
        },
        send(channel, ...args) {
          sendCalls.push([channel, ...args])
        },
        on(channel, handler) {
          listeners.set(channel, handler)
        },
        removeListener(channel, handler) {
          removed.push([channel, handler])
          listeners.delete(channel)
        }
      },
      webUtils: {
        getPathForFile(file) {
          return file.path || file.name || ''
        }
      }
    },
    invokeCalls,
    sendCalls,
    listeners,
    removed
  }
}

test('createElectronBridge exposes explicit app APIs without raw ipcRenderer access', () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  assert.equal('ipcRenderer' in bridge, false)
  assert.equal(typeof bridge.app.onOpenTool, 'function')
  assert.equal(typeof bridge.app.onNotification, 'function')
  assert.equal(typeof bridge.doctor.runAudit, 'function')
})

test('createElectronBridge subscriptions route through explicit channels and unsubscribe cleanly', () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  let openedTool = null
  let indicatorTime = null
  let selectionBounds = null
  const unsubscribeOpenTool = bridge.app.onOpenTool((toolId) => {
    openedTool = toolId
  })
  const unsubscribeIndicator = bridge.screenRecorder.onIndicatorTimeUpdated((time) => {
    indicatorTime = time
  })
  const unsubscribeSelection = bridge.screenRecorder.onSelectionResult((bounds) => {
    selectionBounds = bounds
  })

  mocks.listeners.get('open-tool')({}, 'clipboard')
  mocks.listeners.get('update-time')({}, '00:00:10')
  mocks.listeners.get('recorder-selection-result')({}, { x: 10, y: 20, width: 300, height: 200 })

  assert.equal(openedTool, 'clipboard')
  assert.equal(indicatorTime, '00:00:10')
  assert.deepEqual(selectionBounds, { x: 10, y: 20, width: 300, height: 200 })

  unsubscribeOpenTool()
  unsubscribeIndicator()
  unsubscribeSelection()

  assert.equal(mocks.removed.length, 3)
  assert.equal(mocks.removed[0][0], 'open-tool')
  assert.equal(mocks.removed[1][0], 'update-time')
  assert.equal(mocks.removed[2][0], 'recorder-selection-result')
})

test('createElectronBridge maps explicit invoke helpers to the expected IPC channels', async () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  await bridge.doctor.runAudit()
  await bridge.screenRecorder.getDefaultPath('gif')
  await bridge.screenRecorder.selectOutput('gif')
  await bridge.screenRecorder.openSelection()
  await bridge.screenRecorder.closeSelection({ x: 1, y: 2, width: 3, height: 4 })
  await bridge.screenRecorder.hideSelectionPreview()
  await bridge.screenshot.openSelection(null, true)
  await bridge.screenshot.closeSelection(null)
  await bridge.floatBall.setHotkey('Alt+Shift+F')

  assert.deepEqual(mocks.invokeCalls, [
    ['doctor-run-audit'],
    ['screen-recorder-get-default-path', 'gif'],
    ['screen-recorder-select-output', 'gif'],
    ['recorder-selection-open'],
    ['recorder-selection-close', { x: 1, y: 2, width: 3, height: 4 }],
    ['screen-recorder-hide-selection-preview'],
    ['screenshot-selection-open', null, true],
    ['screenshot-selection-close', null],
    ['settings-set-floatball-hotkey', 'Alt+Shift+F']
  ])
})

test('createElectronBridge exposes an explicit direct-drag helper for prepared recorder selections', () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  bridge.screenRecorder.moveSelectionBy(12, -8)

  assert.equal(mocks.sendCalls.length, 1)
  assert.equal(mocks.sendCalls[0][0], 'screen-recorder-move-selection-by')
  assert.equal(mocks.sendCalls[0][1].deltaX, 12)
  assert.equal(mocks.sendCalls[0][1].deltaY, -8)
})

test('createElectronBridge exposes explicit updates APIs and unsubscribes cleanly', async () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  let state = null
  const unsubscribe = bridge.updates.onStateChanged((nextState) => {
    state = nextState
  })

  await bridge.updates.getState()
  await bridge.updates.checkForUpdates()
  await bridge.updates.downloadUpdate()
  await bridge.updates.quitAndInstall()

  mocks.listeners.get('updates-state-changed')({}, { status: 'available', currentVersion: '1.0.0' })

  assert.equal(state.status, 'available')
  assert.deepEqual(mocks.invokeCalls, [
    ['updates-get-state'],
    ['updates-check'],
    ['updates-download'],
    ['updates-quit-and-install']
  ])

  unsubscribe()

  assert.equal(mocks.removed.length, 1)
  assert.equal(mocks.removed[0][0], 'updates-state-changed')
})
