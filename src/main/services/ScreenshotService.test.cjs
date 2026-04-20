const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadScreenshotServiceModule() {
  const filePath = path.join(__dirname, 'ScreenshotService.ts')
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
  const eventLog = []

  class BrowserWindowMock {
    static fromWebContents(webContents) {
      return webContents.windowRef || null
    }
  }

  const customRequire = (specifier) => {
    if (specifier === 'electron') {
      return {
        app: {
          getPath: () => 'C:/tmp'
        },
        BrowserWindow: BrowserWindowMock,
        desktopCapturer: {},
        screen: {},
        nativeImage: {},
        dialog: {},
        clipboard: {}
      }
    }

    if (specifier === '@electron-toolkit/utils') {
      return {
        is: {
          dev: false
        }
      }
    }

    if (specifier === './SettingsService') {
      return {
        settingsService: {
          getSettings: () => ({})
        }
      }
    }

    if (specifier === '../utils/windowSecurity') {
      return {
        createIsolatedPreloadWebPreferences: () => ({})
      }
    }

    if (specifier === '../../shared/types') {
      return {}
    }

    return require(specifier)
  }

  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require: customRequire,
    __dirname,
    __filename: filePath,
    console,
    process,
    Buffer,
    setTimeout,
    clearTimeout
  }, { filename: filePath })

  return {
    ...module.exports,
    eventLog
  }
}

test('closeSelectionWindow sends the selection result before closing overlay windows', async () => {
  const { ScreenshotService, eventLog } = loadScreenshotServiceModule()
  const service = new ScreenshotService()

  const senderWindow = {
    getBounds: () => ({ x: 100, y: 200, width: 800, height: 600 })
  }

  const sender = { windowRef: senderWindow }

  service.mainWindow = {
    isDestroyed: () => false,
    webContents: {
      send(channel, payload) {
        eventLog.push(['send', channel, payload])
      }
    }
  }

  service.selectionResultsChannel = 'recorder-selection-result'
  service.selectionWindows = [
    {
      isDestroyed: () => false,
      close() {
        eventLog.push(['close', 'overlay-1'])
      }
    },
    {
      isDestroyed: () => false,
      close() {
        eventLog.push(['close', 'overlay-2'])
      }
    }
  ]

  service.closeSelectionWindow(sender, { x: 10, y: 20, width: 300, height: 200 })

  assert.equal(
    JSON.stringify(eventLog[0]),
    JSON.stringify([
      'send',
      'recorder-selection-result',
      { x: 110, y: 220, width: 300, height: 200 }
    ])
  )

  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(
    JSON.stringify(eventLog.slice(1)),
    JSON.stringify([
      ['close', 'overlay-1'],
      ['close', 'overlay-2']
    ])
  )
})
