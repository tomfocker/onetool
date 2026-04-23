const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadScreenOverlayHelpers() {
  const filePath = path.join(__dirname, 'screenOverlay.ts')
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
  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require,
    __dirname,
    __filename: filePath,
    console,
    process
  }, { filename: filePath })

  return module.exports
}

test('getOcrCanvasMetrics caps oversized crops while preserving aspect ratio', () => {
  const { getOcrCanvasMetrics } = loadScreenOverlayHelpers()
  const metrics = getOcrCanvasMetrics({
    selectionWidth: 800,
    selectionHeight: 400,
    naturalScaleX: 2,
    naturalScaleY: 2,
    maxDimension: 1200
  })

  assert.deepEqual(JSON.parse(JSON.stringify(metrics)), {
    canvasWidth: 1200,
    canvasHeight: 600,
    resultScaleX: 1.5,
    resultScaleY: 1.5
  })
})

test('getOcrCanvasMetrics keeps small crops at original size', () => {
  const { getOcrCanvasMetrics } = loadScreenOverlayHelpers()
  const metrics = getOcrCanvasMetrics({
    selectionWidth: 200,
    selectionHeight: 100,
    naturalScaleX: 1.5,
    naturalScaleY: 1.5,
    maxDimension: 1600
  })

  assert.deepEqual(JSON.parse(JSON.stringify(metrics)), {
    canvasWidth: 300,
    canvasHeight: 150,
    resultScaleX: 1.5,
    resultScaleY: 1.5
  })
})

test('buildOcrExtractedText joins trimmed lines for copy-friendly output', () => {
  const { buildOcrExtractedText } = loadScreenOverlayHelpers()
  const text = buildOcrExtractedText([
    { index: 0, text: '  Hello world  ', translatedText: null, x: 0, y: 0, width: 10, height: 10 },
    { index: 1, text: 'Second line', translatedText: null, x: 0, y: 12, width: 10, height: 10 },
    { index: 2, text: '   ', translatedText: null, x: 0, y: 24, width: 10, height: 10 }
  ])

  assert.equal(text, 'Hello world\nSecond line')
})

test('normalizeOcrTextLine removes stray spaces between adjacent chinese characters', () => {
  const { normalizeOcrTextLine } = loadScreenOverlayHelpers()
  assert.equal(
    normalizeOcrTextLine('不 启用 翻译 时 只 提取 图 片 内 文 字'),
    '不启用翻译时只提取图片内文字'
  )
})
