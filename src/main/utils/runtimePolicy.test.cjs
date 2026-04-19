const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadRuntimePolicyModule() {
  const filePath = path.join(__dirname, 'runtimePolicy.ts')
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

test('shouldHideMainWindowOnClose only hides when the app is not quitting and tray mode is enabled', () => {
  const { shouldHideMainWindowOnClose } = loadRuntimePolicyModule()

  assert.equal(shouldHideMainWindowOnClose({ isQuitting: true, minimizeToTray: true }), false)
  assert.equal(shouldHideMainWindowOnClose({ isQuitting: false, minimizeToTray: false }), false)
  assert.equal(shouldHideMainWindowOnClose({ isQuitting: false, minimizeToTray: true }), true)
})

test('serializeUnhandledReason keeps useful detail for errors and structured objects', () => {
  const { serializeUnhandledReason } = loadRuntimePolicyModule()

  assert.match(serializeUnhandledReason(new Error('boom')), /boom/)
  assert.equal(serializeUnhandledReason({ code: 'E_FAIL', detail: 'bad' }), '{"code":"E_FAIL","detail":"bad"}')
  assert.equal(serializeUnhandledReason('plain-text'), 'plain-text')
})
