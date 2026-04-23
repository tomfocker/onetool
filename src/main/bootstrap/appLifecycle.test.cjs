const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadAppLifecycleModule() {
  const filePath = path.join(__dirname, 'appLifecycle.ts')
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

test('registerAppLifecycle wires quit, activate, and shortcut watchers through the app shell', () => {
  const { registerAppLifecycle } = loadAppLifecycleModule()
  const handlers = new Map()
  const calls = []

  registerAppLifecycle({
    app: {
      on(event, handler) {
        handlers.set(event, handler)
      },
      quit() {
        calls.push('app.quit')
      }
    },
    BrowserWindow: {
      getAllWindows() {
        return []
      }
    },
    globalShortcut: {
      unregisterAll() {
        calls.push('globalShortcut.unregisterAll')
      }
    },
    optimizer: {
      watchWindowShortcuts(window) {
        calls.push(['optimizer.watchWindowShortcuts', window])
      }
    },
    runtime: {
      platform: 'win32'
    },
    createWindow() {
      calls.push('createWindow')
    },
    windowManagerService: {
      setIsQuitting(value) {
        calls.push(['windowManager.setIsQuitting', value])
      }
    },
    autoClickerService: {
      stop() {
        calls.push('autoClicker.stop')
      }
    },
    screenRecorderService: {
      stop() {
        calls.push('screenRecorder.stop')
      }
    },
    processRegistry: {
      killAll() {
        calls.push('processRegistry.killAll')
      }
    }
  })

  handlers.get('browser-window-created')(null, 'window-1')
  handlers.get('will-quit')()
  handlers.get('before-quit')()
  handlers.get('activate')()
  handlers.get('window-all-closed')()

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['optimizer.watchWindowShortcuts', 'window-1'],
    'globalShortcut.unregisterAll',
    ['windowManager.setIsQuitting', true],
    'autoClicker.stop',
    'screenRecorder.stop',
    'processRegistry.killAll',
    'createWindow',
    'app.quit'
  ])
})

test('registerAppLifecycle keeps macOS all-windows-closed from quitting the app', () => {
  const { registerAppLifecycle } = loadAppLifecycleModule()
  const handlers = new Map()
  let quitCalled = false

  registerAppLifecycle({
    app: {
      on(event, handler) {
        handlers.set(event, handler)
      },
      quit() {
        quitCalled = true
      }
    },
    BrowserWindow: {
      getAllWindows() {
        return ['window-1']
      }
    },
    globalShortcut: {
      unregisterAll() {}
    },
    optimizer: {
      watchWindowShortcuts() {}
    },
    runtime: {
      platform: 'darwin'
    },
    createWindow() {},
    windowManagerService: {
      setIsQuitting() {}
    },
    autoClickerService: {
      stop() {}
    },
    screenRecorderService: {
      stop() {}
    },
    processRegistry: {
      killAll() {}
    }
  })

  handlers.get('window-all-closed')()
  handlers.get('activate')()

  assert.equal(quitCalled, false)
})
