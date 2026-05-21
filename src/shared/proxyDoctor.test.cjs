const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const ts = require('typescript')

const {
  normalizeProxyDoctorTarget,
  summarizeProxyDoctorLayers,
  buildProxyDoctorReport,
  getProxyDoctorSummaryLabel,
  PROXY_DOCTOR_LAYER_DEFINITIONS,
  PROXY_DOCTOR_NO_PROXY_KEYS,
  PROXY_DOCTOR_PROXY_KEYS
} = require('./proxyDoctor.ts')

function createLayer(id, state) {
  const titles = {
    wininet: 'Windows 系统代理',
    winhttp: 'WinHTTP 代理',
    env: '命令行环境变量',
    git: 'Git 代理',
    npm: 'npm 代理'
  }

  return {
    id,
    state,
    title: titles[id],
    currentValue: state === 'ok' ? 'http://127.0.0.1:7897' : '',
    detail: '',
    actionHint: '',
    canFix: true,
    canClear: state !== 'off'
  }
}

test('normalizeProxyDoctorTarget turns a port into a local HTTP target', () => {
  const target = normalizeProxyDoctorTarget('7897')

  assert.deepEqual(target, {
    input: '7897',
    protocol: 'http',
    host: '127.0.0.1',
    port: 7897,
    url: 'http://127.0.0.1:7897',
    winInetServer: 'http=127.0.0.1:7897;https=127.0.0.1:7897',
    envValue: 'http://127.0.0.1:7897'
  })
})

test('normalizeProxyDoctorTarget accepts socks5 URLs and maps WinINET socks server', () => {
  const target = normalizeProxyDoctorTarget('socks5://localhost:10808')

  assert.equal(target.protocol, 'socks5')
  assert.equal(target.host, 'localhost')
  assert.equal(target.port, 10808)
  assert.equal(target.url, 'socks5://localhost:10808')
  assert.equal(target.winInetServer, 'socks=localhost:10808')
})

test('normalizeProxyDoctorTarget accepts explicit authority ports', () => {
  assert.deepEqual(normalizeProxyDoctorTarget('127.0.0.1:7897'), {
    input: '127.0.0.1:7897',
    protocol: 'http',
    host: '127.0.0.1',
    port: 7897,
    url: 'http://127.0.0.1:7897',
    winInetServer: 'http=127.0.0.1:7897;https=127.0.0.1:7897',
    envValue: 'http://127.0.0.1:7897'
  })
  assert.equal(normalizeProxyDoctorTarget('http://127.0.0.1:7897').url, 'http://127.0.0.1:7897')
  assert.equal(normalizeProxyDoctorTarget('socks5://localhost:10808').url, 'socks5://localhost:10808')

  assert.deepEqual(normalizeProxyDoctorTarget('localhost:80'), {
    input: 'localhost:80',
    protocol: 'http',
    host: 'localhost',
    port: 80,
    url: 'http://localhost:80',
    winInetServer: 'http=localhost:80;https=localhost:80',
    envValue: 'http://localhost:80'
  })
  assert.equal(normalizeProxyDoctorTarget('http://localhost:80').port, 80)
  assert.equal(normalizeProxyDoctorTarget('http://localhost:80').url, 'http://localhost:80')
  assert.equal(normalizeProxyDoctorTarget('https://localhost:443').protocol, 'https')
  assert.equal(normalizeProxyDoctorTarget('https://localhost:443').port, 443)
  assert.equal(normalizeProxyDoctorTarget('https://localhost:443').url, 'https://localhost:443')
})

test('normalizeProxyDoctorTarget rejects invalid ports and protocols', () => {
  assert.throws(() => normalizeProxyDoctorTarget('0'), /代理端口必须在 1-65535 之间/)
  assert.throws(() => normalizeProxyDoctorTarget('ftp://127.0.0.1:21'), /不支持的代理协议/)
})

test('normalizeProxyDoctorTarget rejects port-like values outside the URL authority', () => {
  assert.throws(() => normalizeProxyDoctorTarget('localhost/path:7897'), /代理端口必须在 1-65535 之间/)
  assert.throws(() => normalizeProxyDoctorTarget('http://localhost/path:7897'), /代理端口必须在 1-65535 之间/)
  assert.throws(() => normalizeProxyDoctorTarget('localhost?proxy=:7897'), /代理端口必须在 1-65535 之间/)
  assert.throws(() => normalizeProxyDoctorTarget('localhost#proxy:7897'), /代理端口必须在 1-65535 之间/)
  assert.throws(() => normalizeProxyDoctorTarget('http://localhost?port=:7897'), /代理端口必须在 1-65535 之间/)
  assert.throws(() => normalizeProxyDoctorTarget('http://localhost#port:7897'), /代理端口必须在 1-65535 之间/)
})

test('summarizeProxyDoctorLayers reports unified, off, conflict, and error states', () => {
  assert.equal(summarizeProxyDoctorLayers([
    createLayer('wininet', 'ok'),
    createLayer('winhttp', 'ok'),
    createLayer('env', 'ok'),
    createLayer('git', 'ok'),
    createLayer('npm', 'ok')
  ]), 'unified')

  assert.equal(summarizeProxyDoctorLayers([
    createLayer('wininet', 'off'),
    createLayer('winhttp', 'off'),
    createLayer('env', 'off'),
    createLayer('git', 'off'),
    createLayer('npm', 'off')
  ]), 'off')

  assert.equal(summarizeProxyDoctorLayers([
    { id: 'wininet', state: 'ok', title: 'Windows 系统代理', currentValue: 'http://127.0.0.1:7897', detail: '', actionHint: '', canFix: true, canClear: true },
    { id: 'npm', state: 'conflict', title: 'npm 代理', currentValue: 'http://127.0.0.1:1080', detail: '', actionHint: '', canFix: true, canClear: true }
  ]), 'conflict')

  assert.equal(summarizeProxyDoctorLayers([
    { id: 'wininet', state: 'error', title: 'Windows 系统代理', currentValue: '', detail: '', actionHint: '', canFix: true, canClear: true }
  ]), 'error')
})

test('summarizeProxyDoctorLayers treats missing core layers as conflict', () => {
  assert.equal(summarizeProxyDoctorLayers([
    createLayer('wininet', 'ok'),
    createLayer('winhttp', 'ok'),
    createLayer('env', 'ok'),
    createLayer('git', 'ok')
  ]), 'conflict')

  assert.equal(summarizeProxyDoctorLayers([
    createLayer('wininet', 'off'),
    createLayer('winhttp', 'off'),
    createLayer('env', 'off'),
    createLayer('git', 'off')
  ]), 'conflict')

  assert.equal(summarizeProxyDoctorLayers([]), 'conflict')
})

test('proxy doctor constants include upper and lower case environment keys', () => {
  assert.deepEqual(PROXY_DOCTOR_PROXY_KEYS, [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy'
  ])
  assert.deepEqual(PROXY_DOCTOR_NO_PROXY_KEYS, ['NO_PROXY', 'no_proxy'])
})

test('getProxyDoctorSummaryLabel returns the required Chinese labels', () => {
  assert.equal(getProxyDoctorSummaryLabel('unified'), '开发代理已统一')
  assert.equal(getProxyDoctorSummaryLabel('off'), '开发代理未启用')
  assert.equal(getProxyDoctorSummaryLabel('conflict'), '代理配置存在冲突')
  assert.equal(getProxyDoctorSummaryLabel('error'), '无法完成诊断')
})

test('buildProxyDoctorReport includes all diagnostic layer names', () => {
  const target = normalizeProxyDoctorTarget('7897')
  const report = buildProxyDoctorReport({
    target,
    summary: 'conflict',
    portOpen: false,
    generatedAt: '2026-05-21T00:00:00.000Z',
    layers: PROXY_DOCTOR_LAYER_DEFINITIONS.map((definition) => ({
      id: definition.id,
      title: definition.title,
      state: 'off',
      currentValue: '',
      detail: definition.description,
      actionHint: definition.actionHint,
      canFix: definition.canFix,
      canClear: definition.canClear
    })),
    log: ['scan started']
  })

  assert.match(report, /目标代理: http:\/\/127\.0\.0\.1:7897/)
  assert.match(report, /Windows 系统代理/)
  assert.match(report, /WinHTTP 代理/)
  assert.match(report, /命令行环境变量/)
  assert.match(report, /Git 代理/)
  assert.match(report, /npm 代理/)
  assert.match(report, /当前进程/)
  assert.match(report, /Codex 进程/)
})

test('proxy doctor exported TypeScript contracts match the shared model spec', () => {
  const sharedDir = __dirname.replace(/\\/g, '/')
  const contractFile = `${sharedDir}/proxyDoctor.contract.test.ts`
  const proxyDoctorFile = `${sharedDir}/proxyDoctor.ts`
  const contractSource = `
    import type { ProxyDoctorApplyRequest, ProxyDoctorSnapshot } from './proxyDoctor'
    import { buildProxyDoctorReport } from './proxyDoctor'

    const applyRequest: ProxyDoctorApplyRequest = {
      target: '7897',
      bypass: ['localhost', '127.0.0.1']
    }

    const snapshot: ProxyDoctorSnapshot = {
      target: {
        input: '7897',
        protocol: 'http',
        host: '127.0.0.1',
        port: 7897,
        url: 'http://127.0.0.1:7897',
        winInetServer: 'http=127.0.0.1:7897;https=127.0.0.1:7897',
        envValue: 'http://127.0.0.1:7897'
      },
      summary: 'unified',
      portOpen: true,
      generatedAt: '2026-05-21T00:00:00.000Z',
      layers: [],
      log: [],
      reportText: 'generated report'
    }

    buildProxyDoctorReport({
      target: snapshot.target,
      summary: snapshot.summary,
      portOpen: snapshot.portOpen,
      generatedAt: snapshot.generatedAt,
      layers: snapshot.layers,
      log: snapshot.log
    })

    const strictPortOpen: boolean = snapshot.portOpen

    applyRequest
    snapshot
    strictPortOpen
  `
  const options = {
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    target: ts.ScriptTarget.ES2020,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true
  }
  const host = ts.createCompilerHost(options)
  const originalGetSourceFile = host.getSourceFile.bind(host)
  const originalFileExists = host.fileExists.bind(host)
  const originalReadFile = host.readFile.bind(host)

  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const normalized = fileName.replace(/\\/g, '/')
    if (normalized === contractFile) {
      return ts.createSourceFile(fileName, contractSource, languageVersion, true)
    }

    return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile)
  }
  host.fileExists = (fileName) => {
    const normalized = fileName.replace(/\\/g, '/')
    return normalized === contractFile || originalFileExists(fileName)
  }
  host.readFile = (fileName) => {
    const normalized = fileName.replace(/\\/g, '/')
    if (normalized === contractFile) {
      return contractSource
    }

    return originalReadFile(fileName)
  }

  const program = ts.createProgram([contractFile, proxyDoctorFile], options, host)
  const diagnostics = ts.getPreEmitDiagnostics(program)
  const messages = diagnostics.map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    if (diagnostic.file && typeof diagnostic.start === 'number') {
      const location = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      return `${path.basename(diagnostic.file.fileName)}:${location.line + 1}:${location.character + 1} ${message}`
    }

    return message
  })

  assert.deepEqual(messages, [])
})
