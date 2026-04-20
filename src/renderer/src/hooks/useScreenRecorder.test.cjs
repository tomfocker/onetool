const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadUseScreenRecorderModule() {
  const filePath = path.join(__dirname, 'useScreenRecorder.ts')
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

    if (specifier === '../../../shared/screenRecorderSession') {
      return require(path.join(__dirname, '../../../shared/screenRecorderSession.ts'))
    }

    if (specifier === '../../../shared/ipc-schemas') {
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

const {
  applyRecorderSessionSnapshot,
  bootstrapScreenRecorder,
  getScreenRecorderViewState
} = loadUseScreenRecorderModule()

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value))
}

test('applyRecorderSessionSnapshot realigns draft mode to an authoritative idle/full cancel update', () => {
  assert.deepEqual(
    toPlainObject(applyRecorderSessionSnapshot(
      {
        draftMode: 'area',
        outputPath: 'C:/tmp/draft.mp4'
      },
      {
        status: 'idle',
        mode: 'full',
        outputPath: '',
        recordingTime: '00:00:00',
        selectionBounds: null,
        selectionPreviewDataUrl: null,
        selectedDisplayId: null
      }
    )),
    {
      draftMode: 'full',
      outputPath: 'C:/tmp/draft.mp4'
    }
  )
})

test('applyRecorderSessionSnapshot hydrates late-mounted draft state from the authoritative session snapshot', () => {
  assert.deepEqual(
    toPlainObject(applyRecorderSessionSnapshot(
      {
        draftMode: 'full',
        outputPath: ''
      },
      {
        status: 'ready-to-record',
        mode: 'area',
        outputPath: 'C:/tmp/session.mp4',
        recordingTime: '00:00:00',
        selectionBounds: { x: 10, y: 20, width: 300, height: 200 },
        selectionPreviewDataUrl: 'data:image/png;base64,preview',
        selectedDisplayId: 'display-1'
      }
    )),
    {
      draftMode: 'area',
      outputPath: 'C:/tmp/session.mp4'
    }
  )
})

test('getScreenRecorderViewState keeps hotkey editing and section 3 scoped to active recording states', () => {
  assert.deepEqual(
    toPlainObject(getScreenRecorderViewState('idle')),
    {
      controlsLocked: false,
      showPreStartControls: true,
      showRecordingControls: false
    }
  )

  assert.deepEqual(
    toPlainObject(getScreenRecorderViewState('ready-to-record')),
    {
      controlsLocked: false,
      showPreStartControls: true,
      showRecordingControls: false
    }
  )

  assert.deepEqual(
    toPlainObject(getScreenRecorderViewState('recording')),
    {
      controlsLocked: true,
      showPreStartControls: false,
      showRecordingControls: true
    }
  )

  assert.deepEqual(
    toPlainObject(getScreenRecorderViewState('finishing')),
    {
      controlsLocked: true,
      showPreStartControls: false,
      showRecordingControls: true
    }
  )
})

test('bootstrapScreenRecorder resolves without blocking on screen capture hydration', async () => {
  const applied = {
    outputPath: null,
    hotkey: null,
    session: null
  }
  let loadScreensStarted = false
  let resolveLoadScreens

  await bootstrapScreenRecorder(
    {
      getDefaultPath: async () => ({ success: true, data: 'C:/tmp/output.mp4' }),
      getHotkey: async () => ({ success: true, data: 'Alt+Shift+R' }),
      getSession: async () => ({
        success: true,
        data: {
          status: 'idle',
          mode: 'full',
          outputPath: 'C:/tmp/output.mp4',
          recordingTime: '00:00:00',
          selectionBounds: null,
          selectionPreviewDataUrl: null,
          selectedDisplayId: null
        }
      }),
      loadScreens: async () => {
        loadScreensStarted = true
        await new Promise((resolve) => {
          resolveLoadScreens = resolve
        })
      },
      scheduleScreenLoad: (callback) => {
        callback()
      }
    },
    {
      setOutputPath: (value) => {
        applied.outputPath = value
      },
      setRecorderHotkey: (value) => {
        applied.hotkey = value
      },
      applyAuthoritativeSession: (value) => {
        applied.session = value
      }
    }
  )

  assert.equal(loadScreensStarted, true)
  assert.equal(applied.outputPath, 'C:/tmp/output.mp4')
  assert.equal(applied.hotkey, 'Alt+Shift+R')
  assert.equal(applied.session.outputPath, 'C:/tmp/output.mp4')

  resolveLoadScreens()
})
