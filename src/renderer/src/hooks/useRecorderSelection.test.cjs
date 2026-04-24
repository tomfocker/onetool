const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadUseRecorderSelectionModule() {
  const filePath = path.join(__dirname, 'useRecorderSelection.ts')
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
  const customRequire = (specifier) => {
    if (specifier === 'react') {
      return {
        useState: () => {
          throw new Error('React hooks should not run in this unit test')
        },
        useRef: () => ({ current: null }),
        useEffect: () => undefined
      }
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
    URLSearchParams
  }, { filename: filePath })

  return module.exports
}

const {
  clampDraggedSelectionRect,
  deriveInitialRecorderSelectionRect
} = loadUseRecorderSelectionModule()

test('deriveInitialRecorderSelectionRect reuses authoritative session bounds directly', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(deriveInitialRecorderSelectionRect(
      { x: 80, y: 100, width: 320, height: 180 }
    ))),
    {
      x: 80,
      y: 100,
      width: 320,
      height: 180
    }
  )
})

test('clampDraggedSelectionRect keeps the dragged area inside the current viewport', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(clampDraggedSelectionRect(
      { x: 150, y: 120, width: 320, height: 180 },
      { x: -400, y: 900 },
      { width: 1280, height: 720 }
    ))),
    {
      x: 0,
      y: 540,
      width: 320,
      height: 180
    }
  )
})
