const test = require('node:test')
const assert = require('node:assert/strict')

const {
  filterPdfToolInputPaths,
  getPdfToolAcceptedExtensions,
  getPdfToolDefaultOutputName,
  getPdfToolModeLabel,
  getPdfToolInputKind,
  normalizePdfToolImageScale,
  parsePdfToolPageSelection
} = require('./pdfTools.ts')

test('pdf tool modes expose stable labels and accepted extensions', () => {
  assert.equal(getPdfToolModeLabel('images-to-pdf'), '图片转 PDF')
  assert.equal(getPdfToolModeLabel('pdf-to-images'), 'PDF 转图片')
  assert.equal(getPdfToolModeLabel('merge-pdfs'), '合并 PDF')
  assert.equal(getPdfToolModeLabel('split-pdf'), '拆分 PDF')
  assert.equal(getPdfToolModeLabel('extract-pages'), '提取页面')
  assert.equal(getPdfToolModeLabel('delete-pages'), '删除页面')
  assert.equal(getPdfToolModeLabel('rotate-pages'), '旋转页面')

  assert.deepEqual(getPdfToolAcceptedExtensions('images-to-pdf'), ['png', 'jpg', 'jpeg'])
  assert.deepEqual(getPdfToolAcceptedExtensions('pdf-to-images'), ['pdf'])
  assert.deepEqual(getPdfToolAcceptedExtensions('merge-pdfs'), ['pdf'])
  assert.deepEqual(getPdfToolAcceptedExtensions('split-pdf'), ['pdf'])
  assert.deepEqual(getPdfToolAcceptedExtensions('extract-pages'), ['pdf'])
  assert.deepEqual(getPdfToolAcceptedExtensions('delete-pages'), ['pdf'])
  assert.deepEqual(getPdfToolAcceptedExtensions('rotate-pages'), ['pdf'])
})

test('pdf tool input filtering keeps only files supported by the selected mode', () => {
  const paths = [
    'D:\\Docs\\one.pdf',
    'D:\\Docs\\two.PDF',
    'D:\\Pictures\\cover.png',
    'D:\\Pictures\\scan.JPG',
    'D:\\Pictures\\raw.webp'
  ]

  assert.deepEqual(filterPdfToolInputPaths('images-to-pdf', paths), [
    'D:\\Pictures\\cover.png',
    'D:\\Pictures\\scan.JPG'
  ])
  assert.deepEqual(filterPdfToolInputPaths('pdf-to-images', paths), [
    'D:\\Docs\\one.pdf',
    'D:\\Docs\\two.PDF'
  ])
  assert.deepEqual(filterPdfToolInputPaths('merge-pdfs', paths), [
    'D:\\Docs\\one.pdf',
    'D:\\Docs\\two.PDF'
  ])
  assert.deepEqual(filterPdfToolInputPaths('split-pdf', paths), [
    'D:\\Docs\\one.pdf',
    'D:\\Docs\\two.PDF'
  ])
})

test('pdf tool derives readable default output names from the first input', () => {
  assert.equal(
    getPdfToolDefaultOutputName('images-to-pdf', ['D:\\Pictures\\receipt.png']),
    'receipt-images'
  )
  assert.equal(
    getPdfToolDefaultOutputName('pdf-to-images', ['D:\\Docs\\contract.pdf']),
    'contract-pages'
  )
  assert.equal(
    getPdfToolDefaultOutputName('merge-pdfs', ['D:\\Docs\\contract.pdf']),
    'merged-pdf'
  )
  assert.equal(
    getPdfToolDefaultOutputName('split-pdf', ['D:\\Docs\\contract.pdf']),
    'contract-split'
  )
  assert.equal(
    getPdfToolDefaultOutputName('extract-pages', ['D:\\Docs\\contract.pdf']),
    'contract-extracted'
  )
  assert.equal(
    getPdfToolDefaultOutputName('delete-pages', ['D:\\Docs\\contract.pdf']),
    'contract-edited'
  )
  assert.equal(
    getPdfToolDefaultOutputName('rotate-pages', ['D:\\Docs\\contract.pdf']),
    'contract-rotated'
  )
  assert.equal(getPdfToolDefaultOutputName('images-to-pdf', []), 'converted-images')
})

test('pdf tool classifies supported input paths and clamps render scale', () => {
  assert.equal(getPdfToolInputKind('D:\\Docs\\manual.PDF'), 'pdf')
  assert.equal(getPdfToolInputKind('D:\\Pictures\\cover.jpeg'), 'image')
  assert.equal(getPdfToolInputKind('D:\\Pictures\\archive.zip'), 'unknown')

  assert.equal(normalizePdfToolImageScale(undefined), 2)
  assert.equal(normalizePdfToolImageScale(0.2), 1)
  assert.equal(normalizePdfToolImageScale(8), 4)
  assert.equal(normalizePdfToolImageScale(3), 3)
})

test('pdf tool parses page selections with ranges, open ends, ordering, and dedupe', () => {
  assert.deepEqual(parsePdfToolPageSelection(undefined, 4), [0, 1, 2, 3])
  assert.deepEqual(parsePdfToolPageSelection('', 4), [0, 1, 2, 3])
  assert.deepEqual(parsePdfToolPageSelection('1, 3-4, 6-', 8), [0, 2, 3, 5, 6, 7])
  assert.deepEqual(parsePdfToolPageSelection('4,2,4,1-2', 5), [3, 1, 0])
})

test('pdf tool rejects invalid page selections with clear errors', () => {
  assert.throws(() => parsePdfToolPageSelection('0', 5), /页码必须从 1 开始/)
  assert.throws(() => parsePdfToolPageSelection('8', 5), /超出 PDF 总页数/)
  assert.throws(() => parsePdfToolPageSelection('5-2', 5), /页码范围不正确/)
  assert.throws(() => parsePdfToolPageSelection('abc', 5), /页码格式不正确/)
})
