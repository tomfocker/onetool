const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadScreenRecorderServiceModule() {
  const filePath = path.join(__dirname, 'ScreenRecorderService.ts')
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
    if (specifier === 'electron') {
      return {
        app: {
          isPackaged: false,
          getPath: () => 'C:/tmp'
        },
        BrowserWindow: function BrowserWindow() {},
        dialog: {},
        desktopCapturer: {},
        screen: {}
      }
    }

    if (specifier === 'child_process') {
      return {
        spawn() {
          throw new Error('spawn should not run in this unit test')
        },
        execSync() {
          return ''
        }
      }
    }

    if (specifier === 'fluent-ffmpeg') {
      return {
        setFfmpegPath() {}
      }
    }

    if (specifier === 'ffmpeg-static') {
      return 'C:/tmp/ffmpeg.exe'
    }

    if (specifier === '../../shared/types') {
      return {}
    }

    if (specifier === '../../shared/screenRecorderSession') {
      return require(path.join(__dirname, '../../shared/screenRecorderSession.ts'))
    }

    if (specifier === './ProcessRegistry') {
      return {
        processRegistry: {
          register() {},
          unregister() {}
        }
      }
    }

    if (specifier === './ScreenshotService') {
      return {
        screenshotService: {
          capture: async () => ({ success: true, data: 'data:image/png;base64,preview' })
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
    process,
    Buffer,
    setTimeout,
    clearTimeout
  }, { filename: filePath })

  return module.exports
}

const { ScreenRecorderService } = loadScreenRecorderServiceModule()

test('expandPanel refuses to restore the main window while recording is active', () => {
  const recorder = new ScreenRecorderService()
  const calls = []
  recorder.mainWindow = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus')
  }
  recorder.session = {
    status: 'recording',
    mode: 'full',
    outputPath: 'C:/tmp/capture.mp4',
    recordingTime: '00:00:15',
    selectionBounds: null,
    selectionPreviewDataUrl: null,
    selectedDisplayId: 'display-1'
  }

  const result = recorder.expandPanel()
  assert.equal(result.success, false)
  assert.equal(result.error, '录制中无法展开主面板')
  assert.deepEqual(calls, [])
})
