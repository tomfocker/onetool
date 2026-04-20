const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadDevEnvironmentDataModule() {
  const filePath = path.join(__dirname, 'devEnvironmentData.ts')
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
    if (specifier === '../../../shared/devEnvironment') {
      return require(path.join(__dirname, '../../../shared/devEnvironment.ts'))
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
    process
  }, { filename: filePath })

  return module.exports
}

const {
  DEV_ENVIRONMENT_DISPLAY_LIST,
  getDevEnvironmentActionLabel,
  getDevEnvironmentStatusLabel
} = loadDevEnvironmentDataModule()

test('dev environment display list keeps WSL in the overview but marks it as managed elsewhere', () => {
  const wsl = DEV_ENVIRONMENT_DISPLAY_LIST.find((item) => item.id === 'wsl')

  assert.equal(wsl.name, 'WSL')
  assert.match(wsl.description, /(WSL|Windows Subsystem for Linux)/)
  assert.equal(wsl.relatedToolId, 'wsl-manager')
})

test('getDevEnvironmentActionLabel maps supported card actions', () => {
  assert.equal(getDevEnvironmentActionLabel('install'), '安装')
  assert.equal(getDevEnvironmentActionLabel('update'), '更新')
  assert.equal(getDevEnvironmentActionLabel('open-related-tool'), '前往 WSL 管理')
  assert.equal(getDevEnvironmentActionLabel('refresh'), '重新检测')
})

test('getDevEnvironmentStatusLabel maps internal statuses to readable Chinese labels', () => {
  assert.equal(getDevEnvironmentStatusLabel('available-update'), '可更新')
  assert.equal(getDevEnvironmentStatusLabel('broken'), '异常')
  assert.equal(getDevEnvironmentStatusLabel('linked'), '附属')
})
