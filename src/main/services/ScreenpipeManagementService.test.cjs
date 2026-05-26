const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
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
    if (specifier === 'fs') return overrides.fs || require('node:fs')
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
    process,
    URL,
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
        screenpipeExecutablePath: '',
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

test('getCliStatus uses configured screenpipe executable path', async () => {
  const state = createState()
  state.memoryDiary.config.screenpipeExecutablePath = 'C:\\Tools\\screenpipe.exe'
  const { ScreenpipeManagementService } = loadModule({
    childProcess: {
      execFile: (cmd, args, _options, callback) => {
        assert.equal(cmd, 'C:\\Tools\\screenpipe.exe')
        assert.deepEqual(Array.from(args), ['--version'])
        callback(null, 'screenpipe 1.2.3\n', '')
      },
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
  assert.equal(result.data.executablePath, 'C:\\Tools\\screenpipe.exe')
})

test('getCliStatus normalizes npm screenpipe.cmd to the Windows binary', async () => {
  const state = createState()
  state.memoryDiary.config.screenpipeExecutablePath = 'C:\\Users\\Admin\\AppData\\Roaming\\npm\\screenpipe.cmd'
  const expectedExecutablePath = 'C:\\Users\\Admin\\AppData\\Roaming\\npm\\node_modules\\screenpipe\\node_modules\\@screenpipe\\cli-win32-x64\\bin\\screenpipe.exe'
  const { ScreenpipeManagementService } = loadModule({
    childProcess: {
      execFile: (cmd, args, _options, callback) => {
        assert.equal(cmd, expectedExecutablePath)
        assert.deepEqual(Array.from(args), ['--version'])
        callback(null, 'screenpipe 1.2.3\n', '')
      },
      spawn: () => { throw new Error('not used') }
    },
    fs: {
      existsSync: (candidatePath) => candidatePath === expectedExecutablePath
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
  assert.equal(result.data.executablePath, expectedExecutablePath)
})

test('getCliStatus explains missing screenpipe executable', async () => {
  const state = createState()
  const error = Object.assign(new Error('spawn screenpipe ENOENT'), { code: 'ENOENT' })
  const { ScreenpipeManagementService } = loadModule({
    childProcess: {
      execFile: (_cmd, _args, _options, callback) => callback(error, '', ''),
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
  assert.equal(result.data.installed, false)
  assert.match(result.data.error, /找不到 ScreenPipe/)
  assert.match(state.memoryDiary.deploymentLogs[0].message, /screenpipe\.exe 路径/)
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

test('getRuntimeStatus reports healthy external ScreenPipe API', async () => {
  const state = createState()
  state.memoryDiary.config.apiKey = 'secret-token'
  const fetchCalls = []
  const { ScreenpipeManagementService } = loadModule({
    childProcess: {
      execFile: () => { throw new Error('not used') },
      spawn: () => { throw new Error('not used') }
    },
    storeService: {
      get: (key) => state[key],
      set: (key, value) => { state[key] = value }
    }
  })

  const service = new ScreenpipeManagementService({
    fetch: async (url, options) => {
      fetchCalls.push([url, options])
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'healthy',
          last_frame_timestamp: '2026-05-26T19:12:07+08:00',
          pipeline: {
            frames_captured: 62,
            frames_db_written: 62
          },
          ui_recorder: {
            running: true,
            events_inserted: 115
          }
        })
      }
    }
  })

  const result = await service.getRuntimeStatus()

  assert.equal(result.success, true)
  assert.equal(result.data.state, 'external-running')
  assert.equal(result.data.apiReachable, true)
  assert.equal(result.data.lastCaptureAt, '2026-05-26T19:12:07+08:00')
  assert.equal(result.data.todayItemCount, 177)
  assert.equal(result.data.message, 'ScreenPipe API healthy')
  assert.equal(fetchCalls[0][0], 'http://localhost:3030/health')
  assert.equal(fetchCalls[0][1].headers['x-api-key'], 'secret-token')
})

test('installLatest installs screenpipe with npm and stores global executable path', async () => {
  const writes = []
  const state = createState()
  let spawnArgs = null
  const execCalls = []
  const expectedExecutablePath = 'C:\\Users\\Admin\\AppData\\Roaming\\npm\\node_modules\\screenpipe\\node_modules\\@screenpipe\\cli-win32-x64\\bin\\screenpipe.exe'
  const { ScreenpipeManagementService } = loadModule({
    childProcess: {
      execFile: (cmd, args, _options, callback) => {
        execCalls.push([cmd, Array.from(args)])
        if (Array.from(args).join(' ') === 'prefix -g') {
          callback(null, 'C:\\Users\\Admin\\AppData\\Roaming\\npm\n', '')
          return
        }

        assert.equal(cmd, expectedExecutablePath)
        assert.deepEqual(Array.from(args), ['--version'])
        callback(null, 'screenpipe 0.3.346\n', '')
      },
      spawn: (cmd, args) => {
        assert.equal(cmd, 'npm.cmd')
        spawnArgs = Array.from(args)
        const child = new EventEmitter()
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        setImmediate(() => {
          child.stdout.emit('data', 'installed screenpipe\n')
          child.emit('close', 0)
        })
        return child
      }
    },
    fs: {
      existsSync: (candidatePath) => candidatePath === expectedExecutablePath
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
  const result = await service.installLatest()

  assert.equal(result.success, true)
  assert.deepEqual(spawnArgs, [
    'install',
    '-g',
    'screenpipe@latest',
    '--registry=https://registry.npmjs.org'
  ])
  assert.deepEqual(execCalls, [
    ['npm.cmd', ['prefix', '-g']],
    [expectedExecutablePath, ['--version']]
  ])
  assert.equal(result.data.config.screenpipeExecutablePath, expectedExecutablePath)
  assert.equal(writes.at(-1)[1].config.screenpipeExecutablePath, expectedExecutablePath)
})

test('installLatest reports npm installation failures', async () => {
  const state = createState()
  const { ScreenpipeManagementService } = loadModule({
    childProcess: {
      execFile: (_cmd, args, _options, callback) => {
        assert.deepEqual(Array.from(args), ['prefix', '-g'])
        callback(null, 'C:\\Users\\Admin\\AppData\\Roaming\\npm\n', '')
      },
      spawn: () => {
        const child = new EventEmitter()
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        setImmediate(() => {
          child.stderr.emit('data', 'network failed\n')
          child.emit('close', 1)
        })
        return child
      }
    },
    storeService: {
      get: (key) => state[key],
      set: (key, value) => { state[key] = value }
    }
  })

  const service = new ScreenpipeManagementService()
  const result = await service.installLatest()

  assert.equal(result.success, false)
  assert.match(result.error, /安装失败/)
  assert.match(state.memoryDiary.deploymentLogs[0].message, /network failed/)
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
      execFile: (_cmd, args, _options, callback) => {
        assert.deepEqual(Array.from(args), ['record', '--help'])
        callback(null, 'Usage: screenpipe record\n', '')
      },
      spawn: (_cmd, args) => {
        assert.deepEqual(Array.from(args), ['record', '--disable-telemetry', '--port', '3030', '--disable-audio'])
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

test('start falls back to legacy launch when record subcommand is unavailable', async () => {
  const state = createState()
  const recordError = new Error("error: unrecognized subcommand 'record'")
  const child = {
    on() {},
    kill() {}
  }
  const { ScreenpipeManagementService } = loadModule({
    childProcess: {
      execFile: (_cmd, args, _options, callback) => {
        assert.deepEqual(Array.from(args), ['record', '--help'])
        callback(recordError, '', "error: unrecognized subcommand 'record'")
      },
      spawn: (_cmd, args) => {
        assert.deepEqual(Array.from(args), [
          '--fps',
          '1',
          '--ocr-engine',
          'windows-native',
          '--disable-telemetry',
          '--disable-audio'
        ])
        return child
      }
    },
    storeService: {
      get: (key) => state[key],
      set: (key, value) => { state[key] = value }
    }
  })

  const service = new ScreenpipeManagementService()
  const result = await service.start()

  assert.equal(result.success, true)
  assert.equal(result.data.state, 'starting')
})

test('start uses configured screenpipe executable path', async () => {
  const state = createState()
  state.memoryDiary.config.screenpipeExecutablePath = 'C:\\Tools\\screenpipe.exe'
  const child = {
    on() {},
    kill() {}
  }
  const { ScreenpipeManagementService } = loadModule({
    childProcess: {
      execFile: (cmd, args, _options, callback) => {
        assert.equal(cmd, 'C:\\Tools\\screenpipe.exe')
        assert.deepEqual(Array.from(args), ['record', '--help'])
        callback(null, 'Usage: screenpipe record\n', '')
      },
      spawn: (cmd, args) => {
        assert.equal(cmd, 'C:\\Tools\\screenpipe.exe')
        assert.deepEqual(Array.from(args), ['record', '--disable-telemetry', '--port', '3030', '--disable-audio'])
        return child
      }
    },
    storeService: {
      get: (key) => state[key],
      set: (key, value) => { state[key] = value }
    }
  })

  const service = new ScreenpipeManagementService()
  const result = await service.start()

  assert.equal(result.success, true)
  assert.equal(result.data.state, 'starting')
})

test('start passes the configured api port to modern screenpipe', async () => {
  const state = createState()
  state.memoryDiary.config.apiUrl = 'http://127.0.0.1:3059'
  const child = {
    on() {},
    kill() {}
  }
  const { ScreenpipeManagementService } = loadModule({
    childProcess: {
      execFile: (_cmd, args, _options, callback) => {
        assert.deepEqual(Array.from(args), ['record', '--help'])
        callback(null, 'Usage: screenpipe record\n', '')
      },
      spawn: (_cmd, args) => {
        assert.deepEqual(Array.from(args), ['record', '--disable-telemetry', '--port', '3059', '--disable-audio'])
        return child
      }
    },
    storeService: {
      get: (key) => state[key],
      set: (key, value) => { state[key] = value }
    }
  })

  const service = new ScreenpipeManagementService()
  const result = await service.start()

  assert.equal(result.success, true)
  assert.equal(result.data.state, 'starting')
})
