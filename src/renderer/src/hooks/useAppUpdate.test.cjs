const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadUseAppUpdateModule() {
  const filePath = path.join(__dirname, 'useAppUpdate.ts')
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
  canInvokeAppUpdateAction,
  createAppUpdateErrorState,
  createAppUpdateBridgeLifecycle,
  deriveAppUpdatePromptState,
  deriveAppUpdateStatusText,
  resolveAppUpdatePendingAction
} = loadUseAppUpdateModule()

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value))
}

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

test('deriveAppUpdatePromptState maps available updates to a confirm-download prompt', () => {
  assert.deepEqual(
    toPlainObject(deriveAppUpdatePromptState({
      status: 'available',
      currentVersion: '1.0.0',
      latestVersion: '1.2.0',
      releaseNotes: 'Bug fixes',
      progressPercent: null,
      errorMessage: null
    })),
    {
      kind: 'confirm-download',
      title: '发现新版本',
      message: '当前版本 1.0.0，可下载 1.2.0。',
      progressPercent: null,
      primaryActionLabel: '下载更新'
    }
  )
})

test('deriveAppUpdatePromptState maps downloading updates to a progress prompt', () => {
  assert.deepEqual(
    toPlainObject(deriveAppUpdatePromptState({
      status: 'downloading',
      currentVersion: '1.0.0',
      latestVersion: '1.2.0',
      releaseNotes: null,
      progressPercent: 42,
      errorMessage: null
    })),
    {
      kind: 'progress',
      title: '正在下载更新',
      message: '版本 1.2.0 正在下载。',
      progressPercent: 42,
      primaryActionLabel: null
    }
  )
})

test('deriveAppUpdatePromptState maps downloaded updates to a restart prompt', () => {
  assert.deepEqual(
    toPlainObject(deriveAppUpdatePromptState({
      status: 'downloaded',
      currentVersion: '1.0.0',
      latestVersion: '1.2.0',
      releaseNotes: null,
      progressPercent: 100,
      errorMessage: null
    })),
    {
      kind: 'restart',
      title: '更新已准备就绪',
      message: '版本 1.2.0 已下载完成。',
      progressPercent: 100,
      primaryActionLabel: '重新启动并安装'
    }
  )
})

test('createAppUpdateErrorState turns a failed initial bridge fetch into a visible error update state', () => {
  assert.deepEqual(
    toPlainObject(createAppUpdateErrorState('updates bridge unavailable')),
    {
      status: 'error',
      currentVersion: '',
      latestVersion: null,
      releaseNotes: null,
      progressPercent: null,
      errorMessage: 'updates bridge unavailable'
    }
  )
})

test('deriveAppUpdatePromptState maps error updates to a visible retry prompt', () => {
  assert.deepEqual(
    toPlainObject(deriveAppUpdatePromptState(createAppUpdateErrorState('updates bridge unavailable'))),
    {
      kind: 'error',
      title: '更新失败',
      message: 'updates bridge unavailable',
      progressPercent: null,
      primaryActionLabel: '重新检查更新'
    }
  )
})

test('deriveAppUpdateStatusText treats not-available as a benign latest-version status', () => {
  assert.equal(
    deriveAppUpdateStatusText({
      status: 'not-available',
      currentVersion: '1.0.0',
      latestVersion: null,
      releaseNotes: null,
      progressPercent: null,
      errorMessage: null
    }),
    '当前版本 1.0.0 · 已是最新版本'
  )
})

test('deriveAppUpdateStatusText shows a compact checking label while a manual check is in flight', () => {
  assert.equal(
    deriveAppUpdateStatusText(null, 'check'),
    '当前版本 未知版本 · 正在检查更新...'
  )
})

test('canInvokeAppUpdateAction blocks duplicate in-flight actions but allows a different action', () => {
  assert.equal(canInvokeAppUpdateAction('download', 'download'), false)
  assert.equal(canInvokeAppUpdateAction('download', 'install'), true)
  assert.equal(canInvokeAppUpdateAction(null, 'download'), true)
  assert.equal(canInvokeAppUpdateAction('check', 'check'), false)
  assert.equal(canInvokeAppUpdateAction('check', 'download'), true)
})

test('resolveAppUpdatePendingAction clears download pending on progress and download completion, install pending on error, and keeps check pending while checking', () => {
  assert.equal(resolveAppUpdatePendingAction('download', { status: 'downloading' }), null)
  assert.equal(resolveAppUpdatePendingAction('download', { status: 'downloaded' }), null)
  assert.equal(resolveAppUpdatePendingAction('download', { status: 'error' }), null)
  assert.equal(resolveAppUpdatePendingAction('install', { status: 'error' }), null)
  assert.equal(resolveAppUpdatePendingAction('check', { status: 'checking' }), 'check')
  assert.equal(resolveAppUpdatePendingAction('check', { status: 'available' }), null)
})

test('createAppUpdateBridgeLifecycle unsubscribes on cleanup and surfaces initial bridge rejection as an error state', async () => {
  let unsubscribed = 0
  const seenStates = []
  let seenError = null

  const cleanup = createAppUpdateBridgeLifecycle({
    getState: async () => {
      throw new Error('bridge down')
    },
    onStateChanged: (callback) => {
      callback({ status: 'checking' })
      return () => {
        unsubscribed += 1
      }
    },
    onState: (state) => {
      seenStates.push(state)
    },
    onError: (message) => {
      seenError = message
    }
  })

  await new Promise(resolve => setTimeout(resolve, 0))
  cleanup()

  assert.equal(unsubscribed, 1)
  assert.deepEqual(seenStates, [{ status: 'checking' }])
  assert.equal(seenError, 'bridge down')
})

test('createAppUpdateBridgeLifecycle ignores a stale initial getState result after a newer subscription state arrives', async () => {
  const deferred = createDeferred()
  const seenStates = []
  let emitState = null

  const cleanup = createAppUpdateBridgeLifecycle({
    getState: () => deferred.promise,
    onStateChanged: (callback) => {
      emitState = callback
      return () => undefined
    },
    onState: (state) => {
      seenStates.push(state)
    },
    onError: () => undefined
  })

  emitState({ status: 'checking' })
  deferred.resolve({
    success: true,
    data: {
      status: 'idle',
      currentVersion: '1.0.0',
      latestVersion: null,
      releaseNotes: null,
      progressPercent: null,
      errorMessage: null
    }
  })

  await deferred.promise
  await new Promise(resolve => setTimeout(resolve, 0))
  cleanup()

  assert.deepEqual(seenStates, [{ status: 'checking' }])
})
