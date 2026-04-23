const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadSingleInstanceModule() {
  const filePath = path.join(__dirname, 'singleInstance.ts')
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

test('setupSingleInstance quits immediately when the lock is unavailable', () => {
  const { setupSingleInstance } = loadSingleInstanceModule()
  let quitCalled = false

  const result = setupSingleInstance({
    app: {
      requestSingleInstanceLock() {
        return false
      },
      quit() {
        quitCalled = true
      },
      on() {}
    },
    getMainWindow() {
      return null
    }
  })

  assert.equal(result.hasLock, false)
  assert.equal(quitCalled, true)
})

test('setupSingleInstance restores and focuses the main window on second launch', () => {
  const { setupSingleInstance } = loadSingleInstanceModule()
  const handlers = new Map()
  const calls = []
  const mainWindow = {
    isMinimized() {
      return true
    },
    restore() {
      calls.push('restore')
    },
    isVisible() {
      return false
    },
    show() {
      calls.push('show')
    },
    focus() {
      calls.push('focus')
    }
  }

  const result = setupSingleInstance({
    app: {
      requestSingleInstanceLock() {
        return true
      },
      quit() {},
      on(event, handler) {
        handlers.set(event, handler)
      }
    },
    getMainWindow() {
      return mainWindow
    }
  })

  assert.equal(result.hasLock, true)
  handlers.get('second-instance')()
  assert.deepEqual(calls, ['restore', 'show', 'focus'])
})
