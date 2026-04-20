const test = require('node:test')
const assert = require('node:assert/strict')

const {
  getSpaceCleanupSummary,
  trimLargestFiles,
  getRenderableTreemapChildren
} = require('./spaceCleanup.ts')

test('getSpaceCleanupSummary aggregates directory and file counts from a scanned tree', () => {
  const summary = getSpaceCleanupSummary({
    id: 'root',
    name: 'root',
    path: 'C:\\scan',
    type: 'directory',
    sizeBytes: 150,
    childrenCount: 2,
    fileCount: 2,
    directoryCount: 1,
    skippedChildren: 1,
    children: [
      {
        id: 'dir-1',
        name: 'src',
        path: 'C:\\scan\\src',
        type: 'directory',
        sizeBytes: 100,
        childrenCount: 1,
        fileCount: 1,
        directoryCount: 0,
        skippedChildren: 0,
        children: []
      },
      {
        id: 'file-1',
        name: 'demo.txt',
        path: 'C:\\scan\\demo.txt',
        type: 'file',
        sizeBytes: 50,
        extension: '.txt',
        childrenCount: 0,
        fileCount: 0,
        directoryCount: 0,
        skippedChildren: 0
      }
    ]
  })

  assert.equal(summary.totalBytes, 150)
  assert.equal(summary.scannedFiles, 2)
  assert.equal(summary.scannedDirectories, 2)
  assert.equal(summary.skippedEntries, 1)
})

test('trimLargestFiles keeps only the largest files in descending order', () => {
  const trimmed = trimLargestFiles(
    [
      { path: 'C:\\a.bin', name: 'a.bin', sizeBytes: 10, extension: '.bin' },
      { path: 'C:\\b.bin', name: 'b.bin', sizeBytes: 40, extension: '.bin' }
    ],
    { path: 'C:\\c.bin', name: 'c.bin', sizeBytes: 20, extension: '.bin' },
    2
  )

  assert.deepEqual(trimmed.map((item) => item.name), ['b.bin', 'c.bin'])
})

test('getRenderableTreemapChildren filters out zero-sized nodes before rendering', () => {
  const children = getRenderableTreemapChildren([
    {
      id: 'file-0',
      name: 'empty.log',
      path: 'C:\\scan\\empty.log',
      type: 'file',
      sizeBytes: 0,
      extension: '.log',
      childrenCount: 0,
      fileCount: 0,
      directoryCount: 0,
      skippedChildren: 0
    },
    {
      id: 'file-1',
      name: 'archive.zip',
      path: 'C:\\scan\\archive.zip',
      type: 'file',
      sizeBytes: 256,
      extension: '.zip',
      childrenCount: 0,
      fileCount: 0,
      directoryCount: 0,
      skippedChildren: 0
    }
  ])

  assert.equal(children.length, 1)
  assert.equal(children[0].name, 'archive.zip')
})
