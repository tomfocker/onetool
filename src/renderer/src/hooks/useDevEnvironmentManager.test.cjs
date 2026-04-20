const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadUseDevEnvironmentManagerModule() {
  const filePath = path.join(__dirname, 'useDevEnvironmentManager.ts')
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
        useCallback: (fn) => fn,
        useEffect: () => undefined,
        useMemo: (factory) => factory(),
        useRef: (value) => ({ current: value }),
        useState: () => {
          throw new Error('React hooks should not run in this unit test')
        }
      }
    }

    if (specifier === '../../../shared/devEnvironment') {
      return require(path.join(__dirname, '../../../shared/devEnvironment.ts'))
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

const {
  buildDevEnvironmentViewModel,
  resolveDevEnvironmentActionAvailability
} = loadUseDevEnvironmentManagerModule()

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value))
}

test('buildDevEnvironmentViewModel exposes summary cards and keeps record ordering', () => {
  const viewModel = buildDevEnvironmentViewModel({
    records: [
      { id: 'nodejs', status: 'installed' },
      { id: 'npm', status: 'linked' },
      { id: 'git', status: 'available-update' },
      { id: 'wsl', status: 'external' }
    ],
    summary: {
      installedCount: 1,
      missingCount: 0,
      brokenCount: 0,
      updateCount: 1,
      linkedCount: 1,
      externalCount: 1
    },
    checkedAt: '2026-04-20T12:00:00.000Z',
    wingetAvailable: true
  })

  assert.equal(viewModel.summaryCards[0].value, 1)
  assert.equal(viewModel.records[0].id, 'nodejs')
  assert.equal(viewModel.records[1].id, 'npm')
})

test('resolveDevEnvironmentActionAvailability hides install and update for linked environments', () => {
  assert.deepEqual(
    toPlainObject(resolveDevEnvironmentActionAvailability({
      id: 'npm',
      status: 'linked',
      canInstall: false,
      canUpdate: false
    })),
    {
      canInstall: false,
      canUpdate: false,
      canOpenRelatedTool: false,
      canRefresh: true
    }
  )
})

test('resolveDevEnvironmentActionAvailability routes WSL cards to the related tool action', () => {
  assert.deepEqual(
    toPlainObject(resolveDevEnvironmentActionAvailability({
      id: 'wsl',
      status: 'external',
      canInstall: false,
      canUpdate: false
    })),
    {
      canInstall: false,
      canUpdate: false,
      canOpenRelatedTool: true,
      canRefresh: true
    }
  )
})
