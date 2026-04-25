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
  const events = new EventEmitter()

  return {
    stdout,
    stderr,
    pid: 9876,
    on(eventName, handler) {
      events.on(eventName, handler)
      return this
    },
    emit(eventName, ...args) {
      events.emit(eventName, ...args)
    }
  }
}

function loadTableOcrServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'TableOcrService.ts')
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
          getPath(name) {
            if (name === 'downloads') return 'D:\\Downloads'
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

    if (specifier === 'os' || specifier === 'node:os') {
      return overrides.osModule || {
        tmpdir: () => 'C:\\Temp'
      }
    }

    if (specifier === 'path' || specifier === 'node:path') {
      return require(specifier)
    }

    if (specifier === '../utils/logger') {
      return {
        logger: overrides.logger || {
          info() {},
          warn() {},
          error() {}
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

    if (specifier === '../../shared/tableOcr') {
      return require(path.join(__dirname, '../../shared/tableOcr.ts'))
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
    __dirname: overrides.moduleDirname || __dirname,
    __filename: filePath,
    console,
    process,
    Buffer,
    setTimeout,
    clearTimeout
  }, { filename: filePath })

  return module.exports
}

test('getStatus runs the Python dependency check and returns missing packages', async () => {
  const child = createMockChildProcess()
  const spawnCalls = []
  const { TableOcrService } = loadTableOcrServiceModule({
    moduleDirname: 'D:\\code\\onetool\\out\\main',
    spawn(command, args, options) {
      spawnCalls.push([command, args, options])
      return child
    }
  })

  const service = new TableOcrService({
    runtimeRoot: 'D:\\code\\onetool\\resources\\table-ocr',
    pathExists: (targetPath) => {
      const normalized = String(targetPath)
      return !normalized.includes('resources\\table-ocr\\python') && !normalized.includes('table-ocr-runtime\\python')
    }
  })

  const statusPromise = service.getStatus()
  child.stdout.emit('data', Buffer.from('__ONETOOL_JSON__{"event":"completed","message":"checked","ready":false,"missingPackages":["paddlex","openpyxl"]}\n'))
  child.emit('close', 0, null)

  const result = await statusPromise

  assert.equal(result.success, true)
  assert.equal(result.data.ready, false)
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.missingPackages)), ['paddlex', 'openpyxl'])
  assert.equal(spawnCalls[0][0], 'D:\\code\\onetool\\resources\\model-download\\python\\python.exe')
  assert.deepEqual([...spawnCalls[0][1]], [
    '-u',
    'D:\\code\\onetool\\resources\\table-ocr\\table_ocr.py',
    '--check'
  ])
})

test('getStatus resolves table OCR resources from the project resources directory in preview mode', async () => {
  const child = createMockChildProcess()
  const spawnCalls = []
  const { TableOcrService } = loadTableOcrServiceModule({
    moduleDirname: 'D:\\code\\onetool\\out\\main',
    spawn(command, args, options) {
      spawnCalls.push([command, args, options])
      return child
    },
    appModule: {
      isPackaged: false,
      getPath(name) {
        if (name === 'userData') return 'D:\\AppData'
        if (name === 'downloads') return 'D:\\Downloads'
        return 'D:\\AppData'
      }
    }
  })

  const service = new TableOcrService({
    pathExists: (targetPath) => {
      const normalized = String(targetPath)
      return (
        normalized.startsWith('D:\\code\\onetool\\resources') &&
        !normalized.includes('resources\\table-ocr\\python') &&
        !normalized.includes('table-ocr-runtime\\python')
      )
    }
  })

  const statusPromise = service.getStatus()
  child.stdout.emit('data', Buffer.from('__ONETOOL_JSON__{"event":"completed","message":"checked","ready":true,"missingPackages":[]}\n'))
  child.emit('close', 0, null)

  const result = await statusPromise

  assert.equal(result.success, true)
  assert.equal(spawnCalls[0][0], 'D:\\code\\onetool\\resources\\model-download\\python\\python.exe')
  assert.equal(spawnCalls[0][1][1], 'D:\\code\\onetool\\resources\\table-ocr\\table_ocr.py')
})

test('prepareRuntime copies a writable Python runtime and starts the dependency installer', async () => {
  const child = createMockChildProcess()
  const spawnCalls = []
  const mkdirCalls = []
  const copyCalls = []
  let userPythonExists = false
  let readyMarkerExists = false
  const { TableOcrService } = loadTableOcrServiceModule({
    spawn(command, args, options) {
      spawnCalls.push([command, args, options])
      return child
    },
    fsPromises: {
      mkdir: async (...args) => {
        mkdirCalls.push(args)
      },
      cp: async (...args) => {
        copyCalls.push(args)
        userPythonExists = true
      }
    },
    fsModule: {
      ...fs,
      writeFileSync: (targetPath) => {
        if (String(targetPath).endsWith('D:\\UserData\\table-ocr-runtime\\.runtime-ready')) {
          readyMarkerExists = true
        }
      },
      unlinkSync: () => {
        readyMarkerExists = false
      }
    }
  })

  const service = new TableOcrService({
    runtimeRoot: 'D:\\code\\onetool\\resources\\table-ocr',
    userRuntimeRoot: 'D:\\UserData\\table-ocr-runtime',
    pathExists: (targetPath) => {
      const normalized = String(targetPath)
      return (
        (userPythonExists && normalized.endsWith('D:\\UserData\\table-ocr-runtime\\python\\python.exe')) ||
        (readyMarkerExists && normalized.endsWith('D:\\UserData\\table-ocr-runtime\\.runtime-ready')) ||
        normalized.endsWith('resources\\model-download\\python\\python.exe') ||
        normalized.endsWith('resources\\table-ocr\\table_ocr.py') ||
        normalized.endsWith('resources\\table-ocr\\install_runtime.py')
      )
    },
    now: () => new Date('2026-04-25T01:00:00.000Z').getTime(),
    createId: () => 'install-log'
  })

  const states = []
  service.onStateChanged((state) => {
    states.push(JSON.parse(JSON.stringify(state)))
  })

  const started = await service.prepareRuntime()
  await new Promise((resolve) => setImmediate(resolve))
  child.stdout.emit('data', Buffer.from('__ONETOOL_JSON__{"event":"log","level":"progress","message":"installing packages"}\n'))
  child.stdout.emit('data', Buffer.from('__ONETOOL_JSON__{"event":"completed","level":"success","message":"runtime ready"}\n'))
  child.emit('close', 0, null)

  assert.equal(started.success, true)
  assert.equal(started.data.installStatus, 'running')
  assert.equal(started.data.ready, false)
  assert.deepEqual(JSON.parse(JSON.stringify(mkdirCalls)), [['D:\\UserData\\table-ocr-runtime\\python', { recursive: true }]])
  assert.deepEqual(JSON.parse(JSON.stringify(copyCalls)), [[
    'D:\\code\\onetool\\resources\\model-download\\python',
    'D:\\UserData\\table-ocr-runtime\\python',
    { recursive: true }
  ]])
  assert.equal(spawnCalls[0][0], 'D:\\UserData\\table-ocr-runtime\\python\\python.exe')
  assert.deepEqual([...spawnCalls[0][1]], [
    '-u',
    'D:\\code\\onetool\\resources\\table-ocr\\install_runtime.py',
    '--mirror',
    'cn'
  ])
  assert.equal(states.at(-1).installStatus, 'success')
  assert.equal(states.at(-1).ready, true)
  assert.equal(states.at(-1).lastError, null)
  assert.equal(states.at(-1).logs.at(-1).message, 'runtime ready')
})

test('prepareRuntime does not mark a partially copied runtime as ready after install failure', async () => {
  const child = createMockChildProcess()
  let userPythonExists = false
  const { TableOcrService } = loadTableOcrServiceModule({
    spawn() {
      return child
    },
    fsPromises: {
      mkdir: async () => undefined,
      cp: async () => {
        userPythonExists = true
      }
    }
  })

  const service = new TableOcrService({
    runtimeRoot: 'D:\\code\\onetool\\resources\\table-ocr',
    userRuntimeRoot: 'D:\\UserData\\table-ocr-runtime',
    pathExists: (targetPath) => {
      const normalized = String(targetPath)
      return (
        (userPythonExists && normalized.endsWith('D:\\UserData\\table-ocr-runtime\\python\\python.exe')) ||
        normalized.endsWith('resources\\model-download\\python\\python.exe') ||
        normalized.endsWith('resources\\table-ocr\\table_ocr.py') ||
        normalized.endsWith('resources\\table-ocr\\install_runtime.py')
      )
    },
    createId: () => 'install-log'
  })

  const states = []
  service.onStateChanged((state) => {
    states.push(JSON.parse(JSON.stringify(state)))
  })

  const started = await service.prepareRuntime()
  await new Promise((resolve) => setImmediate(resolve))
  child.stdout.emit('data', Buffer.from('__ONETOOL_JSON__{"event":"failed","level":"error","message":"pip download failed"}\n'))
  child.emit('close', 1, null)

  assert.equal(started.success, true)
  assert.equal(states.at(-1).installStatus, 'error')
  assert.equal(states.at(-1).ready, false)
  assert.equal(states.at(-1).lastError, 'pip download failed')
})

test('recognize spawns the bundled table OCR runtime and returns the xlsx output path', async () => {
  const child = createMockChildProcess()
  const spawnCalls = []
  const { TableOcrService } = loadTableOcrServiceModule({
    spawn(command, args, options) {
      spawnCalls.push([command, args, options])
      return child
    }
  })

  const service = new TableOcrService({
    runtimeRoot: 'D:\\code\\onetool\\resources\\table-ocr',
    pathExists: (targetPath) => {
      const normalized = String(targetPath)
      return !normalized.includes('resources\\table-ocr\\python') && !normalized.includes('table-ocr-runtime\\python')
    }
  })

  const recognizePromise = service.recognize({
    inputPath: 'D:\\Pictures\\table.png',
    outputDirectory: 'D:\\Exports'
  })
  await new Promise((resolve) => setImmediate(resolve))
  child.stdout.emit('data', Buffer.from('__ONETOOL_JSON__{"event":"log","level":"info","message":"recognizing"}\n'))
  child.stdout.emit('data', Buffer.from('__ONETOOL_JSON__{"event":"completed","message":"done","outputPath":"D:\\\\Exports\\\\table.xlsx","htmlPath":"D:\\\\Exports\\\\table.html","jsonPath":"D:\\\\Exports\\\\table.json"}\n'))
  child.emit('close', 0, null)

  const result = await recognizePromise

  assert.equal(result.success, true)
  assert.deepEqual(JSON.parse(JSON.stringify(result.data)), {
    outputPath: 'D:\\Exports\\table.xlsx',
    outputDirectory: 'D:\\Exports',
    htmlPath: 'D:\\Exports\\table.html',
    jsonPath: 'D:\\Exports\\table.json'
  })
  assert.equal(spawnCalls[0][0], 'D:\\code\\onetool\\resources\\model-download\\python\\python.exe')
  assert.deepEqual([...spawnCalls[0][1]], [
    '-u',
    'D:\\code\\onetool\\resources\\table-ocr\\table_ocr.py',
    '--input',
    'D:\\Pictures\\table.png',
    '--output-dir',
    'D:\\Exports'
  ])
})

test('recognize rejects requests without image input', async () => {
  const { TableOcrService } = loadTableOcrServiceModule()
  const service = new TableOcrService({
    runtimeRoot: 'D:\\code\\onetool\\resources\\table-ocr',
    pathExists: (targetPath) => {
      const normalized = String(targetPath)
      return !normalized.includes('resources\\table-ocr\\python') && !normalized.includes('table-ocr-runtime\\python')
    }
  })

  const result = await service.recognize({
    outputDirectory: 'D:\\Exports'
  })

  assert.equal(result.success, false)
  assert.match(result.error, /请选择图片/)
})
