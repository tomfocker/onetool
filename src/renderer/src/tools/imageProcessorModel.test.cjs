const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadTypeScriptModule(fileName) {
  const filePath = path.join(__dirname, fileName)
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

  vm.runInNewContext(
    transpiled,
    {
      module,
      exports: module.exports,
      require,
      __dirname,
      __filename: filePath,
      console,
      process
    },
    { filename: filePath }
  )

  return module.exports
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value))
}

test('resolveImageOutputLayout limits the longest side without upscaling smaller images', () => {
  const { resolveImageOutputLayout } = loadTypeScriptModule('imageProcessorModel.ts')

  assert.deepEqual(
    toPlainObject(resolveImageOutputLayout(
      { width: 4000, height: 3000 },
      {
        method: 'limit',
        limitPixels: 1200,
        customWidth: 800,
        customHeight: 600,
        customResizeMode: 'fit'
      }
    )),
    {
      canvasWidth: 1200,
      canvasHeight: 900,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 4000,
      sourceHeight: 3000,
      drawX: 0,
      drawY: 0,
      drawWidth: 1200,
      drawHeight: 900
    }
  )

  assert.deepEqual(
    toPlainObject(resolveImageOutputLayout(
      { width: 640, height: 480 },
      {
        method: 'limit',
        limitPixels: 1200,
        customWidth: 800,
        customHeight: 600,
        customResizeMode: 'fit'
      }
    )),
    {
      canvasWidth: 640,
      canvasHeight: 480,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 640,
      sourceHeight: 480,
      drawX: 0,
      drawY: 0,
      drawWidth: 640,
      drawHeight: 480
    }
  )
})

test('resolveImageOutputLayout fits custom dimensions while preserving ratio by default', () => {
  const { resolveImageOutputLayout } = loadTypeScriptModule('imageProcessorModel.ts')

  assert.deepEqual(
    toPlainObject(resolveImageOutputLayout(
      { width: 4000, height: 2000 },
      {
        method: 'custom',
        limitPixels: 1200,
        customWidth: 800,
        customHeight: 800,
        customResizeMode: 'fit'
      }
    )),
    {
      canvasWidth: 800,
      canvasHeight: 800,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 4000,
      sourceHeight: 2000,
      drawX: 0,
      drawY: 200,
      drawWidth: 800,
      drawHeight: 400
    }
  )
})

test('resolveImageOutputLayout stretches custom dimensions when requested', () => {
  const { resolveImageOutputLayout } = loadTypeScriptModule('imageProcessorModel.ts')

  assert.deepEqual(
    toPlainObject(resolveImageOutputLayout(
      { width: 4000, height: 2000 },
      {
        method: 'custom',
        limitPixels: 1200,
        customWidth: 800,
        customHeight: 800,
        customResizeMode: 'stretch'
      }
    )),
    {
      canvasWidth: 800,
      canvasHeight: 800,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 4000,
      sourceHeight: 2000,
      drawX: 0,
      drawY: 0,
      drawWidth: 800,
      drawHeight: 800
    }
  )
})

test('resolveImageOutputLayout crops custom dimensions while preserving ratio when requested', () => {
  const { resolveImageOutputLayout } = loadTypeScriptModule('imageProcessorModel.ts')

  assert.deepEqual(
    toPlainObject(resolveImageOutputLayout(
      { width: 4000, height: 2000 },
      {
        method: 'custom',
        limitPixels: 1200,
        customWidth: 800,
        customHeight: 800,
        customResizeMode: 'crop'
      }
    )),
    {
      canvasWidth: 800,
      canvasHeight: 800,
      drawX: 0,
      drawY: 0,
      drawWidth: 800,
      drawHeight: 800,
      sourceX: 1000,
      sourceY: 0,
      sourceWidth: 2000,
      sourceHeight: 2000
    }
  )

  assert.deepEqual(
    toPlainObject(resolveImageOutputLayout(
      { width: 2000, height: 4000 },
      {
        method: 'custom',
        limitPixels: 1200,
        customWidth: 800,
        customHeight: 800,
        customResizeMode: 'crop'
      }
    )),
    {
      canvasWidth: 800,
      canvasHeight: 800,
      drawX: 0,
      drawY: 0,
      drawWidth: 800,
      drawHeight: 800,
      sourceX: 0,
      sourceY: 1000,
      sourceWidth: 2000,
      sourceHeight: 2000
    }
  )
})

test('sanitizePixelInput clamps dimensions to supported canvas bounds', () => {
  const { sanitizePixelInput } = loadTypeScriptModule('imageProcessorModel.ts')

  assert.equal(sanitizePixelInput('0'), 1)
  assert.equal(sanitizePixelInput('540'), 540)
  assert.equal(sanitizePixelInput('99999'), 30000)
  assert.equal(sanitizePixelInput('not-a-number'), 1)
})
