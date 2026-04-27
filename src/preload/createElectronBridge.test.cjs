const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const Module = require('node:module')
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

function loadFloatBallIpcModule(mocks) {
  const filePath = path.join(__dirname, '..', 'main', 'ipc', 'floatBallIpc.ts')
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
    if (request === 'electron') {
      return mocks.electron
    }
    if (request === '../services/WindowManagerService') {
      return mocks.windowManagerServiceModule
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    vm.runInNewContext(transpiled, {
      module,
      exports: module.exports,
      require,
      __dirname: path.dirname(filePath),
      __filename: filePath,
      console,
      process
    }, { filename: filePath })
  } finally {
    Module._load = originalLoad
  }

  return module.exports
}

function normalizeForAssertion(value) {
  return JSON.parse(JSON.stringify(value))
}

test('createElectronBridge exposes explicit app APIs without raw ipcRenderer access', () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  assert.equal('ipcRenderer' in bridge, false)
  assert.equal('capswriter' in bridge, false)
  assert.equal(typeof bridge.app.onOpenTool, 'function')
  assert.equal(typeof bridge.app.onNotification, 'function')
  assert.equal(typeof bridge.doctor.runAudit, 'function')
  assert.equal(typeof bridge.llm.getConfigStatus, 'function')
  assert.equal(typeof bridge.llm.testConnection, 'function')
  assert.equal(typeof bridge.llm.parseCalendarAssistant, 'function')
  assert.equal(typeof bridge.calendar.getWidgetState, 'function')
  assert.equal(typeof bridge.calendar.showWidget, 'function')
  assert.equal(typeof bridge.calendar.hideWidget, 'function')
  assert.equal(typeof bridge.calendar.toggleWidget, 'function')
  assert.equal(typeof bridge.calendar.setWidgetBounds, 'function')
  assert.equal(typeof bridge.calendar.replaceEvents, 'function')
  assert.equal(typeof bridge.calendar.onEventsUpdated, 'function')
  assert.equal(typeof bridge.taskbarAppearance.getStatus, 'function')
  assert.equal(typeof bridge.taskbarAppearance.applyPreset, 'function')
  assert.equal(typeof bridge.taskbarAppearance.restoreDefault, 'function')
  assert.equal(typeof bridge.tableOcr.getStatus, 'function')
  assert.equal(typeof bridge.tableOcr.prepareRuntime, 'function')
  assert.equal(typeof bridge.tableOcr.cancelPrepare, 'function')
  assert.equal(typeof bridge.tableOcr.onStateChanged, 'function')
  assert.equal(typeof bridge.tableOcr.recognize, 'function')
})

test('createElectronBridge exposes explicit float ball drag lifecycle APIs', () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  bridge.floatBall.beginDrag({ pointerOffsetX: 36, pointerOffsetY: 36 })
  bridge.floatBall.dragTo({ screenX: 1400, screenY: 320 })
  bridge.floatBall.endDrag()
  bridge.floatBall.peek()
  bridge.floatBall.restoreDock()

  assert.deepEqual(mocks.sendCalls[0], ['floatball-begin-drag', { pointerOffsetX: 36, pointerOffsetY: 36 }])
  assert.deepEqual(mocks.sendCalls[1], ['floatball-drag-to', { screenX: 1400, screenY: 320 }])
  assert.deepEqual(mocks.invokeCalls[0], ['floatball-end-drag', undefined])
  assert.deepEqual(mocks.invokeCalls[1], ['floatball-peek', undefined])
  assert.deepEqual(mocks.invokeCalls[2], ['floatball-restore-dock', undefined])
})

test('createElectronBridge maps calendar widget helpers and event subscriptions', async () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)
  let pushedEvents = null

  const unsubscribe = bridge.calendar.onEventsUpdated((events) => {
    pushedEvents = events
  })

  await bridge.calendar.getWidgetState()
  await bridge.calendar.showWidget()
  await bridge.calendar.hideWidget()
  await bridge.calendar.toggleWidget()
  await bridge.calendar.setWidgetBounds({ x: 12, y: 24, width: 320, height: 420 })
  await bridge.calendar.replaceEvents([{ id: 'event-1', title: '客户电话' }])
  mocks.listeners.get('calendar-events-updated')({}, [{ id: 'event-2', title: '复盘' }])
  unsubscribe()

  assert.deepEqual(mocks.invokeCalls, [
    ['calendar-widget-get-state'],
    ['calendar-widget-show'],
    ['calendar-widget-hide'],
    ['calendar-widget-toggle'],
    ['calendar-widget-set-bounds', { x: 12, y: 24, width: 320, height: 420 }],
    ['calendar-events-replace', [{ id: 'event-1', title: '客户电话' }]]
  ])
  assert.deepEqual(pushedEvents, [{ id: 'event-2', title: '复盘' }])
  assert.equal(mocks.removed.length, 1)
  assert.equal(mocks.removed[0][0], 'calendar-events-updated')
})

test('registerFloatBallIpc wires explicit float ball drag lifecycle channels', () => {
  const registeredOn = []
  const registeredHandle = []
  const mocks = {
    electron: {
      ipcMain: {
        on(channel, handler) {
          registeredOn.push([channel, handler])
        },
        handle(channel, handler) {
          registeredHandle.push([channel, handler])
        }
      },
      nativeImage: {
        createEmpty() {
          return { empty: true }
        },
        createFromPath() {
          return {
            resize() {
              return { resized: true }
            }
          }
        }
      }
    },
    windowManagerServiceModule: {
      windowManagerService: {
        getFloatBallWindow() {
          return null
        },
        hideFloatBallWindow() {},
        showFloatBallWindow() {},
        setFloatBallVisible() {},
        getFloatBallState() {
          return { success: true, data: { exists: true, visible: true } }
        }
      }
    }
  }

  const { registerFloatBallIpc } = loadFloatBallIpcModule(mocks)
  registerFloatBallIpc()

  assert.deepEqual(registeredOn.map(([channel]) => channel), [
    'floatball-move',
    'floatball-set-position',
    'floatball-resize',
    'floatball-hide-window',
    'floatball-show-window',
    'floatball-toggle-visibility',
    'floatball-set-visibility',
    'floatball-begin-drag',
    'floatball-drag-to',
    'ondragstart'
  ])
  assert.deepEqual(registeredHandle.map(([channel]) => channel), [
    'floatball-get-state',
    'floatball-end-drag',
    'floatball-peek',
    'floatball-restore-dock',
    'settings-set-floatball-hotkey'
  ])
})

test('createElectronBridge subscriptions route through explicit channels and unsubscribe cleanly', () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  let openedTool = null
  let indicatorTime = null
  let selectionBounds = null
  let screenshotSelectionSession = null
  let recorderSelectionSession = null
  const unsubscribeOpenTool = bridge.app.onOpenTool((toolId) => {
    openedTool = toolId
  })
  const unsubscribeIndicator = bridge.screenRecorder.onIndicatorTimeUpdated((time) => {
    indicatorTime = time
  })
  const unsubscribeSelection = bridge.screenRecorder.onSelectionResult((bounds) => {
    selectionBounds = bounds
  })
  const unsubscribeScreenshotSelectionSession = bridge.screenshot.onSelectionSession((payload) => {
    screenshotSelectionSession = payload
  })
  const unsubscribeRecorderSelectionSession = bridge.screenRecorder.onSelectionSession((payload) => {
    recorderSelectionSession = payload
  })

  mocks.listeners.get('open-tool')({}, 'clipboard')
  mocks.listeners.get('update-time')({}, '00:00:10')
  mocks.listeners.get('recorder-selection-result')({}, { x: 10, y: 20, width: 300, height: 200 })
  mocks.listeners.get('screenshot-selection:session-start')({}, { restrictBounds: null, enhanced: true })
  mocks.listeners.get('recorder-selection:session-start')({}, { initialBounds: { x: 10, y: 20, width: 300, height: 200 } })

  assert.equal(openedTool, 'clipboard')
  assert.equal(indicatorTime, '00:00:10')
  assert.deepEqual(selectionBounds, { x: 10, y: 20, width: 300, height: 200 })
  assert.deepEqual(screenshotSelectionSession, { restrictBounds: null, enhanced: true })
  assert.deepEqual(recorderSelectionSession, { initialBounds: { x: 10, y: 20, width: 300, height: 200 } })

  unsubscribeOpenTool()
  unsubscribeIndicator()
  unsubscribeSelection()
  unsubscribeScreenshotSelectionSession()
  unsubscribeRecorderSelectionSession()

  assert.equal(mocks.removed.length, 5)
  assert.equal(mocks.removed[0][0], 'open-tool')
  assert.equal(mocks.removed[1][0], 'update-time')
  assert.equal(mocks.removed[2][0], 'recorder-selection-result')
  assert.equal(mocks.removed[3][0], 'screenshot-selection:session-start')
  assert.equal(mocks.removed[4][0], 'recorder-selection:session-start')
})

test('createElectronBridge exposes explicit screen overlay session subscriptions and unsubscribes cleanly', () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  let sessionMode = null
  const unsubscribe = bridge.screenOverlay.onSessionStart((payload) => {
    sessionMode = payload.mode
  })

  mocks.listeners.get('screen-overlay:session-start')({}, { mode: 'ocr' })

  assert.equal(sessionMode, 'ocr')

  unsubscribe()

  assert.equal(mocks.removed.length, 1)
  assert.equal(mocks.removed[0][0], 'screen-overlay:session-start')
})

test('createElectronBridge maps explicit invoke helpers to the expected IPC channels', async () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  await bridge.doctor.runAudit()
  await bridge.devEnvironment.getOverview()
  await bridge.devEnvironment.refreshOne('nodejs')
  await bridge.devEnvironment.install('git')
  await bridge.devEnvironment.update('python')
  await bridge.devEnvironment.updateAll()
  await bridge.devEnvironment.openRelatedTool('wsl')
  await bridge.spaceCleanup.chooseRoot()
  await bridge.spaceCleanup.startScan('C:\\scan')
  await bridge.spaceCleanup.cancelScan()
  await bridge.spaceCleanup.getSession()
  await bridge.spaceCleanup.openPath('C:\\scan\\movie.mkv')
  await bridge.spaceCleanup.copyPath('C:\\scan\\movie.mkv')
  await bridge.spaceCleanup.deleteToTrash('C:\\scan\\movie.mkv')
  await bridge.llm.getConfigStatus()
  await bridge.llm.testConnection()
  await bridge.llm.parseCalendarAssistant({
    message: '明天下午三点开会',
    context: {
      selectedDate: '2025-07-23',
      today: '2025-07-23',
      events: []
    }
  })
  await bridge.llm.suggestRename({
    instructions: '按项目重命名',
    files: [{ name: 'draft.txt', path: 'D:/docs/draft.txt', size: 12 }]
  })
  await bridge.llm.analyzeSystem({
    config: {
      cpu: 'Intel',
      deviceModel: 'Test',
      motherboard: 'Board',
      memory: '16 GB',
      gpu: 'RTX',
      monitor: 'Display',
      disk: 'SSD',
      os: 'Windows',
      installTime: 1
    },
    doctorReport: null
  })
  await bridge.llm.suggestSpaceCleanup({
    rootPath: 'D:/downloads',
    summary: { totalBytes: 1024, scannedFiles: 3, scannedDirectories: 1, skippedEntries: 0 },
    largestFiles: []
  })
  await bridge.screenOverlay.start('ocr')
  await bridge.translate.translateImage('data:image/png;base64,abc', 'ocr')
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
    ['dev-environment-get-overview'],
    ['dev-environment-refresh-one', 'nodejs'],
    ['dev-environment-install', 'git'],
    ['dev-environment-update', 'python'],
    ['dev-environment-update-all'],
    ['dev-environment-open-related-tool', 'wsl'],
    ['space-cleanup-choose-root'],
    ['space-cleanup-start-scan', 'C:\\scan'],
    ['space-cleanup-cancel-scan'],
    ['space-cleanup-get-session'],
    ['space-cleanup-open-path', 'C:\\scan\\movie.mkv'],
    ['space-cleanup-copy-path', 'C:\\scan\\movie.mkv'],
    ['space-cleanup-delete-to-trash', 'C:\\scan\\movie.mkv'],
    ['llm-get-config-status'],
    ['llm-test-connection'],
    ['llm-parse-calendar-assistant', {
      message: '明天下午三点开会',
      context: {
        selectedDate: '2025-07-23',
        today: '2025-07-23',
        events: []
      }
    }],
    ['llm-suggest-rename', {
      instructions: '按项目重命名',
      files: [{ name: 'draft.txt', path: 'D:/docs/draft.txt', size: 12 }]
    }],
    ['llm-analyze-system', {
      config: {
        cpu: 'Intel',
        deviceModel: 'Test',
        motherboard: 'Board',
        memory: '16 GB',
        gpu: 'RTX',
        monitor: 'Display',
        disk: 'SSD',
        os: 'Windows',
        installTime: 1
      },
      doctorReport: null
    }],
    ['llm-suggest-space-cleanup', {
      rootPath: 'D:/downloads',
      summary: { totalBytes: 1024, scannedFiles: 3, scannedDirectories: 1, skippedEntries: 0 },
      largestFiles: []
    }],
    ['screen-overlay-start', 'ocr'],
    ['translate:image', 'data:image/png;base64,abc', 'ocr'],
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

test('createElectronBridge exposes explicit dev environment subscriptions and unsubscribes cleanly', () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  let log = null
  let progress = null
  let complete = null
  const unsubscribeLog = bridge.devEnvironment.onLog((data) => {
    log = data
  })
  const unsubscribeProgress = bridge.devEnvironment.onProgress((data) => {
    progress = data
  })
  const unsubscribeComplete = bridge.devEnvironment.onComplete((data) => {
    complete = data
  })

  mocks.listeners.get('dev-environment-log')({}, { type: 'info', message: 'refreshing' })
  mocks.listeners.get('dev-environment-progress')({}, { current: 1, total: 2, currentName: 'nodejs' })
  mocks.listeners.get('dev-environment-operation-complete')({}, { success: true, message: 'done' })

  assert.equal(log.message, 'refreshing')
  assert.equal(progress.currentName, 'nodejs')
  assert.equal(complete.success, true)

  unsubscribeLog()
  unsubscribeProgress()
  unsubscribeComplete()

  assert.equal(mocks.removed.at(-3)[0], 'dev-environment-log')
  assert.equal(mocks.removed.at(-2)[0], 'dev-environment-progress')
  assert.equal(mocks.removed.at(-1)[0], 'dev-environment-operation-complete')
})

test('createElectronBridge exposes explicit space cleanup subscriptions and unsubscribes cleanly', () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  let progress = null
  let complete = null
  let error = null
  const unsubscribeProgress = bridge.spaceCleanup.onProgress((data) => {
    progress = data
  })
  const unsubscribeComplete = bridge.spaceCleanup.onComplete((data) => {
    complete = data
  })
  const unsubscribeError = bridge.spaceCleanup.onError((data) => {
    error = data
  })

  mocks.listeners.get('space-cleanup-progress')({}, { status: 'scanning' })
  mocks.listeners.get('space-cleanup-complete')({}, { status: 'completed' })
  mocks.listeners.get('space-cleanup-error')({}, { status: 'failed', error: 'denied' })

  assert.equal(progress.status, 'scanning')
  assert.equal(complete.status, 'completed')
  assert.equal(error.error, 'denied')

  unsubscribeProgress()
  unsubscribeComplete()
  unsubscribeError()

  assert.equal(mocks.removed.at(-3)[0], 'space-cleanup-progress')
  assert.equal(mocks.removed.at(-2)[0], 'space-cleanup-complete')
  assert.equal(mocks.removed.at(-1)[0], 'space-cleanup-error')
})

test('createElectronBridge forwards fast scan mode metadata through space cleanup events', () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  let progress = null
  const unsubscribeProgress = bridge.spaceCleanup.onProgress((data) => {
    progress = data
  })

  mocks.listeners.get('space-cleanup-progress')({}, {
    status: 'scanning',
    scanMode: 'ntfs-fast',
    scanModeReason: null,
    isPartial: true
  })

  assert.equal(progress.scanMode, 'ntfs-fast')
  assert.equal(progress.scanModeReason, null)
  assert.equal(progress.isPartial, true)

  unsubscribeProgress()
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

test('createElectronBridge maps taskbar appearance helpers to the explicit IPC channels', async () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  await bridge.taskbarAppearance.getStatus()
  await bridge.taskbarAppearance.applyPreset({
    preset: 'acrylic',
    intensity: 72,
    tintHex: '#22446688'
  })
  await bridge.taskbarAppearance.restoreDefault()

  assert.deepEqual(mocks.invokeCalls, [
    ['taskbar-appearance-get-status'],
    ['taskbar-appearance-apply-preset', {
      preset: 'acrylic',
      intensity: 72,
      tintHex: '#22446688'
    }],
    ['taskbar-appearance-restore-default']
  ])
})

test('createElectronBridge exposes explicit bilibili downloader helpers and state subscriptions', async () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  let state = null
  const unsubscribe = bridge.bilibiliDownloader.onStateChanged((nextState) => {
    state = nextState
  })

  await bridge.bilibiliDownloader.getSession()
  await bridge.bilibiliDownloader.startLogin()
  await bridge.bilibiliDownloader.pollLogin()
  await bridge.bilibiliDownloader.logout()
  await bridge.bilibiliDownloader.parseLink('https://www.bilibili.com/video/BV1xK4y1m7aA')
  await bridge.bilibiliDownloader.loadStreamOptions('video', 'page:1')
  await bridge.bilibiliDownloader.startDownload('merge-mp4', 'D:\\Downloads')
  await bridge.bilibiliDownloader.cancelDownload()
  await bridge.bilibiliDownloader.selectOutputDirectory()

  mocks.listeners.get('bilibili-downloader-state-changed')({}, { taskStage: 'cancelled', error: null })

  assert.equal(state.taskStage, 'cancelled')
  assert.deepEqual(normalizeForAssertion(mocks.invokeCalls), [
    ['bilibili-downloader-get-session'],
    ['bilibili-downloader-start-login'],
    ['bilibili-downloader-poll-login'],
    ['bilibili-downloader-logout'],
    ['bilibili-downloader-parse-link', { link: 'https://www.bilibili.com/video/BV1xK4y1m7aA' }],
    ['bilibili-downloader-load-stream-options', { kind: 'video', itemId: 'page:1' }],
    ['bilibili-downloader-start-download', { exportMode: 'merge-mp4', outputDirectory: 'D:\\Downloads' }],
    ['bilibili-downloader-cancel-download'],
    ['bilibili-downloader-select-output-directory']
  ])

  unsubscribe()

  assert.equal(mocks.removed.length, 1)
  assert.equal(mocks.removed[0][0], 'bilibili-downloader-state-changed')
})

test('createElectronBridge exposes explicit model download APIs and subscriptions', async () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  let state = null
  const unsubscribe = bridge.modelDownload.onStateChanged((nextState) => {
    state = nextState
  })

  await bridge.modelDownload.getState()
  await bridge.modelDownload.startDownload({ repoId: 'Qwen/Qwen2.5' })
  await bridge.modelDownload.cancelDownload()
  await bridge.modelDownload.chooseSavePath()
  await bridge.modelDownload.openPath('D:\\Downloads')

  mocks.listeners.get('model-download-state-changed')({}, { status: 'running' })

  assert.equal(state.status, 'running')
  assert.deepEqual(mocks.invokeCalls, [
    ['model-download-get-state'],
    ['model-download-start', { repoId: 'Qwen/Qwen2.5' }],
    ['model-download-cancel'],
    ['model-download-choose-save-path'],
    ['model-download-open-path', 'D:\\Downloads']
  ])

  unsubscribe()

  assert.equal(mocks.removed.length, 1)
  assert.equal(mocks.removed[0][0], 'model-download-state-changed')
})

test('createElectronBridge exposes explicit table OCR APIs', async () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  let state = null
  const unsubscribe = bridge.tableOcr.onStateChanged((nextState) => {
    state = nextState
  })

  await bridge.tableOcr.getStatus()
  await bridge.tableOcr.prepareRuntime()
  await bridge.tableOcr.cancelPrepare()
  await bridge.tableOcr.chooseImage()
  await bridge.tableOcr.chooseOutputDirectory()
  await bridge.tableOcr.recognize({ inputPath: 'D:\\Pictures\\table.png', outputDirectory: 'D:\\Exports' })
  await bridge.tableOcr.openPath('D:\\Exports\\table.xlsx')
  mocks.listeners.get('table-ocr-state-changed')({}, { installStatus: 'running' })

  assert.equal(state.installStatus, 'running')
  assert.deepEqual(mocks.invokeCalls, [
    ['table-ocr-get-status'],
    ['table-ocr-prepare-runtime'],
    ['table-ocr-cancel-prepare'],
    ['table-ocr-choose-image'],
    ['table-ocr-choose-output-dir'],
    ['table-ocr-recognize', { inputPath: 'D:\\Pictures\\table.png', outputDirectory: 'D:\\Exports' }],
    ['table-ocr-open-path', 'D:\\Exports\\table.xlsx']
  ])

  unsubscribe()
  assert.equal(mocks.removed.length, 1)
  assert.equal(mocks.removed[0][0], 'table-ocr-state-changed')
})
