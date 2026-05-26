const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadModule(overrides = {}) {
  const filePath = path.join(__dirname, 'ScreenpipeManagementService.ts')
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
    if (specifier === 'child_process') return overrides.childProcess
    if (specifier === './StoreService') return { storeService: overrides.storeService }
    if (specifier === '../../shared/memoryDiary') return require(path.join(__dirname, '../../shared/memoryDiary.ts'))
    if (specifier === '../../shared/types') return {}
    return require(specifier)
  }

  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require: customRequire,
    __dirname,
    __filename: filePath,
    console,
    Buffer,
    setTimeout,
    clearTimeout
  }, { filename: filePath })
  return module.exports
}

function createState() {
  return {
    memoryDiary: {
      config: {
        apiUrl: 'http://localhost:3030',
        apiKey: '',
        enabledContentTypes: ['accessibility', 'ocr'],
        includeAudio: false,
        includeInput: false,
        sensitiveAppPatterns: [],
        sensitiveWindowPatterns: [],
        timelineBucketMinutes: 15,
        diaryStyle: 'worklog'
      },
      deploymentLogs: [],
      diaryHistory: []
    }
  }
}

test('getCliStatus reports installed version from screenpipe --version', async () => {
  const state = createState()
  const { ScreenpipeManagementService } = loadModule({
    childProcess: {
      execFile: (_cmd, _args, _options, callback) => callback(null, 'screenpipe 1.2.3\n', ''),
      spawn: () => { throw new Error('not used') }
    },
    storeService: {
      get: (key) => state[key],
      set: (key, value) => { state[key] = value }
    }
  })

  const service = new ScreenpipeManagementService()
  const result = await service.getCliStatus()

  assert.equal(result.success, true)
  assert.equal(result.data.installed, true)
  assert.equal(result.data.version, 'screenpipe 1.2.3')
})

test('getAuthToken runs screenpipe auth token and stores api key', async () => {
  const writes = []
  const state = createState()
  const { ScreenpipeManagementService } = loadModule({
    childProcess: {
      execFile: (_cmd, args, _options, callback) => {
        assert.deepEqual(Array.from(args), ['auth', 'token'])
        callback(null, 'secret-token\n', '')
      },
      spawn: () => { throw new Error('not used') }
    },
    storeService: {
      get: (key) => state[key],
      set: (key, value) => {
        writes.push([key, value])
        state[key] = value
      }
    }
  })

  const service = new ScreenpipeManagementService()
  const result = await service.getAuthToken()

  assert.equal(result.success, true)
  assert.equal(result.data.apiKey, 'secret-token')
  assert.equal(writes.at(-1)[1].config.apiKey, 'secret-token')
})

test('start and stop only manage the process launched by onetool', async () => {
  const state = createState()
  let killed = false
  const child = {
    on() {},
    kill() {
      killed = true
    }
  }
  const { ScreenpipeManagementService } = loadModule({
    childProcess: {
      execFile: () => { throw new Error('not used') },
      spawn: (_cmd, args) => {
        assert.deepEqual(Array.from(args), ['record'])
        return child
      }
    },
    storeService: {
      get: (key) => state[key],
      set: (key, value) => { state[key] = value }
    }
  })

  const service = new ScreenpipeManagementService()
  const startResult = await service.start()
  const stopResult = await service.stop()

  assert.equal(startResult.success, true)
  assert.equal(startResult.data.state, 'starting')
  assert.equal(stopResult.success, true)
  assert.equal(stopResult.data.state, 'stopped')
  assert.equal(killed, true)
})
