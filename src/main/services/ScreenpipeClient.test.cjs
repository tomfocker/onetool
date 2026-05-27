const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value))
}

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

test('health calls the configured api url with bearer auth', async () => {
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
  assert.equal(calls[0][1].Authorization, 'Bearer token')
  assert.equal(calls[0][1]['x-api-key'], undefined)
})

test('search calls the configured api url with bearer auth', async () => {
  const calls = []
  const { ScreenpipeClient } = loadModule()
  const client = new ScreenpipeClient({
    fetch: async (url, init) => {
      calls.push([url, init.headers])
      return {
        ok: true,
        json: async () => ({ data: [] })
      }
    }
  })

  const result = await client.search({
    apiUrl: 'http://localhost:3030',
    apiKey: 'token',
    startTime: '2026-05-26T00:00:00.000Z',
    endTime: '2026-05-26T23:59:59.999Z',
    contentTypes: ['ocr']
  })

  assert.equal(result.success, true)
  assert.match(calls[0][0], /^http:\/\/localhost:3030\/search\?/)
  assert.equal(calls[0][1].Authorization, 'Bearer token')
  assert.equal(calls[0][1]['x-api-key'], undefined)
})

test('search queries each requested content type separately before merging results', async () => {
  const calls = []
  const { ScreenpipeClient } = loadModule()
  const client = new ScreenpipeClient({
    fetch: async (url, init) => {
      calls.push([url, init.headers])
      const parsedUrl = new URL(url)
      const contentType = parsedUrl.searchParams.get('content_type')
      return {
        ok: true,
        json: async () => ({
          data: [
            {
              type: contentType === 'accessibility' ? 'UI' : 'OCR',
              content: {
                id: contentType,
                text: `${contentType} text`,
                app_name: 'OneTool',
                window_name: 'Memory diary',
                timestamp: contentType === 'accessibility'
                  ? '2026-05-26T01:00:00.000Z'
                  : '2026-05-26T01:01:00.000Z'
              }
            }
          ]
        })
      }
    }
  })

  const result = await client.search({
    apiUrl: 'http://localhost:3030',
    apiKey: 'token',
    startTime: '2026-05-26T00:00:00.000Z',
    endTime: '2026-05-26T23:59:59.999Z',
    contentTypes: ['accessibility', 'ocr'],
    limit: 3000
  })

  assert.equal(result.success, true)
  assert.deepEqual(calls.map(([url]) => new URL(url).searchParams.get('content_type')), [
    'accessibility',
    'ocr'
  ])
  assert.deepEqual(toPlainObject(result.data.map((item) => [item.contentType, item.text])), [
    ['accessibility', 'accessibility text'],
    ['ocr', 'ocr text']
  ])
})

test('search paginates a content type when ScreenPipe returns a full page', async () => {
  const calls = []
  const { ScreenpipeClient } = loadModule()
  const client = new ScreenpipeClient({
    fetch: async (url) => {
      calls.push(url)
      const parsedUrl = new URL(url)
      const offset = Number(parsedUrl.searchParams.get('offset') || '0')
      const rows = offset === 0
        ? [
            {
              type: 'UI',
              content: {
                id: 'latest-1',
                text: 'latest activity',
                app_name: 'Codex',
                window_name: 'Memory diary',
                timestamp: '2026-05-27T12:45:00.000Z'
              }
            },
            {
              type: 'UI',
              content: {
                id: 'latest-2',
                text: 'latest activity continued',
                app_name: 'Codex',
                window_name: 'Memory diary',
                timestamp: '2026-05-27T12:44:00.000Z'
              }
            }
          ]
        : [
            {
              type: 'UI',
              content: {
                id: 'morning-1',
                text: 'morning activity',
                app_name: 'Codex',
                window_name: 'Memory diary',
                timestamp: '2026-05-27T08:45:00.000Z'
              }
            }
          ]

      return {
        ok: true,
        json: async () => ({ data: rows })
      }
    }
  })

  const result = await client.search({
    apiUrl: 'http://localhost:3030',
    apiKey: 'token',
    startTime: '2026-05-26T16:00:00.000Z',
    endTime: '2026-05-27T15:59:59.999Z',
    contentTypes: ['accessibility'],
    limit: 2
  })

  assert.equal(result.success, true)
  assert.deepEqual(calls.map((url) => new URL(url).searchParams.get('offset')), ['0', '2'])
  assert.deepEqual(toPlainObject(result.data.map((item) => [item.id, item.text])), [
    ['accessibility-morning-1', 'morning activity'],
    ['accessibility-latest-2', 'latest activity continued'],
    ['accessibility-latest-1', 'latest activity']
  ])
})

test('search normalizes screenpipe payload items into MemoryDiaryItem records', async () => {
  const { ScreenpipeClient } = loadModule()
  const client = new ScreenpipeClient({
    fetch: async (url) => {
      const contentType = new URL(url).searchParams.get('content_type')
      return {
        ok: true,
        json: async () => ({
          data: contentType === 'ocr'
            ? [
                {
                  type: 'OCR',
                  content: {
                    frame_id: 42,
                    text: 'Implemented timeline',
                    app_name: 'Code',
                    window_name: 'memoryDiary.ts',
                    timestamp: '2026-05-26T01:00:00.000Z'
                  }
                }
              ]
            : [
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
      }
    }
  })

  const result = await client.search({
    apiUrl: 'http://localhost:3030',
    apiKey: 'token',
    startTime: '2026-05-26T00:00:00.000Z',
    endTime: '2026-05-26T23:59:59.999Z',
    contentTypes: ['ocr', 'accessibility']
  })

  assert.equal(result.success, true)
  assert.deepEqual(toPlainObject(result.data.map((item) => [item.id, item.contentType, item.appName, item.url, item.text])), [
    ['ocr-42', 'ocr', 'Code', '', 'Implemented timeline'],
    ['accessibility-a1', 'accessibility', 'Chrome', 'https://docs.screenpi.pe', 'Reviewed docs']
  ])
})

test('search treats ScreenPipe UI rows as accessibility records', async () => {
  const { ScreenpipeClient } = loadModule()
  const client = new ScreenpipeClient({
    fetch: async () => ({
      ok: true,
      json: async () => ({
        data: [
          {
            type: 'UI',
            content: {
              id: 'ui-1',
              text: 'Clean accessibility text',
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
    contentTypes: ['accessibility']
  })

  assert.equal(result.success, true)
  assert.deepEqual(toPlainObject(result.data.map((item) => [item.id, item.contentType, item.text])), [
    ['accessibility-ui-1', 'accessibility', 'Clean accessibility text']
  ])
})

test('search normalizes ScreenPipe input rows with text content and window title', async () => {
  const { ScreenpipeClient } = loadModule()
  const client = new ScreenpipeClient({
    fetch: async () => ({
      ok: true,
      json: async () => ({
        data: [
          {
            type: 'Input',
            content: {
              id: 'input-1',
              text_content: 'typed follow-up question',
              app_name: 'Codex',
              window_title: 'OneTool debugging',
              browser_url: '',
              timestamp: '2026-05-26T01:30:00.000Z'
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
    contentTypes: ['input']
  })

  assert.equal(result.success, true)
  assert.deepEqual(toPlainObject(result.data.map((item) => [item.id, item.contentType, item.windowName, item.text])), [
    ['input-input-1', 'input', 'OneTool debugging', 'typed follow-up question']
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
