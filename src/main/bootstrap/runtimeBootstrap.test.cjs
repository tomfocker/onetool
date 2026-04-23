const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadBootstrapModule() {
  const filePath = path.join(__dirname, 'runtimeBootstrap.ts')
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
    registerUpdateIpc: (getMainWindow) => calls.push(['registerUpdateIpc', getMainWindow()]),
    registerWebActivatorIpc: () => calls.push(['registerWebActivatorIpc']),
    registerWslIpc: () => calls.push(['registerWslIpc']),
    registerSpaceCleanupIpc: (getMainWindow) => calls.push(['registerSpaceCleanupIpc', getMainWindow()]),
    registerDownloadOrganizerIpc: (getMainWindow) => calls.push(['registerDownloadOrganizerIpc', getMainWindow()]),
    registerModelDownloadIpc: (getMainWindow) => calls.push(['registerModelDownloadIpc', getMainWindow()]),
    registerBilibiliDownloaderIpc: (getMainWindow) => calls.push(['registerBilibiliDownloaderIpc', getMainWindow()])
  }

  registerMainProcessIpc(() => 'main-window', deps)

  assert.deepEqual(JSON.parse(JSON.stringify(calls.filter((entry) => entry.length === 2))), [
    ['registerScreenRecorderIpc', 'main-window'],
    ['registerSettingsIpc', 'main-window'],
    ['registerStoreIpc', 'main-window'],
    ['registerDevEnvironmentIpc', 'main-window'],
    ['registerSystemIpc', 'main-window'],
    ['registerUpdateIpc', 'main-window'],
    ['registerSpaceCleanupIpc', 'main-window'],
    ['registerDownloadOrganizerIpc', 'main-window'],
    ['registerModelDownloadIpc', 'main-window'],
    ['registerBilibiliDownloaderIpc', 'main-window']
  ])
  assert.ok(calls.some(([label]) => label === 'registerScreenOverlayIpc'))
  assert.ok(calls.some(([label]) => label === 'registerTaskbarAppearanceIpc'))
})
