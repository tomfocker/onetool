const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadRegisterIpcModule() {
  const filePath = path.join(__dirname, 'registerIpc.ts')
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

test('registerIpc registers both plain and window-aware handlers through one accessor', () => {
  const { registerIpc } = loadRegisterIpcModule()
  const calls = []

  registerIpc({
    mainWindowProvider: () => 'main-window',
    registrars: {
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
  })

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
  assert.ok(calls.some(([label]) => label === 'registerLlmIpc'))
})
