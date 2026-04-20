const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadDevEnvironmentServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'DevEnvironmentService.ts')
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
  const execSync = overrides.execSync || (() => { throw new Error('missing command') })
  const spawn = overrides.spawn || (() => ({ stdout: { on() {} }, stderr: { on() {} }, on() {} }))
  const logger = overrides.logger || { info() {}, warn() {}, error() {} }
  const wslService = overrides.wslService || {
    getOverview: async () => ({ success: true, data: { available: false, distros: [], defaultDistro: null } })
  }

  const customRequire = (specifier) => {
    if (specifier === 'child_process') {
      return { execSync, spawn }
    }

    if (specifier === '../utils/logger') {
      return { logger }
    }

    if (specifier === './wslUtils') {
      return {}
    }

    if (specifier === './WslService' || specifier === './WslService.ts') {
      return { wslService }
    }

    if (specifier === '../../shared/devEnvironment') {
      return require(path.join(__dirname, '../../shared/devEnvironment.ts'))
    }

    if (specifier === '../../shared/types') {
      return {}
    }

    if (specifier === 'electron') {
      return { BrowserWindow: class BrowserWindowMock {} }
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

test('inspectAll returns installed linked and external environment states with parsed versions', async () => {
  const commandOutputs = {
    'winget --version': 'v1.8.1911\r\n',
    'node --version': 'v22.15.0\r\n',
    'where.exe node': 'C:\\Program Files\\nodejs\\node.exe\r\n',
    'npm --version': '10.9.2\r\n',
    'where.exe npm': 'C:\\Program Files\\nodejs\\npm.cmd\r\n',
    'git --version': 'git version 2.49.0.windows.1\r\n',
    'where.exe git': 'C:\\Program Files\\Git\\cmd\\git.exe\r\n',
    'python --version': 'Python 3.12.9\r\n',
    'where.exe python': 'C:\\Python312\\python.exe\r\n',
    'pip --version': 'pip 24.0 from C:\\Python312\\Lib\\site-packages\\pip (python 3.12)\r\n',
    'where.exe pip': 'C:\\Python312\\Scripts\\pip.exe\r\n',
    'go version': 'go version go1.24.2 windows/amd64\r\n',
    'where.exe go': 'C:\\Go\\bin\\go.exe\r\n',
    'java -version 2>&1': 'openjdk version "17.0.14" 2025-01-21\r\n',
    'where.exe java': 'C:\\Program Files\\Microsoft\\jdk-17\\bin\\java.exe\r\n',
    'winget upgrade --id OpenJS.NodeJS.LTS --accept-source-agreements': 'No available upgrade found.\r\n',
    'winget upgrade --id Git.Git --accept-source-agreements': 'Git.Git  2.49.0  2.50.0 winget\r\n',
    'winget upgrade --id Python.Python.3.12 --accept-source-agreements': 'No available upgrade found.\r\n',
    'winget upgrade --id GoLang.Go --accept-source-agreements': 'No available upgrade found.\r\n',
    'winget upgrade --id Microsoft.OpenJDK.17 --accept-source-agreements': 'No available upgrade found.\r\n'
  }

  const { DevEnvironmentService } = loadDevEnvironmentServiceModule({
    execSync(command) {
      if (!(command in commandOutputs)) {
        throw new Error(`unexpected command: ${command}`)
      }
      return Buffer.from(commandOutputs[command])
    },
    wslService: {
      getOverview: async () => ({
        success: true,
        data: { available: true, distros: [{ name: 'Ubuntu', state: 'Running' }], defaultDistro: 'Ubuntu' }
      })
    }
  })

  const service = new DevEnvironmentService()
  const result = await service.inspectAll()

  assert.equal(result.success, true)
  assert.equal(result.data.records.find((item) => item.id === 'nodejs').detectedVersion, '22.15.0')
  assert.equal(result.data.records.find((item) => item.id === 'npm').status, 'linked')
  assert.equal(result.data.records.find((item) => item.id === 'pip').status, 'linked')
  assert.equal(result.data.records.find((item) => item.id === 'git').status, 'available-update')
  assert.equal(result.data.records.find((item) => item.id === 'wsl').status, 'external')
  assert.equal(result.data.wingetAvailable, true)
})

test('inspectOne marks a missing command as missing', async () => {
  const { DevEnvironmentService } = loadDevEnvironmentServiceModule({
    execSync(command) {
      if (command === 'winget --version') return Buffer.from('v1.8.1911\r\n')
      throw new Error('command not found')
    }
  })

  const service = new DevEnvironmentService()
  const result = await service.inspectOne('git')

  assert.equal(result.success, true)
  assert.equal(result.data.status, 'missing')
})

test('inspectOne marks an unparseable but reachable command as broken', async () => {
  const { DevEnvironmentService } = loadDevEnvironmentServiceModule({
    execSync(command) {
      if (command === 'winget --version') return Buffer.from('v1.8.1911\r\n')
      if (command === 'go version') return Buffer.from('garbled output')
      if (command === 'where.exe go') return Buffer.from('C:\\Go\\bin\\go.exe\r\n')
      throw new Error(`unexpected command: ${command}`)
    }
  })

  const service = new DevEnvironmentService()
  const result = await service.inspectOne('go')

  assert.equal(result.success, true)
  assert.equal(result.data.status, 'broken')
})

test('install returns a failure when winget is unavailable', async () => {
  const { DevEnvironmentService } = loadDevEnvironmentServiceModule({
    execSync() {
      throw new Error('winget missing')
    }
  })

  const service = new DevEnvironmentService()
  const result = await service.install('nodejs')

  assert.equal(result.success, false)
  assert.match(result.error, /winget/i)
})

test('install rejects linked environments that are not independently managed', async () => {
  const { DevEnvironmentService } = loadDevEnvironmentServiceModule({
    execSync(command) {
      if (command === 'winget --version') return Buffer.from('v1.8.1911\r\n')
      return Buffer.from('')
    }
  })

  const service = new DevEnvironmentService()
  const result = await service.install('npm')

  assert.equal(result.success, false)
  assert.match(result.error, /不支持独立安装/)
})
