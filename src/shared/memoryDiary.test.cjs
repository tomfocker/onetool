const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value))
}

function loadMemoryDiaryModule() {
  const filePath = path.join(__dirname, 'memoryDiary.ts')
  const source = fs.readFileSync(filePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    },
    fileName: filePath
  }).outputText

  const module = { exports: {} }
  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require,
    __dirname,
    __filename: filePath,
    console,
    process,
    Buffer
  }, { filename: filePath })

  return module.exports
}

test('createDefaultMemoryDiaryStoredState uses privacy-conservative defaults', () => {
  const memoryDiary = loadMemoryDiaryModule()
  const state = memoryDiary.createDefaultMemoryDiaryStoredState()

  assert.equal(state.config.apiUrl, 'http://localhost:3030')
  assert.equal(state.config.screenpipeExecutablePath, '')
  assert.equal(state.config.includeAudio, false)
  assert.equal(state.config.includeInput, false)
  assert.deepEqual(toPlainObject(state.config.enabledContentTypes), ['accessibility', 'ocr'])
  assert.equal(state.config.timelineBucketMinutes, 15)
  assert.equal(state.diaryHistory.length, 0)
})

test('filterMemoryDiaryItems removes disabled content types and sensitive windows', () => {
  const memoryDiary = loadMemoryDiaryModule()
  const config = {
    ...memoryDiary.createDefaultMemoryDiaryConfig(),
    sensitiveAppPatterns: ['1Password'],
    sensitiveWindowPatterns: ['支付', 'password']
  }
  const items = [
    {
      id: '1',
      timestamp: '2026-05-26T01:00:00.000Z',
      contentType: 'ocr',
      appName: 'Code',
      windowName: 'README.md',
      url: '',
      text: 'implemented timeline'
    },
    {
      id: '2',
      timestamp: '2026-05-26T01:01:00.000Z',
      contentType: 'audio',
      appName: 'Meet',
      windowName: 'Standup',
      url: '',
      text: 'private call'
    },
    {
      id: '3',
      timestamp: '2026-05-26T01:02:00.000Z',
      contentType: 'ocr',
      appName: '1Password',
      windowName: 'Vault',
      url: '',
      text: 'secret'
    },
    {
      id: '4',
      timestamp: '2026-05-26T01:03:00.000Z',
      contentType: 'accessibility',
      appName: 'Chrome',
      windowName: '支付页面',
      url: '',
      text: 'secret'
    }
  ]

  assert.deepEqual(toPlainObject(memoryDiary.filterMemoryDiaryItems(items, config).map((item) => item.id)), ['1'])
})

test('createMemoryDiaryBucketStart floors timestamps to bucket boundaries', () => {
  const memoryDiary = loadMemoryDiaryModule()

  assert.equal(
    memoryDiary.createMemoryDiaryBucketStart('2026-05-26T09:17:32.000+08:00', 15),
    '2026-05-26T01:15:00.000Z'
  )
})
