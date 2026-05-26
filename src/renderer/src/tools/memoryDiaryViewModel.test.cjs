const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function loadViewModelModule() {
  const filePath = path.join(__dirname, 'memoryDiaryViewModel.ts')
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
    if (specifier === '../../../shared/memoryDiary') {
      return require(path.join(__dirname, '../../../shared/memoryDiary.ts'))
    }
    return require(specifier)
  }

  const runModule = Function('module', 'exports', 'require', '__dirname', '__filename', 'console', 'process', transpiled)
  runModule(module, module.exports, customRequire, __dirname, filePath, console, process)

  return module.exports
}

const { getMemoryDiaryScreenpipePrimaryAction } = loadViewModelModule()

test('ScreenPipe primary action starts when no reachable API has been detected', () => {
  assert.deepEqual(getMemoryDiaryScreenpipePrimaryAction(null), {
    action: 'start',
    label: '启动'
  })
  assert.deepEqual(getMemoryDiaryScreenpipePrimaryAction({
    state: 'stopped',
    apiReachable: false
  }), {
    action: 'start',
    label: '启动'
  })
})

test('ScreenPipe primary action refreshes when an existing API is reachable', () => {
  assert.deepEqual(getMemoryDiaryScreenpipePrimaryAction({
    state: 'external-running',
    apiReachable: true
  }), {
    action: 'refresh',
    label: '刷新状态'
  })
  assert.deepEqual(getMemoryDiaryScreenpipePrimaryAction({
    state: 'running',
    apiReachable: true
  }), {
    action: 'refresh',
    label: '刷新状态'
  })
})
