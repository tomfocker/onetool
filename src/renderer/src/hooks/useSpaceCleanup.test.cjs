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
  getInitialExpandedSpaceCleanupPaths,
  toggleExpandedSpaceCleanupPath,
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
  assert.equal(viewModel.partialLabel, '已限制到前两级目录')
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

test('buildSpaceCleanupViewModel falls back to largest-file metadata when the compact tree omits a deep file node', () => {
  const viewModel = buildSpaceCleanupViewModel({
    session: {
      ...createIdleSpaceCleanupSession(),
      status: 'completed',
      scanMode: 'ntfs-fast',
      largestFiles: [
        {
          path: 'D:\\deep\\movie.mkv',
          name: 'movie.mkv',
          sizeBytes: 4096,
          extension: '.mkv'
        }
      ],
      tree: {
        id: 'root',
        name: 'D:\\',
        path: 'D:\\',
        type: 'directory',
        sizeBytes: 4096,
        childrenCount: 1,
        fileCount: 1,
        directoryCount: 1,
        skippedChildren: 0,
        children: [
          {
            id: 'dir-1',
            name: 'deep',
            path: 'D:\\deep',
            type: 'directory',
            sizeBytes: 4096,
            childrenCount: 1,
            fileCount: 1,
            directoryCount: 0,
            skippedChildren: 0,
            children: []
          }
        ]
      }
    },
    selectedPath: 'D:\\deep\\movie.mkv'
  })

  assert.equal(viewModel.selectedNode?.path, 'D:\\deep\\movie.mkv')
  assert.equal(viewModel.selectedNode?.type, 'file')
  assert.equal(viewModel.selectedNode?.sizeBytes, 4096)
})

test('buildSpaceCleanupViewModel switches the donut root to a selected compact child directory summary', () => {
  const viewModel = buildSpaceCleanupViewModel({
    session: {
      ...createIdleSpaceCleanupSession(),
      status: 'completed',
      scanMode: 'ntfs-fast',
      tree: {
        id: 'root',
        name: 'C:\\',
        path: 'C:\\',
        type: 'directory',
        sizeBytes: 1000,
        childrenCount: 2,
        fileCount: 10,
        directoryCount: 2,
        skippedChildren: 0,
        children: [
          {
            id: 'dir-users',
            name: 'Users',
            path: 'C:\\Users',
            type: 'directory',
            sizeBytes: 600,
            childrenCount: 7,
            fileCount: 100,
            directoryCount: 20,
            skippedChildren: 0,
            children: []
          },
          {
            id: 'dir-windows',
            name: 'Windows',
            path: 'C:\\Windows',
            type: 'directory',
            sizeBytes: 400,
            childrenCount: 5,
            fileCount: 80,
            directoryCount: 10,
            skippedChildren: 0,
            children: []
          }
        ]
      }
    },
    selectedPath: 'C:\\Users'
  })

  assert.equal(viewModel.distributionRoot?.path, 'C:\\Users')
  assert.equal(viewModel.distributionSegments.length, 1)
  assert.equal(viewModel.distributionSegments[0].path, 'C:\\Users')
  assert.equal(viewModel.distributionSegments[0].percent, 1)
  assert.match(viewModel.distributionNote, /当前目录的摘要视图/)
})

test('buildSpaceCleanupViewModel prefers on-demand hydrated children for deep ntfs-fast directories', () => {
  const viewModel = buildSpaceCleanupViewModel({
    session: {
      ...createIdleSpaceCleanupSession(),
      status: 'completed',
      scanMode: 'ntfs-fast',
      tree: {
        id: 'root',
        name: 'D:\\',
        path: 'D:\\',
        type: 'directory',
        sizeBytes: 1000,
        childrenCount: 1,
        fileCount: 10,
        directoryCount: 3,
        skippedChildren: 0,
        children: [
          {
            id: 'dir-vmware',
            name: 'vmware',
            path: 'D:\\vmware',
            type: 'directory',
            sizeBytes: 800,
            childrenCount: 1,
            fileCount: 8,
            directoryCount: 2,
            skippedChildren: 0,
            children: [
              {
                id: 'dir-win10',
                name: 'windows 10',
                path: 'D:\\vmware\\windows 10',
                type: 'directory',
                sizeBytes: 800,
                childrenCount: 2,
                fileCount: 8,
                directoryCount: 1,
                skippedChildren: 0,
                children: []
              }
            ]
          }
        ]
      }
    },
    selectedPath: 'D:\\vmware\\windows 10',
    hydratedDirectories: {
      'D:\\vmware\\windows 10': {
        id: 'dir-win10',
        name: 'windows 10',
        path: 'D:\\vmware\\windows 10',
        type: 'directory',
        sizeBytes: 800,
        childrenCount: 2,
        fileCount: 8,
        directoryCount: 1,
        skippedChildren: 0,
        children: [
          {
            id: 'file-flat',
            name: 'disk-flat.vmdk',
            path: 'D:\\vmware\\windows 10\\disk-flat.vmdk',
            type: 'file',
            sizeBytes: 600,
            extension: '.vmdk',
            childrenCount: 0,
            fileCount: 0,
            directoryCount: 0,
            skippedChildren: 0
          },
          {
            id: 'dir-snaps',
            name: 'snapshots',
            path: 'D:\\vmware\\windows 10\\snapshots',
            type: 'directory',
            sizeBytes: 200,
            childrenCount: 4,
            fileCount: 4,
            directoryCount: 0,
            skippedChildren: 0,
            children: []
          }
        ]
      }
    }
  })

  assert.equal(viewModel.distributionRoot?.path, 'D:\\vmware\\windows 10')
  assert.equal(viewModel.tree?.path, 'D:\\')
  assert.equal(viewModel.tree?.children?.[0].children?.[0].children?.length, 2)
  assert.equal(viewModel.distributionSegments.length, 2)
  assert.equal(viewModel.distributionSegments[0].path, 'D:\\vmware\\windows 10\\disk-flat.vmdk')
  assert.equal(viewModel.distributionSegments[0].canDrill, false)
  assert.equal(viewModel.distributionSegments[1].path, 'D:\\vmware\\windows 10\\snapshots')
  assert.equal(viewModel.distributionSegments[1].canDrill, true)
  assert.equal(viewModel.distributionNote, null)
})

test('buildSpaceCleanupViewModel marks a selected deep directory as distribution-loading while hydration is pending', () => {
  const viewModel = buildSpaceCleanupViewModel({
    session: {
      ...createIdleSpaceCleanupSession(),
      status: 'completed',
      scanMode: 'ntfs-fast',
      tree: {
        id: 'root',
        name: 'D:\\',
        path: 'D:\\',
        type: 'directory',
        sizeBytes: 1000,
        childrenCount: 1,
        fileCount: 10,
        directoryCount: 3,
        skippedChildren: 0,
        children: [
          {
            id: 'dir-vmware',
            name: 'vmware',
            path: 'D:\\vmware',
            type: 'directory',
            sizeBytes: 800,
            childrenCount: 1,
            fileCount: 8,
            directoryCount: 2,
            skippedChildren: 0,
            children: [
              {
                id: 'dir-win10',
                name: 'windows 10',
                path: 'D:\\vmware\\windows 10',
                type: 'directory',
                sizeBytes: 800,
                childrenCount: 2,
                fileCount: 8,
                directoryCount: 1,
                skippedChildren: 0,
                children: []
              }
            ]
          }
        ]
      }
    },
    selectedPath: 'D:\\vmware\\windows 10',
    loadingDirectoryPath: 'D:\\vmware\\windows 10'
  })

  assert.equal(viewModel.distributionLoading, true)
})

test('getInitialExpandedSpaceCleanupPaths keeps only the root expanded by default', () => {
  const expandedPaths = toPlainObject(getInitialExpandedSpaceCleanupPaths({
    id: 'root',
    name: 'D:\\',
    path: 'D:\\',
    type: 'directory',
    sizeBytes: 1000,
    childrenCount: 2,
    fileCount: 0,
    directoryCount: 2,
    skippedChildren: 0,
    children: [
      {
        id: 'vmware',
        name: 'vmware',
        path: 'D:\\vmware',
        type: 'directory',
        sizeBytes: 600,
        childrenCount: 1,
        fileCount: 0,
        directoryCount: 1,
        skippedChildren: 0,
        children: [
          {
            id: 'vm',
            name: 'windows 10',
            path: 'D:\\vmware\\windows 10',
            type: 'directory',
            sizeBytes: 600,
            childrenCount: 0,
            fileCount: 0,
            directoryCount: 0,
            skippedChildren: 0,
            children: []
          }
        ]
      }
    ]
  }))

  assert.deepEqual(expandedPaths, ['D:\\'])
})

test('toggleExpandedSpaceCleanupPath expands ancestors and toggles nested directories', () => {
  const tree = {
    id: 'root',
    name: 'D:\\',
    path: 'D:\\',
    type: 'directory',
    sizeBytes: 1000,
    childrenCount: 2,
    fileCount: 0,
    directoryCount: 2,
    skippedChildren: 0,
    children: [
      {
        id: 'vmware',
        name: 'vmware',
        path: 'D:\\vmware',
        type: 'directory',
        sizeBytes: 600,
        childrenCount: 1,
        fileCount: 0,
        directoryCount: 1,
        skippedChildren: 0,
        children: [
          {
            id: 'vm',
            name: 'windows 10',
            path: 'D:\\vmware\\windows 10',
            type: 'directory',
            sizeBytes: 600,
            childrenCount: 0,
            fileCount: 0,
            directoryCount: 0,
            skippedChildren: 0,
            children: []
          }
        ]
      }
    ]
  }

  const expanded = toPlainObject(toggleExpandedSpaceCleanupPath({
    tree,
    expandedPaths: ['D:\\'],
    targetPath: 'D:\\vmware'
  }))
  const collapsed = toPlainObject(toggleExpandedSpaceCleanupPath({
    tree,
    expandedPaths: expanded,
    targetPath: 'D:\\vmware'
  }))

  assert.deepEqual(expanded, ['D:\\', 'D:\\vmware'])
  assert.deepEqual(collapsed, ['D:\\'])
})

test('buildSpaceCleanupViewModel builds merged distribution segments and largest-file bars', () => {
  const viewModel = buildSpaceCleanupViewModel({
    session: {
      ...createIdleSpaceCleanupSession(),
      status: 'completed',
      largestFiles: [
        { path: 'D:\\a.iso', name: 'a.iso', sizeBytes: 1000, extension: '.iso' },
        { path: 'D:\\b.zip', name: 'b.zip', sizeBytes: 500, extension: '.zip' }
      ],
      tree: {
        id: 'root',
        name: 'D:\\',
        path: 'D:\\',
        type: 'directory',
        sizeBytes: 2600,
        childrenCount: 3,
        fileCount: 2,
        directoryCount: 1,
        skippedChildren: 0,
        children: [
          {
            id: 'dir-1',
            name: 'games',
            path: 'D:\\games',
            type: 'directory',
            sizeBytes: 1200,
            childrenCount: 4,
            fileCount: 8,
            directoryCount: 2,
            skippedChildren: 0,
            children: []
          },
          {
            id: 'dir-2',
            name: 'ai',
            path: 'D:\\ai',
            type: 'directory',
            sizeBytes: 900,
            childrenCount: 6,
            fileCount: 10,
            directoryCount: 4,
            skippedChildren: 0,
            children: []
          },
          {
            id: 'file-1',
            name: 'archive.iso',
            path: 'D:\\archive.iso',
            type: 'file',
            sizeBytes: 500,
            childrenCount: 0,
            fileCount: 0,
            directoryCount: 0,
            skippedChildren: 0,
            extension: '.iso'
          }
        ]
      }
    },
    selectedPath: null
  })

  assert.equal(viewModel.distributionSegments.length, 3)
  assert.equal(viewModel.distributionSegments[0].name, 'games')
  assert.equal(viewModel.distributionSegments[0].percent, 1200 / 2600)
  assert.equal(viewModel.largestFileBars.length, 2)
  assert.equal(viewModel.largestFileBars[1].percentOfLargest, 0.5)
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
