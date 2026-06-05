const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function readSource() {
  return fs.readFileSync(path.join(__dirname, 'ImageProcessorTool.tsx'), 'utf8')
}

test('ImageProcessorTool wires target weight mode into the image encoding pipeline', () => {
  const source = readSource()

  assert.match(source, /getTargetWeightBytes/)
  assert.match(source, /encodeWithTargetQuality/)
  assert.match(source, /compressMethod === 'limitWeight'/)
  assert.match(source, /limitWeightUnit/)
})

test('ImageProcessorTool creates real ICO files instead of relabeling PNG output', () => {
  const source = readSource()

  assert.match(source, /createIcoBlobFromPngBlob/)
  assert.doesNotMatch(
    source,
    /if\s*\(\s*outputFormat === 'image\/vnd\.microsoft\.icon'\s*\)\s*\{\s*outputFormat = 'image\/png'/s
  )
})
