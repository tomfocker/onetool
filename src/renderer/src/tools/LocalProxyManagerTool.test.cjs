const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, 'LocalProxyManagerTool.tsx'), 'utf8')

test('LocalProxyManagerTool presents Proxy Doctor language and actions', () => {
  assert.match(source, /代理医生/)
  assert.match(source, /一键修复开发代理/)
  assert.match(source, /清除开发代理/)
  assert.match(source, /doctorScan/)
  assert.match(source, /doctorApplyAll/)
  assert.match(source, /doctorClearLayer/)
})

test('scan failure clears stale diagnosis state and records the failed scan', () => {
  assert.match(source, /setSnapshot\(null\)/)
  assert.match(source, /appendLog\(`扫描失败: \$\{result\.error \|\| '无法读取代理诊断信息。'\}`\)/)
})

test('failed proxy doctor mutations refresh the diagnosis snapshot', () => {
  assert.match(source, /title: '修复失败'[\s\S]*?await scan\(true\)/)
  assert.match(source, /title: '清理失败'[\s\S]*?await scan\(true\)/)
  assert.match(source, /title: '单层修复失败'[\s\S]*?await scan\(true\)/)
  assert.match(source, /title: '单层清除失败'[\s\S]*?await scan\(true\)/)
})

test('mount scan effect declares its scan dependency', () => {
  assert.match(source, /useEffect\(\(\) => \{\s*void scan\(\)\s*\}, \[scan\]\)/)
})
