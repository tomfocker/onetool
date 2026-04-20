const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadUseSpaceCleanupModule() {
  const filePath = path.join(__dirname, 'useSpaceCleanup.ts')
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
    if (specifier === 'react') {
      return {
        useCallback: (fn) => fn,
        useEffect: () => undefined,
        useMemo: (factory) => factory(),
        useRef: (value) => ({ current: value }),
        useState: () => {
          throw new Error('React hooks should not run in this unit test')
        }
      }
    }

    if (specifier === '../../../shared/spaceCleanup') {
      return require(path.join(__dirname, '../../../shared/spaceCleanup.ts'))
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
    process
  }, { filename: filePath })

  return module.exports
}

const {
  findSpaceCleanupNodeByPath,
  buildSpaceCleanupViewModel,
  getSpaceCleanupActionAvailability,
  layoutTreemapItems
} = loadUseSpaceCleanupModule()
const { createIdleSpaceCleanupSession } = require(path.join(__dirname, '../../../shared/spaceCleanup.ts'))

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value))
}

test('findSpaceCleanupNodeByPath locates nested nodes in the scanned tree', () => {
  const tree = {
    id: 'root',
    name: 'scan',
    path: 'C:\\scan',
    type: 'directory',
    sizeBytes: 300,
    childrenCount: 1,
    fileCount: 1,
    directoryCount: 1,
    skippedChildren: 0,
    children: [
      {
        id: 'dir-1',
        name: 'src',
        path: 'C:\\scan\\src',
        type: 'directory',
        sizeBytes: 300,
        childrenCount: 1,
        fileCount: 1,
        directoryCount: 0,
        skippedChildren: 0,
        children: [
          {
            id: 'file-1',
            name: 'index.ts',
            path: 'C:\\scan\\src\\index.ts',
            type: 'file',
            sizeBytes: 300,
            extension: '.ts',
            childrenCount: 0,
            fileCount: 0,
            directoryCount: 0,
            skippedChildren: 0
          }
        ]
      }
    ]
  }

  const found = findSpaceCleanupNodeByPath(tree, 'C:\\scan\\src\\index.ts')

  assert.equal(found?.name, 'index.ts')
})

test('buildSpaceCleanupViewModel exposes summary cards and the selected node details', () => {
  const viewModel = buildSpaceCleanupViewModel({
    session: {
      sessionId: 'session-1',
      rootPath: 'C:\\scan',
      status: 'completed',
      startedAt: '2026-04-20T15:00:00.000Z',
      finishedAt: '2026-04-20T15:00:03.000Z',
      summary: {
        totalBytes: 500,
        scannedFiles: 2,
        scannedDirectories: 2,
        skippedEntries: 1,
        largestFile: {
          path: 'C:\\scan\\movie.mkv',
          name: 'movie.mkv',
          sizeBytes: 450,
          extension: '.mkv'
        }
      },
      largestFiles: [
        {
          path: 'C:\\scan\\movie.mkv',
          name: 'movie.mkv',
          sizeBytes: 450,
          extension: '.mkv'
        }
      ],
      tree: {
        id: 'root',
        name: 'scan',
        path: 'C:\\scan',
        type: 'directory',
        sizeBytes: 500,
        childrenCount: 1,
        fileCount: 2,
        directoryCount: 1,
        skippedChildren: 1,
        children: [
          {
            id: 'file-1',
            name: 'movie.mkv',
            path: 'C:\\scan\\movie.mkv',
            type: 'file',
            sizeBytes: 450,
            extension: '.mkv',
            childrenCount: 0,
            fileCount: 0,
            directoryCount: 0,
            skippedChildren: 0
          }
        ]
      },
      error: null
    },
    selectedPath: 'C:\\scan\\movie.mkv'
  })

  assert.equal(viewModel.summaryCards[0].value, '500 B')
  assert.equal(viewModel.selectedNode?.name, 'movie.mkv')
  assert.equal(viewModel.breadcrumbs.at(-1)?.path, 'C:\\scan\\movie.mkv')
})

test('buildSpaceCleanupViewModel exposes scan mode, fallback reason, and partial result labels', () => {
  const viewModel = buildSpaceCleanupViewModel({
    session: {
      ...createIdleSpaceCleanupSession(),
      status: 'scanning',
      scanMode: 'filesystem',
      scanModeReason: '当前路径不是 NTFS 根盘',
      isPartial: true
    },
    selectedPath: null
  })

  assert.equal(viewModel.modeLabel, '普通扫描')
  assert.match(viewModel.modeReason, /NTFS 根盘/)
  assert.equal(viewModel.partialLabel, '结果正在持续补全')
})

test('buildSpaceCleanupViewModel marks ntfs-fast sessions explicitly', () => {
  const viewModel = buildSpaceCleanupViewModel({
    session: {
      ...createIdleSpaceCleanupSession(),
      status: 'completed',
      scanMode: 'ntfs-fast',
      isPartial: false
    },
    selectedPath: null
  })

  assert.equal(viewModel.modeLabel, '极速扫描（NTFS）')
  assert.equal(viewModel.modeReason, null)
  assert.equal(viewModel.partialLabel, null)
})

test('getSpaceCleanupActionAvailability locks destructive actions while scanning', () => {
  assert.deepEqual(
    toPlainObject(getSpaceCleanupActionAvailability({
      status: 'scanning',
      selectedNode: { path: 'C:\\scan\\movie.mkv', type: 'file' }
    })),
    {
      canOpen: true,
      canCopy: true,
      canDelete: false,
      canCancel: true,
      canStartScan: false
    }
  )
})

test('layoutTreemapItems allocates rectangle area only to renderable nodes', () => {
  const items = layoutTreemapItems(
    [
      { path: 'C:\\scan\\movie.mkv', name: 'movie.mkv', sizeBytes: 300 },
      { path: 'C:\\scan\\empty.log', name: 'empty.log', sizeBytes: 0 },
      { path: 'C:\\scan\\clip.mp4', name: 'clip.mp4', sizeBytes: 100 }
    ],
    400,
    200
  )

  assert.equal(items.length, 2)
  assert.equal(items[0].width + items[1].width, 400)
})
