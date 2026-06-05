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
      process,
      Blob,
      ArrayBuffer,
      DataView,
      Uint8Array,
      Math
    },
    { filename: filePath }
  )

  return module.exports
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value))
}

test('getTargetWeightBytes converts image target weight to file bytes', () => {
  const { getTargetWeightBytes } = loadTypeScriptModule('imageProcessorEncoding.ts')

  assert.equal(getTargetWeightBytes(2, 'MB'), 2 * 1024 * 1024)
  assert.equal(getTargetWeightBytes(512, 'KB'), 512 * 1024)
  assert.equal(getTargetWeightBytes(0, 'KB'), 1)
})

test('encodeWithTargetQuality lowers quality until the encoded blob reaches the target size', async () => {
  const { encodeWithTargetQuality } = loadTypeScriptModule('imageProcessorEncoding.ts')
  const qualities = []

  const result = await encodeWithTargetQuality(
    async (quality) => {
      qualities.push(quality)
      return new Blob([new Uint8Array(Math.round(quality * 1000))], { type: 'image/jpeg' })
    },
    {
      initialQuality: 0.8,
      targetBytes: 450,
      minQuality: 0.1,
      attempts: 8
    }
  )

  assert.equal(result.reachedTarget, true)
  assert.ok(result.blob.size <= 450)
  assert.ok(result.quality < 0.8)
  assert.ok(qualities.length > 1)
})

test('resolveIcoCanvasSize caps icon dimensions to 256 pixels while preserving ratio', () => {
  const { resolveIcoCanvasSize } = loadTypeScriptModule('imageProcessorEncoding.ts')

  assert.deepEqual(toPlainObject(resolveIcoCanvasSize(1024, 512)), { width: 256, height: 128 })
  assert.deepEqual(toPlainObject(resolveIcoCanvasSize(128, 64)), { width: 128, height: 64 })
  assert.deepEqual(toPlainObject(resolveIcoCanvasSize(256, 300)), { width: 218, height: 256 })
})

test('createIcoBlobFromPngBlob wraps png bytes in a valid ICO directory', async () => {
  const { createIcoBlobFromPngBlob } = loadTypeScriptModule('imageProcessorEncoding.ts')
  const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const icoBlob = await createIcoBlobFromPngBlob(new Blob([pngBytes], { type: 'image/png' }), 256, 128)
  const bytes = new Uint8Array(await icoBlob.arrayBuffer())
  const view = new DataView(bytes.buffer)

  assert.equal(icoBlob.type, 'image/vnd.microsoft.icon')
  assert.equal(view.getUint16(0, true), 0)
  assert.equal(view.getUint16(2, true), 1)
  assert.equal(view.getUint16(4, true), 1)
  assert.equal(bytes[6], 0)
  assert.equal(bytes[7], 128)
  assert.equal(view.getUint32(14, true), pngBytes.length)
  assert.equal(view.getUint32(18, true), 22)
  assert.deepEqual(Array.from(bytes.slice(22)), Array.from(pngBytes))
})
