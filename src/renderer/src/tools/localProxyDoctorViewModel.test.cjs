const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function loadViewModelModule() {
  const filePath = path.join(__dirname, 'localProxyDoctorViewModel.ts')
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
    if (specifier === '../../../shared/proxyDoctor') {
      return require(path.join(__dirname, '../../../shared/proxyDoctor.ts'))
    }
    return require(specifier)
  }

  const runModule = Function('module', 'exports', 'require', '__dirname', '__filename', 'console', 'process', transpiled)
  runModule(module, module.exports, customRequire, __dirname, filePath, console, process)

  return module.exports
}

const {
  DEFAULT_PROXY_DOCTOR_BYPASS,
  createProxyDoctorApplyRequest,
  getFirstProxyTargetCandidate,
  getLayerLampCopy,
  getLayerStateTone,
  getSummaryCopy,
  splitProxyDoctorBypass
} = loadViewModelModule()

test('splitProxyDoctorBypass accepts semicolons and newlines', () => {
  assert.deepEqual(splitProxyDoctorBypass('localhost;127.*\n<local>'), ['localhost', '127.*', '<local>'])
})

test('createProxyDoctorApplyRequest normalizes target and bypass fields', () => {
  assert.deepEqual(createProxyDoctorApplyRequest(' 7897 ', 'localhost;127.*'), {
    target: '7897',
    bypass: ['localhost', '127.*']
  })
})

test('getFirstProxyTargetCandidate extracts comparable proxy values from layered config text', () => {
  assert.equal(getFirstProxyTargetCandidate('HTTP_PROXY=http://100.64.0.6:20172; HTTPS_PROXY=http://100.64.0.6:20172'), 'http://100.64.0.6:20172')
  assert.equal(getFirstProxyTargetCandidate('http=127.0.0.1:7897;https=127.0.0.1:7897'), '127.0.0.1:7897')
  assert.equal(getFirstProxyTargetCandidate('未设置'), null)
})

test('summary and layer state labels stay user-facing', () => {
  assert.equal(getSummaryCopy('unified').title, '开发代理已统一')
  assert.equal(getSummaryCopy('off').title, '开发代理未启用')
  assert.equal(getSummaryCopy('conflict').title, '代理配置存在冲突')
  assert.equal(getLayerStateTone('ok'), 'success')
  assert.equal(getLayerStateTone('conflict'), 'warning')
  assert.ok(DEFAULT_PROXY_DOCTOR_BYPASS.includes('<local>'))
})

test('layer lamp copy combines proxy state and connectivity', () => {
  const layer = {
    id: 'git',
    title: 'Git 代理',
    state: 'ok',
    currentValue: 'http://127.0.0.1:7897',
    detail: '',
    actionHint: '',
    canFix: true,
    canClear: true
  }

  assert.deepEqual(getLayerLampCopy(layer, true), {
    tone: 'success',
    stateLabel: '已开启',
    reachabilityLabel: '可联通'
  })
  assert.equal(getLayerLampCopy(layer, false).reachabilityLabel, '端口未通')
  assert.equal(getLayerLampCopy({ ...layer, state: 'off', currentValue: '' }, true).stateLabel, '未开启')
  assert.equal(getLayerLampCopy({ ...layer, state: 'conflict' }, true).tone, 'warning')
})
