const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function loadPdfToolsServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'PdfToolsService.ts')
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
    if (specifier === 'electron') {
      return {
        shell: overrides.shellModule || { openPath: async () => '' }
      }
    }

    if (specifier === 'node:fs/promises' || specifier === 'fs/promises') {
      return overrides.fsPromises || require(specifier)
    }

    if (specifier === 'node:path' || specifier === 'path') {
      return require(specifier)
    }

    if (specifier === 'pdf-lib') {
      return {
        degrees: overrides.degrees || ((value) => ({ degrees: value })),
        PDFDocument: overrides.pdfDocument || {
          create: async () => ({ save: async () => Buffer.from('') }),
          load: async () => ({ getPageIndices: () => [] })
        }
      }
    }

    if (specifier === '../../shared/pdfTools') {
      return require(path.join(__dirname, '../../shared/pdfTools.ts'))
    }

    if (specifier === '../../shared/types') {
      return {}
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
    process,
    Buffer,
    Uint8Array,
    setTimeout,
    clearTimeout
  }, { filename: filePath })

  return module.exports
}

function createMemoryFs(files = {}) {
  const writes = []
  const dirs = []

  return {
    writes,
    dirs,
    fsPromises: {
      readFile: async (targetPath) => {
        if (!(targetPath in files)) {
          throw Object.assign(new Error(`missing ${targetPath}`), { code: 'ENOENT' })
        }
        return Buffer.from(files[targetPath])
      },
      writeFile: async (targetPath, content) => {
        writes.push([targetPath, Buffer.from(content)])
      },
      mkdir: async (targetPath, options) => {
        dirs.push([targetPath, options])
      },
      stat: async (targetPath) => {
        const written = writes.find(([writtenPath]) => writtenPath === targetPath)
        if (written) {
          return { size: written[1].length }
        }
        return { size: files[targetPath]?.length || 0 }
      }
    }
  }
}

function normalizeForAssertion(value) {
  return JSON.parse(JSON.stringify(value))
}

test('convert images-to-pdf writes one PDF from supported image inputs', async () => {
  const addPageCalls = []
  const embedded = []
  const memoryFs = createMemoryFs({
    'D:\\Pictures\\cover.png': 'png-bytes',
    'D:\\Pictures\\page.jpg': 'jpg-bytes'
  })
  const pdfDocument = {
    create: async () => ({
      embedPng: async (bytes) => {
        embedded.push(['png', Buffer.from(bytes).toString()])
        return { width: 800, height: 600 }
      },
      embedJpg: async (bytes) => {
        embedded.push(['jpg', Buffer.from(bytes).toString()])
        return { width: 640, height: 480 }
      },
      addPage: (size) => {
        addPageCalls.push(size)
        return { drawImage() {} }
      },
      save: async () => Buffer.from('pdf-output')
    })
  }

  const { PdfToolsService } = loadPdfToolsServiceModule({ pdfDocument })
  const service = new PdfToolsService({ fsPromises: memoryFs.fsPromises, pdfDocument })

  const result = await service.convert({
    mode: 'images-to-pdf',
    inputPaths: ['D:\\Pictures\\cover.png', 'D:\\Pictures\\page.jpg'],
    outputDirectory: 'D:\\Exports',
    outputName: 'album'
  })

  assert.equal(result.success, true)
  assert.deepEqual(embedded, [['png', 'png-bytes'], ['jpg', 'jpg-bytes']])
  assert.deepEqual(normalizeForAssertion(addPageCalls), [[800, 600], [640, 480]])
  assert.deepEqual(memoryFs.writes.map(([targetPath]) => targetPath), ['D:\\Exports\\album.pdf'])
  assert.equal(result.data.outputFiles[0].kind, 'pdf')
  assert.equal(result.data.outputFiles[0].name, 'album.pdf')
})

test('convert merge-pdfs copies every page into one output document', async () => {
  const copiedPageGroups = []
  const addedPages = []
  const memoryFs = createMemoryFs({
    'D:\\Docs\\a.pdf': 'a',
    'D:\\Docs\\b.pdf': 'b'
  })
  const pdfDocument = {
    create: async () => ({
      copyPages: async (_source, indices) => {
        copiedPageGroups.push(indices)
        return indices.map((index) => `copied-${index}`)
      },
      addPage: (page) => {
        addedPages.push(page)
      },
      save: async () => Buffer.from('merged')
    }),
    load: async (bytes) => ({
      source: Buffer.from(bytes).toString(),
      getPageIndices: () => Buffer.from(bytes).toString() === 'a' ? [0, 1] : [0]
    })
  }

  const { PdfToolsService } = loadPdfToolsServiceModule({ pdfDocument })
  const service = new PdfToolsService({ fsPromises: memoryFs.fsPromises, pdfDocument })

  const result = await service.convert({
    mode: 'merge-pdfs',
    inputPaths: ['D:\\Docs\\a.pdf', 'D:\\Docs\\b.pdf'],
    outputDirectory: 'D:\\Exports',
    outputName: 'bundle'
  })

  assert.equal(result.success, true)
  assert.deepEqual(copiedPageGroups, [[0, 1], [0]])
  assert.deepEqual(addedPages, ['copied-0', 'copied-1', 'copied-0'])
  assert.deepEqual(memoryFs.writes.map(([targetPath]) => targetPath), ['D:\\Exports\\bundle.pdf'])
})

test('convert pdf-to-images writes one png file per rendered page', async () => {
  const memoryFs = createMemoryFs({
    'D:\\Docs\\manual.pdf': 'manual'
  })
  const pdfToImageLoader = async () => ({
    pdf: async (inputPath, options) => {
      assert.equal(inputPath, 'D:\\Docs\\manual.pdf')
      assert.deepEqual(normalizeForAssertion(options), { scale: 3 })
      return [Buffer.from('page-1'), Buffer.from('page-2')]
    }
  })

  const { PdfToolsService } = loadPdfToolsServiceModule()
  const service = new PdfToolsService({
    fsPromises: memoryFs.fsPromises,
    pdfToImageLoader
  })

  const result = await service.convert({
    mode: 'pdf-to-images',
    inputPaths: ['D:\\Docs\\manual.pdf'],
    outputDirectory: 'D:\\Exports',
    outputName: 'manual-export',
    imageScale: 3
  })

  assert.equal(result.success, true)
  assert.deepEqual(memoryFs.writes.map(([targetPath]) => targetPath), [
    'D:\\Exports\\manual-export-page-001.png',
    'D:\\Exports\\manual-export-page-002.png'
  ])
  assert.deepEqual(
    normalizeForAssertion(result.data.outputFiles.map((file) => file.kind)),
    ['image', 'image']
  )
})

test('convert returns a friendly failure when no selected files match the mode', async () => {
  const { PdfToolsService } = loadPdfToolsServiceModule()
  const service = new PdfToolsService({ fsPromises: createMemoryFs().fsPromises })

  const result = await service.convert({
    mode: 'merge-pdfs',
    inputPaths: ['D:\\Pictures\\cover.png'],
    outputDirectory: 'D:\\Exports'
  })

  assert.equal(result.success, false)
  assert.match(result.error, /没有可转换的 PDF 文件/)
})

test('convert split-pdf writes one PDF file for every source page', async () => {
  const memoryFs = createMemoryFs({
    'D:\\Docs\\book.pdf': 'book'
  })
  let createdDocumentCount = 0
  const copyCalls = []
  const pdfDocument = {
    create: async () => {
      createdDocumentCount += 1
      return {
        copyPages: async (_source, indices) => {
          copyCalls.push(indices)
          return indices.map((index) => `page-${index}`)
        },
        addPage() {},
        save: async () => Buffer.from(`split-${createdDocumentCount}`)
      }
    },
    load: async () => ({
      getPageIndices: () => [0, 1, 2]
    })
  }

  const { PdfToolsService } = loadPdfToolsServiceModule({ pdfDocument })
  const service = new PdfToolsService({ fsPromises: memoryFs.fsPromises, pdfDocument })

  const result = await service.convert({
    mode: 'split-pdf',
    inputPaths: ['D:\\Docs\\book.pdf'],
    outputDirectory: 'D:\\Exports',
    outputName: 'book-split'
  })

  assert.equal(result.success, true)
  assert.deepEqual(normalizeForAssertion(copyCalls), [[0], [1], [2]])
  assert.deepEqual(memoryFs.writes.map(([targetPath]) => targetPath), [
    'D:\\Exports\\book-split-page-001.pdf',
    'D:\\Exports\\book-split-page-002.pdf',
    'D:\\Exports\\book-split-page-003.pdf'
  ])
  assert.equal(result.data.outputFiles.length, 3)
})

test('convert extract-pages copies selected pages in the requested order', async () => {
  const copiedPageGroups = []
  const addedPages = []
  const memoryFs = createMemoryFs({
    'D:\\Docs\\book.pdf': 'book'
  })
  const pdfDocument = {
    create: async () => ({
      copyPages: async (_source, indices) => {
        copiedPageGroups.push(indices)
        return indices.map((index) => `copied-${index}`)
      },
      addPage: (page) => {
        addedPages.push(page)
      },
      save: async () => Buffer.from('extract')
    }),
    load: async () => ({
      getPageIndices: () => [0, 1, 2, 3]
    })
  }

  const { PdfToolsService } = loadPdfToolsServiceModule({ pdfDocument })
  const service = new PdfToolsService({ fsPromises: memoryFs.fsPromises, pdfDocument })

  const result = await service.convert({
    mode: 'extract-pages',
    inputPaths: ['D:\\Docs\\book.pdf'],
    outputDirectory: 'D:\\Exports',
    outputName: 'book-extracted',
    pageSelection: '3,1'
  })

  assert.equal(result.success, true)
  assert.deepEqual(normalizeForAssertion(copiedPageGroups), [[2, 0]])
  assert.deepEqual(addedPages, ['copied-2', 'copied-0'])
  assert.deepEqual(memoryFs.writes.map(([targetPath]) => targetPath), [
    'D:\\Exports\\book-extracted.pdf'
  ])
})

test('convert delete-pages omits selected pages from the output PDF', async () => {
  const copiedPageGroups = []
  const memoryFs = createMemoryFs({
    'D:\\Docs\\book.pdf': 'book'
  })
  const pdfDocument = {
    create: async () => ({
      copyPages: async (_source, indices) => {
        copiedPageGroups.push(indices)
        return indices.map((index) => `copied-${index}`)
      },
      addPage() {},
      save: async () => Buffer.from('delete')
    }),
    load: async () => ({
      getPageIndices: () => [0, 1, 2, 3]
    })
  }

  const { PdfToolsService } = loadPdfToolsServiceModule({ pdfDocument })
  const service = new PdfToolsService({ fsPromises: memoryFs.fsPromises, pdfDocument })

  const result = await service.convert({
    mode: 'delete-pages',
    inputPaths: ['D:\\Docs\\book.pdf'],
    outputDirectory: 'D:\\Exports',
    outputName: 'book-edited',
    pageSelection: '2-3'
  })

  assert.equal(result.success, true)
  assert.deepEqual(normalizeForAssertion(copiedPageGroups), [[0, 3]])
  assert.deepEqual(memoryFs.writes.map(([targetPath]) => targetPath), [
    'D:\\Exports\\book-edited.pdf'
  ])
})

test('convert rotate-pages rotates only selected pages', async () => {
  const rotations = []
  const memoryFs = createMemoryFs({
    'D:\\Docs\\book.pdf': 'book'
  })
  const pdfDocument = {
    create: async () => ({
      copyPages: async (_source, indices) => {
        return indices.map((index) => ({
          index,
          setRotation(rotation) {
            rotations.push([index, rotation])
          }
        }))
      },
      addPage() {},
      save: async () => Buffer.from('rotate')
    }),
    load: async () => ({
      getPageIndices: () => [0, 1, 2]
    })
  }

  const { PdfToolsService } = loadPdfToolsServiceModule({ pdfDocument })
  const service = new PdfToolsService({
    fsPromises: memoryFs.fsPromises,
    pdfDocument
  })

  const result = await service.convert({
    mode: 'rotate-pages',
    inputPaths: ['D:\\Docs\\book.pdf'],
    outputDirectory: 'D:\\Exports',
    outputName: 'book-rotated',
    pageSelection: '1,3',
    rotationDegrees: 180
  })

  assert.equal(result.success, true)
  assert.deepEqual(normalizeForAssertion(rotations), [
    [0, { degrees: 180 }],
    [2, { degrees: 180 }]
  ])
  assert.deepEqual(memoryFs.writes.map(([targetPath]) => targetPath), [
    'D:\\Exports\\book-rotated.pdf'
  ])
})
