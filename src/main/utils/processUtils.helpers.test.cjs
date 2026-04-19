const test = require('node:test')
const assert = require('node:assert/strict')
const iconv = require('iconv-lite')

const {
  decodeCommandText,
  selectCommandTextOutput
} = require('./processUtils.helpers.ts')

test('selectCommandTextOutput preserves stdout when the command exits with an error', () => {
  assert.equal(
    selectCommandTextOutput('\nRequest timed out.\n', ''),
    'Request timed out.'
  )
})

test('selectCommandTextOutput falls back to stderr when stdout is empty', () => {
  assert.equal(selectCommandTextOutput('', '\nAccess denied.\n'), 'Access denied.')
})

test('decodeCommandText decodes zh-CN ping output from the Windows code page', () => {
  const sample = iconv.encode(
    '正在 Ping 223.5.5.5 具有 32 字节的数据:\r\n来自 223.5.5.5 的回复: 字节=32 时间=30ms TTL=49',
    'cp936'
  )

  assert.match(decodeCommandText(sample), /时间=30ms/)
})
