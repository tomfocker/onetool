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
