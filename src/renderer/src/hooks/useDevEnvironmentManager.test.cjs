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
      { id: 'nodejs', status: 'installed', resolvedPath: 'C:\\Program Files\\nodejs\\node.exe' },
      { id: 'npm', status: 'linked', resolvedPath: null },
      { id: 'git', status: 'available-update', resolvedPath: 'C:\\Program Files\\Git\\cmd\\git.exe' },
      { id: 'wsl', status: 'external', resolvedPath: null }
    ],
    summary: {
      installedCount: 4,
      missingCount: 0,
      brokenCount: 0,
      updateCount: 1,
      linkedCount: 1,
      externalCount: 1
    },
    checkedAt: '2026-04-20T12:00:00.000Z',
    wingetAvailable: true
  })

  assert.equal(viewModel.summaryCards[0].value, 4)
  assert.equal(viewModel.records[0].id, 'nodejs')
  assert.equal(viewModel.records[1].id, 'npm')
})

test('buildDevEnvironmentViewModel sanitizes unreadable paths before rendering', () => {
  const viewModel = buildDevEnvironmentViewModel({
    records: [
      {
        id: 'go',
        status: 'broken',
        detectedVersion: null,
        resolvedPath: '��U: ����s���g�',
        manager: 'winget',
        canInstall: false,
        canUpdate: false,
        notes: ['命令可执行，但版本输出无法解析']
      }
    ],
    summary: {
      installedCount: 0,
      missingCount: 0,
      brokenCount: 1,
      updateCount: 0,
      linkedCount: 0,
      externalCount: 0
    },
    checkedAt: '2026-04-20T12:00:00.000Z',
    wingetAvailable: true
  })

  assert.equal(viewModel.records[0].resolvedPath, null)
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
