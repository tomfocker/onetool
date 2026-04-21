const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const ts = require('typescript')

function createMockChildProcess() {
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const processEvents = new EventEmitter()

  return {
    stdout,
    stderr,
    pid: 4321,
    killCalls: [],
    kill(signal) {
      this.killCalls.push(signal ?? 'SIGTERM')
      processEvents.emit('close', null, signal ?? 'SIGTERM')
      return true
    },
    on(eventName, handler) {
      processEvents.on(eventName, handler)
      return this
    },
    emit(eventName, ...args) {
      processEvents.emit(eventName, ...args)
    }
  }
}

function loadModelDownloadServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'ModelDownloadService.ts')
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
        app: overrides.appModule || {
          isPackaged: false,
          getPath: (name) => {
            if (name === 'downloads') {
              return 'D:\\Downloads'
            }
            return 'D:\\AppData'
          }
        },
        shell: overrides.shellModule || {
          openPath: async () => ''
        }
      }
    }

    if (specifier === 'child_process') {
      return {
        spawn: overrides.spawn || (() => {
          throw new Error('spawn stub not provided')
        })
      }
    }

    if (specifier === 'fs' || specifier === 'node:fs') {
      return overrides.fsModule || require(specifier)
    }

    if (specifier === 'fs/promises' || specifier === 'node:fs/promises') {
      return overrides.fsPromises || {
        mkdir: async () => undefined
      }
    }

    if (specifier === 'path' || specifier === 'node:path') {
      return overrides.pathModule || require(specifier)
    }

    if (specifier === '../utils/logger') {
      return {
        logger: overrides.logger || {
          info() {},
          warn() {},
          error() {},
          debug() {}
        }
      }
    }

    if (specifier === './ProcessRegistry') {
      return {
        processRegistry: overrides.processRegistry || {
          register() {}
        }
      }
    }

    if (specifier === '../../shared/modelDownload') {
      return require(path.join(__dirname, '../../shared/modelDownload.ts'))
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
    process,
    Buffer,
    setTimeout,
    clearTimeout
  }, { filename: filePath })

  return module.exports
}

test('startDownload validates the request before launching Python', async () => {
  const { ModelDownloadService } = loadModelDownloadServiceModule()
  const service = new ModelDownloadService({
    runtimeRoot: 'D:\\code\\onetool\\resources\\model-download',
    pathExists: () => true
  })

  const result = await service.startDownload({
    platform: 'huggingface',
    repoId: '',
    filePath: '',
    savePath: 'D:\\Downloads',
    hfToken: '',
    useHfMirror: true
  })

  assert.equal(result.success, false)
  assert.match(result.error, /仓库 ID/)
})

test('startDownload spawns the bundled runtime and promotes a successful task to success state', async () => {
  const child = createMockChildProcess()
  const spawnCalls = []
  const stateSnapshots = []
  const { ModelDownloadService } = loadModelDownloadServiceModule({
    spawn(command, args, options) {
      spawnCalls.push([command, args, options])
      return child
    }
  })

  const service = new ModelDownloadService({
    runtimeRoot: 'D:\\code\\onetool\\resources\\model-download',
    pathExists: () => true,
    createId: (() => {
      let index = 0
      return () => `log-${++index}`
    })()
  })
  service.onStateChanged((state) => {
    stateSnapshots.push(state)
  })

  const started = await service.startDownload({
    platform: 'huggingface',
    repoId: 'Qwen/Qwen2.5-0.5B-Instruct',
    filePath: 'config.json',
    savePath: 'D:\\Downloads',
    hfToken: 'hf_token',
    useHfMirror: true
  })

  assert.equal(started.success, true)
  assert.equal(spawnCalls.length, 1)
  assert.equal(spawnCalls[0][0], 'D:\\code\\onetool\\resources\\model-download\\python\\python.exe')
  assert.deepEqual([...spawnCalls[0][1]], [
    '-u',
    'D:\\code\\onetool\\resources\\model-download\\downloader.py',
    '--platform',
    'huggingface',
    '--repo-id',
    'Qwen/Qwen2.5-0.5B-Instruct',
    '--save-path',
    'D:\\Downloads',
    '--file-path',
    'config.json',
    '--hf-token',
    'hf_token',
    '--hf-mirror'
  ])

  child.stdout.emit('data', Buffer.from('__ONETOOL_JSON__{"event":"log","level":"info","message":"downloading"}\n'))
  child.stdout.emit('data', Buffer.from('__ONETOOL_JSON__{"event":"completed","message":"done","outputPath":"D:\\\\Downloads\\\\Qwen_Qwen2.5-0.5B-Instruct"}\n'))
  child.emit('close', 0, null)

  const latestState = service.getState().data
  assert.equal(latestState.status, 'success')
  assert.equal(latestState.lastOutputPath, 'D:\\Downloads\\Qwen_Qwen2.5-0.5B-Instruct')
  assert.equal(latestState.logs.at(-1).level, 'success')
  assert.equal(stateSnapshots.some((item) => item.status === 'running'), true)
})

test('cancelDownload terminates the active process and marks the state as cancelled', async () => {
  const child = createMockChildProcess()
  const { ModelDownloadService } = loadModelDownloadServiceModule({
    spawn() {
      return child
    }
  })

  const service = new ModelDownloadService({
    runtimeRoot: 'D:\\code\\onetool\\resources\\model-download',
    pathExists: () => true
  })

  await service.startDownload({
    platform: 'modelscope',
    repoId: 'qwen/Qwen2.5-0.5B-Instruct',
    filePath: '',
    savePath: 'D:\\Downloads',
    hfToken: '',
    useHfMirror: false
  })

  const result = await service.cancelDownload()

  assert.equal(result.success, true)
  assert.deepEqual(child.killCalls, ['SIGTERM'])
  assert.equal(service.getState().data.status, 'cancelled')
})
