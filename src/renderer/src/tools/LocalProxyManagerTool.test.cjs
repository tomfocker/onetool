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

test('LocalProxyManagerTool renders a compact status lamp matrix instead of per-layer cards', () => {
  assert.match(source, /状态灯总览/)
  assert.match(source, /建议与操作/)
  assert.match(source, /environment-action-cell/)
  assert.match(source, /environment-status-row/)
  assert.match(source, /getLayerLampCopy\(layer, snapshot\?\.portOpen/)
  assert.doesNotMatch(source, /<Card key=\{layer\.id\}/)
  assert.doesNotMatch(source, /待处理项/)
  assert.doesNotMatch(source, /overflow-x-auto/)
  assert.doesNotMatch(source, /min-w-\[920px\]/)
  assert.doesNotMatch(source, /<span className="text-right">处理<\/span>/)
})

test('scan failure clears stale diagnosis state and records the failed scan', () => {
  assert.match(source, /setSnapshot\(null\)/)
  assert.match(source, /appendLog\(`扫描失败: \$\{result\.error \|\| '无法读取代理诊断信息。'\}`\)/)
})

test('failed proxy doctor mutations refresh the diagnosis snapshot', () => {
  assert.match(source, /title: '修复失败'[\s\S]*?await scanTarget\(target, true\)/)
  assert.match(source, /title: '清理失败'[\s\S]*?await scanTarget\(target, true\)/)
  assert.match(source, /title: '单层修复失败'[\s\S]*?await scanTarget\(target, true\)/)
  assert.match(source, /title: '单层清除失败'[\s\S]*?await scanTarget\(target, true\)/)
})

test('target input changes do not trigger diagnosis scans', () => {
  assert.match(source, /const scanTarget = useCallback\(\s*async \(targetValue: string, silent = false\)/)
  assert.match(source, /doctorScan\(targetValue\)/)
  assert.match(source, /onChange=\{\(event\) => setTarget\(event\.target\.value\)\}/)
  assert.doesNotMatch(source, /doctorScan\(target\)/)
  assert.doesNotMatch(source, /\[appendLog, showNotification, target\]/)
})

test('mount and refresh explicitly choose when to scan', () => {
  assert.match(source, /useEffect\(\(\) => \{\s*void scanTarget\(DEFAULT_PROXY_DOCTOR_TARGET\)\s*\}, \[scanTarget\]\)/)
  assert.match(source, /onClick=\{\(\) => void scanTarget\(target\)\}/)
})
