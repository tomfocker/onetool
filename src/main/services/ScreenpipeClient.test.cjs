const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadModule() {
  const filePath = path.join(__dirname, 'ScreenpipeClient.ts')
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
    if (specifier === '../../shared/memoryDiary') {
      return require(path.join(__dirname, '../../shared/memoryDiary.ts'))
    }
    if (specifier === '../../shared/types') {
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
    URL,
    URLSearchParams,
    fetch,
    setTimeout,
    clearTimeout
  }, { filename: filePath })

  return module.exports
}

test('health calls the configured api url with x-api-key', async () => {
  const calls = []
  const { ScreenpipeClient } = loadModule()
  const client = new ScreenpipeClient({
    fetch: async (url, init) => {
      calls.push([url, init.headers])
      return {
        ok: true,
        json: async () => ({ status: 'ok' })
      }
    }
  })

  const result = await client.health({ apiUrl: 'http://localhost:3030', apiKey: 'token' })

  assert.equal(result.success, true)
  assert.equal(calls[0][0], 'http://localhost:3030/health')
  assert.equal(calls[0][1]['x-api-key'], 'token')
})

test('search normalizes screenpipe payload items into MemoryDiaryItem records', async () => {
  const { ScreenpipeClient } = loadModule()
  const client = new ScreenpipeClient({
    fetch: async () => ({
      ok: true,
      json: async () => ({
        data: [
          {
            type: 'OCR',
            content: {
              frame_id: 42,
              text: 'Implemented timeline',
              app_name: 'Code',
              window_name: 'memoryDiary.ts',
              timestamp: '2026-05-26T01:00:00.000Z'
            }
          },
          {
            type: 'Accessibility',
            content: {
              id: 'a1',
              text: 'Reviewed docs',
              app_name: 'Chrome',
              window_name: 'ScreenPipe docs',
              browser_url: 'https://docs.screenpi.pe',
              timestamp: '2026-05-26T01:15:00.000Z'
            }
          }
        ]
      })
    })
  })

  const result = await client.search({
    apiUrl: 'http://localhost:3030',
    apiKey: 'token',
    startTime: '2026-05-26T00:00:00.000Z',
    endTime: '2026-05-26T23:59:59.999Z',
    contentTypes: ['ocr', 'accessibility']
  })

  assert.equal(result.success, true)
  assert.deepEqual(result.data.map((item) => [item.id, item.contentType, item.appName, item.url, item.text]), [
    ['ocr-42', 'ocr', 'Code', '', 'Implemented timeline'],
    ['accessibility-a1', 'accessibility', 'Chrome', 'https://docs.screenpi.pe', 'Reviewed docs']
  ])
})

test('search reports non-ok responses as user-readable errors', async () => {
  const { ScreenpipeClient } = loadModule()
  const client = new ScreenpipeClient({
    fetch: async () => ({
      ok: false,
      status: 401,
      text: async () => 'invalid api key'
    })
  })

  const result = await client.search({
    apiUrl: 'http://localhost:3030',
    apiKey: 'bad',
    startTime: '2026-05-26T00:00:00.000Z',
    endTime: '2026-05-26T23:59:59.999Z',
    contentTypes: ['ocr']
  })

  assert.equal(result.success, false)
  assert.match(result.error, /401/)
  assert.match(result.error, /invalid api key/)
})
