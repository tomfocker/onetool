const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadDiagnosticsModule() {
  const filePath = path.join(__dirname, 'diagnostics.ts')
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

test('registerProcessDiagnostics wires process and app failure logging', () => {
  const { registerProcessDiagnostics } = loadDiagnosticsModule()
  const processHandlers = new Map()
  const appHandlers = new Map()
  const loggerCalls = []

  registerProcessDiagnostics({
    processLike: {
      on(event, handler) {
        processHandlers.set(event, handler)
      }
    },
    app: {
      on(event, handler) {
        appHandlers.set(event, handler)
      }
    },
    logger: {
      error(message, details) {
        loggerCalls.push([message, details])
      }
    },
    serializeUnhandledReason(reason) {
      return `serialized:${String(reason)}`
    }
  })

  processHandlers.get('uncaughtException')(new Error('boom'))
  processHandlers.get('unhandledRejection')('bad', Promise.resolve())
  appHandlers.get('child-process-gone')(null, { type: 'GPU' })

  assert.equal(loggerCalls[0][0], 'Uncaught Exception')
  assert.equal(loggerCalls[1][0], 'Unhandled Rejection')
  assert.equal(loggerCalls[1][1].reason, 'serialized:bad')
  assert.equal(loggerCalls[2][0], 'Child process gone')
  assert.deepEqual(JSON.parse(JSON.stringify(loggerCalls[2][1])), { type: 'GPU' })
})
