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
      TextEncoder,
      TextDecoder,
      Uint8Array,
      ArrayBuffer
    },
    { filename: filePath }
  )

  return module.exports
}

function countSignature(bytes, signature) {
  let count = 0
  for (let index = 0; index <= bytes.length - signature.length; index += 1) {
    let matches = true
    for (let sigIndex = 0; sigIndex < signature.length; sigIndex += 1) {
      if (bytes[index + sigIndex] !== signature[sigIndex]) {
        matches = false
        break
      }
    }
    if (matches) count += 1
  }
  return count
}

test('getArchiveFileNames preserves source names without deduplicating', () => {
  const { getArchiveFileNames } = loadTypeScriptModule('imageProcessorArchive.ts')

  assert.deepEqual(
    getArchiveFileNames([
      { fileName: 'photo.png' },
      { fileName: 'photo.png' },
      { fileName: 'photo-2.png' },
      { fileName: '../nested/cover.jpg' }
    ]),
    ['photo.png', 'photo.png', 'photo-2.png', 'cover.jpg']
  )
})

test('createImageProcessorZip builds one downloadable archive for all processed images', async () => {
  const { createImageProcessorZip } = loadTypeScriptModule('imageProcessorArchive.ts')

  const zipBlob = await createImageProcessorZip([
    { fileName: 'photo.png', blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) },
    { fileName: 'photo.png', blob: new Blob([new Uint8Array([4, 5])], { type: 'image/png' }) }
  ])

  assert.equal(zipBlob.type, 'application/zip')

  const bytes = new Uint8Array(await zipBlob.arrayBuffer())
  const text = new TextDecoder().decode(bytes)

  assert.equal(countSignature(bytes, [0x50, 0x4b, 0x03, 0x04]), 2)
  assert.equal(countSignature(bytes, [0x50, 0x4b, 0x01, 0x02]), 2)
  assert.equal(countSignature(bytes, [0x50, 0x4b, 0x05, 0x06]), 1)
  assert.equal((text.match(/photo\.png/g) ?? []).length, 4)
  assert.doesNotMatch(text, /photo-2\.png/)
})
