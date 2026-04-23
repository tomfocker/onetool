const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadUtilityWindowRuntime() {
  const filePath = path.join(__dirname, 'utilityWindowRuntime.ts')
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

test('beginUtilityWindowSession resets stale overlay state while preserving the new mode', () => {
  const { beginUtilityWindowSession } = loadUtilityWindowRuntime()

  const next = beginUtilityWindowSession({
    previous: {
      mode: 'translate',
      status: 'completed',
      error: 'old error',
      copied: true,
      overlayResults: [{ text: 'old' }]
    },
    incoming: {
      mode: 'ocr'
    }
  })

  assert.deepEqual(JSON.parse(JSON.stringify(next)), {
    mode: 'ocr',
    status: 'idle',
    error: null,
    copied: false,
    overlayResults: []
  })
})

test('beginUtilityWindowSession keeps the requested mode even without previous state', () => {
  const { beginUtilityWindowSession } = loadUtilityWindowRuntime()

  const next = beginUtilityWindowSession({
    incoming: {
      mode: 'translate'
    }
  })

  assert.deepEqual(JSON.parse(JSON.stringify(next)), {
    mode: 'translate',
    status: 'idle',
    error: null,
    copied: false,
    overlayResults: []
  })
})
