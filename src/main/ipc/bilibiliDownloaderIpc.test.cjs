const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { z } = require('zod')

function loadBilibiliDownloaderIpcModule(overrides = {}) {
  const filePath = path.join(__dirname, 'bilibiliDownloaderIpc.ts')
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
  const handlers = {}

  const customRequire = (specifier) => {
    if (specifier === 'electron') {
      return overrides.electronModule || {
        ipcMain: {
          handle(channel, handler) {
            handlers[channel] = handler
          }
        }
      }
    }

    if (specifier === '../services/BilibiliDownloaderService') {
      return {
        bilibiliDownloaderService: overrides.bilibiliDownloaderService
      }
    }

    if (specifier === '../../shared/ipc-schemas') {
      return overrides.ipcSchemas || {
        BilibiliParseLinkRequestSchema: z.object({
          link: z.string().min(1)
        }),
        BilibiliDownloaderSelectionSchema: z.object({
          exportMode: z.enum(['video-only', 'audio-only', 'split-streams', 'merge-mp4']).nullable()
        }),
        BilibiliDownloaderStateSchema: z.object({
          loginSession: z.object({
            isLoggedIn: z.boolean(),
            nickname: z.string().nullable(),
            avatarUrl: z.string().nullable(),
            expiresAt: z.string().nullable()
          }),
          parsedLink: z.any().nullable(),
          selection: z.object({
            exportMode: z.enum(['video-only', 'audio-only', 'split-streams', 'merge-mp4']).nullable()
          }),
          streamOptionSummary: z.any().nullable(),
          taskStage: z.enum(['idle', 'parsing', 'loading-stream-options', 'downloading-video', 'downloading-audio', 'merging', 'cancelled', 'completed', 'failed']),
          error: z.string().nullable()
        })
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

  return { ...module.exports, handlers }
}

function createServiceStub() {
  const calls = []
  let changedHandler = null

  return {
    calls,
    service: {
      loadSession() {
        calls.push(['loadSession'])
        return { success: true, data: { isLoggedIn: false, nickname: null, avatarUrl: null, expiresAt: null } }
      },
      bootstrapQrLogin: async () => {
        calls.push(['bootstrapQrLogin'])
        return { success: true, data: { qrUrl: 'https://qr.example', authCode: 'qr-key' } }
      },
      pollLogin: async () => {
        calls.push(['pollLogin'])
        return { success: true, data: { status: 'pending' } }
      },
      logout: async () => {
        calls.push(['logout'])
        return { success: true }
      },
      parseLink: async (payload) => {
        calls.push(['parseLink', payload])
        return { success: true, data: { kind: 'video' } }
      },
      loadStreamOptions: async (payload) => {
        calls.push(['loadStreamOptions', payload])
        return { success: true, data: { itemId: payload.itemId } }
      },
      startDownload: async (payload) => {
        calls.push(['startDownload', payload])
        return { success: true, data: { outputPaths: ['D:\\Downloads\\demo.mp4'] } }
      },
      cancelDownload() {
        calls.push(['cancelDownload'])
        return { success: true }
      },
      onStateChanged(handler) {
        changedHandler = handler
      }
    },
    emitState(state) {
      changedHandler(state)
    }
  }
}

function normalizeForAssertion(value) {
  return JSON.parse(JSON.stringify(value))
}

test('registerBilibiliDownloaderIpc wires downloader handlers, validates payloads, and pushes state changes', async () => {
  const sendCalls = []
  const downloader = createServiceStub()
  const { registerBilibiliDownloaderIpc, handlers } = loadBilibiliDownloaderIpcModule({
    bilibiliDownloaderService: downloader.service
  })

  const mainWindow = {
    isDestroyed: () => false,
    webContents: {
      send(channel, payload) {
        sendCalls.push([channel, payload])
      }
    }
  }

  registerBilibiliDownloaderIpc(() => mainWindow, {
    chooseOutputDirectory: async () => ({
      success: true,
      data: {
        canceled: false,
        path: 'D:\\Downloads'
      }
    })
  })

  assert.equal(typeof handlers['bilibili-downloader-get-session'], 'function')
  assert.equal(typeof handlers['bilibili-downloader-start-login'], 'function')
  assert.equal(typeof handlers['bilibili-downloader-poll-login'], 'function')
  assert.equal(typeof handlers['bilibili-downloader-logout'], 'function')
  assert.equal(typeof handlers['bilibili-downloader-parse-link'], 'function')
  assert.equal(typeof handlers['bilibili-downloader-load-stream-options'], 'function')
  assert.equal(typeof handlers['bilibili-downloader-start-download'], 'function')
  assert.equal(typeof handlers['bilibili-downloader-cancel-download'], 'function')
  assert.equal(typeof handlers['bilibili-downloader-select-output-directory'], 'function')

  await handlers['bilibili-downloader-get-session']()
  await handlers['bilibili-downloader-start-login']()
  await handlers['bilibili-downloader-poll-login']()
  await handlers['bilibili-downloader-logout']()
  await handlers['bilibili-downloader-parse-link']({}, { link: 'https://www.bilibili.com/video/BV1xK4y1m7aA' })
  await handlers['bilibili-downloader-load-stream-options']({}, { kind: 'video', itemId: 'page:1' })
  await handlers['bilibili-downloader-start-download']({}, { exportMode: 'merge-mp4', outputDirectory: 'D:\\Downloads' })
  await handlers['bilibili-downloader-cancel-download']()
  const outputDirectoryResult = await handlers['bilibili-downloader-select-output-directory']()

  downloader.emitState({
    loginSession: {
      isLoggedIn: false,
      nickname: null,
      avatarUrl: null,
      expiresAt: null
    },
    parsedLink: null,
    selection: {
      exportMode: null
    },
    streamOptionSummary: null,
    taskStage: 'cancelled',
    error: null
  })

  const invalidParseResult = await handlers['bilibili-downloader-parse-link']({}, { url: 'https://www.bilibili.com/video/BV1xK4y1m7aA' })
  const invalidDownloadResult = await handlers['bilibili-downloader-start-download']({}, { exportMode: 'invalid-mode' })

  assert.deepEqual(normalizeForAssertion(downloader.calls), [
    ['loadSession'],
    ['bootstrapQrLogin'],
    ['pollLogin'],
    ['logout'],
    ['parseLink', { url: 'https://www.bilibili.com/video/BV1xK4y1m7aA' }],
    ['loadStreamOptions', { kind: 'video', itemId: 'page:1' }],
    ['startDownload', { exportMode: 'merge-mp4', outputDirectory: 'D:\\Downloads' }],
    ['cancelDownload']
  ])
  assert.deepEqual(normalizeForAssertion(outputDirectoryResult), {
    success: true,
    data: {
      canceled: false,
      path: 'D:\\Downloads'
    }
  })
  assert.deepEqual(normalizeForAssertion(sendCalls), [[
    'bilibili-downloader-state-changed',
    {
      loginSession: {
        isLoggedIn: false,
        nickname: null,
        avatarUrl: null,
        expiresAt: null
      },
      parsedLink: null,
      selection: {
        exportMode: null
      },
      streamOptionSummary: null,
      taskStage: 'cancelled',
      error: null
    }
  ]])
  assert.equal(invalidParseResult.success, false)
  assert.equal(invalidDownloadResult.success, false)
})
