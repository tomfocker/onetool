const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadUseWebActivatorModule() {
  const filePath = path.join(__dirname, 'useWebActivator.ts')
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
        useEffect: () => undefined,
        useCallback: (fn) => fn
      }
    }

    if (specifier === '../../../shared/types') {
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
    process
  }, { filename: filePath })

  return module.exports
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value))
}

const { deriveWindowListFetchState } = loadUseWebActivatorModule()

test('deriveWindowListFetchState clears stale entries and exposes an error message on failed refresh', () => {
  assert.deepEqual(
    toPlainObject(deriveWindowListFetchState({
      success: false,
      error: '无法获取窗口列表'
    })),
    {
      windows: [],
      statusMessage: '窗口列表获取失败'
    }
  )
})

test('deriveWindowListFetchState preserves successful window results without adding noise', () => {
  const windows = [{ title: 'Docs', processName: 'msedge', hwnd: 1, type: 'tab' }]

  assert.deepEqual(
    toPlainObject(deriveWindowListFetchState({
      success: true,
      data: { windows }
    })),
    {
      windows,
      statusMessage: ''
    }
  )
})
