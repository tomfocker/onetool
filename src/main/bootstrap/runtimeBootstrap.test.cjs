const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadBootstrapModule() {
  const filePath = path.join(__dirname, 'runtimeBootstrap.ts')
  const registerIpcPath = path.join(__dirname, 'registerIpc.ts')
  const source = fs.readFileSync(filePath, 'utf8')
  const registerIpcSource = fs.readFileSync(registerIpcPath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    },
    fileName: filePath
  }).outputText
  const transpiledRegisterIpc = ts.transpileModule(registerIpcSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    },
    fileName: registerIpcPath
  }).outputText

  const registerIpcModule = { exports: {} }
  vm.runInNewContext(transpiledRegisterIpc, {
    module: registerIpcModule,
    exports: registerIpcModule.exports,
    require,
    __dirname: path.dirname(registerIpcPath),
    __filename: registerIpcPath,
    console,
    process,
    Buffer,
    setTimeout,
    clearTimeout
  }, { filename: registerIpcPath })

  const module = { exports: {} }
  const localRequire = (specifier) => {
    if (specifier === './registerIpc') {
      return registerIpcModule.exports
    }
    return require(specifier)
  }

  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require: localRequire,
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

test('bindMainWindowServices attaches the window to every runtime-backed service', () => {
  const { bindMainWindowServices } = loadBootstrapModule()
  const mainWindow = { id: 1 }
  const calls = []
  const createService = (label) => ({
    setMainWindow(window) {
      calls.push([label, window])
    }
  })

  bindMainWindowServices(mainWindow, {
    autoClickerService: createService('autoClickerService'),
    clipboardService: createService('clipboardService'),
    hotkeyService: createService('hotkeyService'),
    screenRecorderService: createService('screenRecorderService'),
    screenOverlayService: createService('screenOverlayService'),
    colorPickerService: createService('colorPickerService'),
    webActivatorService: createService('webActivatorService'),
    quickInstallerService: createService('quickInstallerService'),
    spaceCleanupService: createService('spaceCleanupService'),
    downloadOrganizerService: createService('downloadOrganizerService'),
    windowManagerService: createService('windowManagerService'),
    screenshotService: createService('screenshotService')
  })

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['autoClickerService', { id: 1 }],
    ['clipboardService', { id: 1 }],
    ['hotkeyService', { id: 1 }],
    ['screenRecorderService', { id: 1 }],
    ['screenOverlayService', { id: 1 }],
    ['colorPickerService', { id: 1 }],
    ['webActivatorService', { id: 1 }],
    ['quickInstallerService', { id: 1 }],
    ['spaceCleanupService', { id: 1 }],
    ['downloadOrganizerService', { id: 1 }],
    ['windowManagerService', { id: 1 }],
    ['screenshotService', { id: 1 }]
  ])
})

test('registerMainProcessIpc wires window-aware registrations through the shared accessor', () => {
  const { registerMainProcessIpc } = loadBootstrapModule()
  const calls = []
  const deps = {
    registerAutoClickerIpc: () => calls.push(['registerAutoClickerIpc']),
    registerClipboardIpc: () => calls.push(['registerClipboardIpc']),
    registerColorPickerIpc: () => calls.push(['registerColorPickerIpc']),
    registerHotkeyIpc: () => calls.push(['registerHotkeyIpc']),
    registerLocalProxyIpc: () => calls.push(['registerLocalProxyIpc']),
    registerNetworkIpc: () => calls.push(['registerNetworkIpc']),
    registerTranslateIpc: () => calls.push(['registerTranslateIpc']),
    registerLlmIpc: () => calls.push(['registerLlmIpc']),
    registerTaskbarAppearanceIpc: () => calls.push(['registerTaskbarAppearanceIpc']),
    registerRenameIpc: () => calls.push(['registerRenameIpc']),
    registerQuickInstallerIpc: () => calls.push(['registerQuickInstallerIpc']),
    registerScreenOverlayIpc: () => calls.push(['registerScreenOverlayIpc']),
    registerScreenRecorderIpc: (getMainWindow) => calls.push(['registerScreenRecorderIpc', getMainWindow()]),
    registerScreenSaverIpc: () => calls.push(['registerScreenSaverIpc']),
    registerSettingsIpc: (getMainWindow) => calls.push(['registerSettingsIpc', getMainWindow()]),
    registerStoreIpc: (getMainWindow) => calls.push(['registerStoreIpc', getMainWindow()]),
    registerDoctorIpc: () => calls.push(['registerDoctorIpc']),
    registerDevEnvironmentIpc: (getMainWindow) => calls.push(['registerDevEnvironmentIpc', getMainWindow()]),
    registerSystemIpc: (getMainWindow) => calls.push(['registerSystemIpc', getMainWindow()]),
    registerScreenshotIpc: () => calls.push(['registerScreenshotIpc']),
    registerFloatBallIpc: () => calls.push(['registerFloatBallIpc']),
    registerCalendarIpc: (getMainWindow) => calls.push(['registerCalendarIpc', getMainWindow()]),
    registerUpdateIpc: (getMainWindow) => calls.push(['registerUpdateIpc', getMainWindow()]),
    registerWebActivatorIpc: () => calls.push(['registerWebActivatorIpc']),
    registerWslIpc: () => calls.push(['registerWslIpc']),
    registerSpaceCleanupIpc: (getMainWindow) => calls.push(['registerSpaceCleanupIpc', getMainWindow()]),
    registerDownloadOrganizerIpc: (getMainWindow) => calls.push(['registerDownloadOrganizerIpc', getMainWindow()]),
    registerModelDownloadIpc: (getMainWindow) => calls.push(['registerModelDownloadIpc', getMainWindow()]),
    registerTableOcrIpc: (getMainWindow) => calls.push(['registerTableOcrIpc', getMainWindow()]),
    registerBilibiliDownloaderIpc: (getMainWindow) => calls.push(['registerBilibiliDownloaderIpc', getMainWindow()])
  }

  registerMainProcessIpc(() => 'main-window', deps)

  assert.deepEqual(JSON.parse(JSON.stringify(calls.filter((entry) => entry.length === 2))), [
    ['registerScreenRecorderIpc', 'main-window'],
    ['registerSettingsIpc', 'main-window'],
    ['registerStoreIpc', 'main-window'],
    ['registerDevEnvironmentIpc', 'main-window'],
    ['registerSystemIpc', 'main-window'],
    ['registerCalendarIpc', 'main-window'],
    ['registerUpdateIpc', 'main-window'],
    ['registerSpaceCleanupIpc', 'main-window'],
    ['registerDownloadOrganizerIpc', 'main-window'],
    ['registerModelDownloadIpc', 'main-window'],
    ['registerTableOcrIpc', 'main-window'],
    ['registerBilibiliDownloaderIpc', 'main-window']
  ])
  assert.ok(calls.some(([label]) => label === 'registerScreenOverlayIpc'))
  assert.ok(calls.some(([label]) => label === 'registerTaskbarAppearanceIpc'))
})

test('initializeMainRuntime wires post-window services, updates, and hotkeys', async () => {
  const { initializeMainRuntime } = loadBootstrapModule()
  const calls = []
  let settingsChangedHandler = null
  const scheduledTimers = []

  const settingsService = {
    getSettings() {
      return { minimizeToTray: true }
    },
    on(event, handler) {
      if (event === 'changed') {
        settingsChangedHandler = handler
      }
    }
  }

  await initializeMainRuntime({
    settingsService,
    downloadOrganizerService: {
      async initialize() {
        calls.push(['downloadOrganizer.initialize'])
      }
    },
    windowManagerService: {
      setTrayEnabled(value) {
        calls.push(['windowManager.setTrayEnabled', value])
      },
      createFloatBallWindow() {
        calls.push(['windowManager.createFloatBallWindow'])
      }
    },
    appUpdateService: {
      setBeforeQuitAndInstall(hook) {
        calls.push(['appUpdate.setBeforeQuitAndInstall', hook])
      },
      async initialize() {
        calls.push(['appUpdate.initialize'])
      }
    },
    autoClickerService: {
      registerShortcuts() {
        calls.push(['autoClicker.registerShortcuts'])
      }
    },
    hotkeyService: {
      registerRecorderShortcut() {
        calls.push(['hotkey.registerRecorderShortcut'])
      },
      registerScreenshotShortcut() {
        calls.push(['hotkey.registerScreenshotShortcut'])
      },
      registerTranslatorShortcut() {
        calls.push(['hotkey.registerTranslatorShortcut'])
      },
      registerFloatBallShortcut() {
        calls.push(['hotkey.registerFloatBallShortcut'])
      },
      registerClipboardShortcut() {
        calls.push(['hotkey.registerClipboardShortcut'])
      }
    },
    registerAutoUpdateSettingsChangeHandler(input) {
      calls.push(['registerAutoUpdateSettingsChangeHandler', input.runtime])
    },
    createBeforeQuitAndInstallHook(windowManagerService) {
      calls.push(['createBeforeQuitAndInstallHook', Boolean(windowManagerService)])
      return 'before-quit-hook'
    },
    runtime: {
      platform: 'win32',
      isPackaged: true,
      isDevelopment: false,
      isPortableWindowsRuntime: false
    },
    scheduleTimeout(handler, timeoutMs) {
      scheduledTimers.push(timeoutMs)
      handler()
      return timeoutMs
    }
  })

  assert.ok(calls.some(([label]) => label === 'downloadOrganizer.initialize'))
  assert.ok(calls.some(([label]) => label === 'windowManager.createFloatBallWindow'))
  assert.ok(calls.some(([label]) => label === 'appUpdate.initialize'))
  assert.deepEqual(JSON.parse(JSON.stringify(calls.filter(([label]) => label === 'windowManager.setTrayEnabled'))), [
    ['windowManager.setTrayEnabled', true]
  ])
  assert.deepEqual(JSON.parse(JSON.stringify(calls.filter(([label]) => label === 'registerAutoUpdateSettingsChangeHandler'))), [
    ['registerAutoUpdateSettingsChangeHandler', {
      platform: 'win32',
      isPackaged: true,
      isDevelopment: false,
      isPortableWindowsRuntime: false
    }]
  ])
  assert.equal(scheduledTimers.includes(1000), true)
  assert.equal(typeof settingsChangedHandler, 'function')

  settingsChangedHandler({ minimizeToTray: false })
  assert.deepEqual(JSON.parse(JSON.stringify(calls.filter(([label]) => label === 'windowManager.setTrayEnabled'))), [
    ['windowManager.setTrayEnabled', true],
    ['windowManager.setTrayEnabled', false]
  ])
})

test('scheduleDoctorAudit notifies the renderer when health issues are found', async () => {
  const { scheduleDoctorAudit } = loadBootstrapModule()
  const notifications = []
  const scheduledTimers = []

  scheduleDoctorAudit(
    () => ({
      webContents: {
        send(channel, payload) {
          notifications.push([channel, payload])
        }
      }
    }),
    {
      doctorService: {
        async runFullAudit() {
          return {
            success: true,
            data: {
              winget: { ok: false },
              git: { ok: true },
              node: { ok: false }
            }
          }
        }
      },
      scheduleTimeout(handler, timeoutMs) {
        scheduledTimers.push(timeoutMs)
        void handler()
        return timeoutMs
      }
    }
  )

  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(scheduledTimers, [3000])
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0][0], 'app-notification')
  assert.equal(notifications[0][1].type, 'warning')
  assert.match(notifications[0][1].message, /2 项环境依赖异常/)
})
