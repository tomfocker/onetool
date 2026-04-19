const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadUpdateInstallFlowModule() {
  const filePath = path.join(__dirname, 'updateInstallFlow.ts')
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

  vm.runInNewContext(
    transpiled,
    {
      module,
      exports: module.exports,
      require,
      __dirname,
      __filename: filePath,
      console,
      process,
      Buffer,
      setTimeout,
      clearTimeout
    },
    { filename: filePath }
  )

  return module.exports
}

test('createBeforeQuitAndInstallHook returns a rollback callback that restores quitting state', () => {
  const { createBeforeQuitAndInstallHook } = loadUpdateInstallFlowModule()
  const transitions = []
  const hook = createBeforeQuitAndInstallHook({
    setIsQuitting(value) {
      transitions.push(value)
    }
  })

  const rollback = hook()
  rollback()

  assert.deepEqual(transitions, [true, false])
})
