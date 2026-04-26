import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createIdleSpaceCleanupSession,
  formatSpaceCleanupBytes,
  getRenderableTreemapChildren,
  type SpaceCleanupNode,
  type SpaceCleanupSession
} from '../../../shared/spaceCleanup'

type SpaceCleanupTreemapItem = {
  path: string
  name: string
  sizeBytes: number
  x: number
  y: number
  width: number
  height: number
}

type SpaceCleanupDistributionSegment = {
  path: string
  name: string
  sizeBytes: number
  percent: number
  color: string
  childLabel: string
  canDrill: boolean
}

type SpaceCleanupLargestFileBar = {
  path: string
  name: string
  sizeBytes: number
  percentOfLargest: number
  extension: string | null
}

type HydratedSpaceCleanupDirectoryMap = Record<string, SpaceCleanupNode>

type SpaceCleanupDistributionSource = {
  root: SpaceCleanupNode | null
  segments: SpaceCleanupDistributionSegment[]
  note: string | null
}

const SPACE_CLEANUP_CHART_COLORS = [
  '#4f46e5',
  '#7c3aed',
  '#2563eb',
  '#0891b2',
  '#0f766e',
  '#65a30d',
  '#d97706',
  '#dc2626'
]

function getNodeBreadcrumbs(root: SpaceCleanupNode | null, targetPath: string | null) {
  if (!root || !targetPath) {
    return root ? [{ path: root.path, name: root.name }] : []
  }

  const pathParts: Array<{ path: string; name: string }> = []

  function visit(node: SpaceCleanupNode): boolean {
    if (node.path === targetPath) {
      pathParts.push({ path: node.path, name: node.name })
      return true
    }

    for (const child of node.children ?? []) {
      if (visit(child)) {
        pathParts.unshift({ path: node.path, name: node.name })
        return true
      }
    }

    return false
  }

  visit(root)
  return pathParts
}

export function findSpaceCleanupNodeByPath(root: SpaceCleanupNode | null, targetPath: string | null): SpaceCleanupNode | null {
  if (!root || !targetPath) {
    return null
  }

  if (root.path === targetPath) {
    return root
  }

  for (const child of root.children ?? []) {
    const found = findSpaceCleanupNodeByPath(child, targetPath)
    if (found) {
      return found
    }
  }

  return null
}

function applyHydratedSpaceCleanupDirectories(
  node: SpaceCleanupNode | null,
  hydratedDirectories: HydratedSpaceCleanupDirectoryMap
): SpaceCleanupNode | null {
  if (!node) {
    return null
  }

  const hydratedNode = hydratedDirectories[node.path] ?? node

  if (hydratedNode.type !== 'directory') {
    return hydratedNode
  }

  const baseChildren = hydratedNode.children ?? []
  return {
    ...hydratedNode,
    children: baseChildren.map((child) => applyHydratedSpaceCleanupDirectories(child, hydratedDirectories)!)
  }
}

function findSpaceCleanupPathChain(root: SpaceCleanupNode | null, targetPath: string | null): string[] {
  if (!root || !targetPath) {
    return []
  }

  if (root.path === targetPath) {
    return [root.path]
  }

  for (const child of root.children ?? []) {
    const childChain = findSpaceCleanupPathChain(child, targetPath)
    if (childChain.length > 0) {
      return [root.path, ...childChain]
    }
  }

  return []
}

function collectDescendantSpaceCleanupPaths(node: SpaceCleanupNode | null): string[] {
  if (!node) {
    return []
  }

  const descendantPaths: string[] = []
  for (const child of node.children ?? []) {
    descendantPaths.push(child.path)
    descendantPaths.push(...collectDescendantSpaceCleanupPaths(child))
  }
  return descendantPaths
}

export function getInitialExpandedSpaceCleanupPaths(tree: SpaceCleanupNode | null): string[] {
  return tree ? [tree.path] : []
}

export function toggleExpandedSpaceCleanupPath({
  tree,
  expandedPaths,
  targetPath
}: {
  tree: SpaceCleanupNode | null
  expandedPaths: string[]
  targetPath: string
}): string[] {
  if (!tree) {
    return []
  }

  const nextExpanded = new Set(expandedPaths)
  const targetNode = findSpaceCleanupNodeByPath(tree, targetPath)
  if (!targetNode || targetNode.type !== 'directory') {
    return [...nextExpanded]
  }

  if (nextExpanded.has(targetPath)) {
    nextExpanded.delete(targetPath)
    for (const descendantPath of collectDescendantSpaceCleanupPaths(targetNode)) {
      nextExpanded.delete(descendantPath)
    }
    return [...nextExpanded]
  }

  for (const path of findSpaceCleanupPathChain(tree, targetPath)) {
    nextExpanded.add(path)
  }
  return [...nextExpanded]
}

export function layoutTreemapItems(
  items: Array<{ path: string; name: string; sizeBytes: number }>,
  width: number,
  height: number
): SpaceCleanupTreemapItem[] {
  const renderableItems = items.filter((item) => item.sizeBytes > 0)
  const totalSize = renderableItems.reduce((sum, item) => sum + item.sizeBytes, 0)

  if (renderableItems.length === 0 || totalSize <= 0 || width <= 0 || height <= 0) {
    return []
  }

  let offsetX = 0
  return renderableItems.map((item, index) => {
    const remainingWidth = width - offsetX
    const isLast = index === renderableItems.length - 1
    const itemWidth = isLast ? remainingWidth : Math.max(1, Math.round((item.sizeBytes / totalSize) * width))
    const rect = {
      ...item,
      x: offsetX,
      y: 0,
      width: isLast ? remainingWidth : itemWidth,
      height
    }
    offsetX += rect.width
    return rect
  })
}

function buildDistributionSegments(
  nodes: SpaceCleanupNode[] | undefined | null,
  totalSize: number,
  maxSegments = 8
): SpaceCleanupDistributionSegment[] {
  const sortedNodes = getRenderableTreemapChildren(nodes)

  if (sortedNodes.length === 0 || totalSize <= 0) {
    return []
  }

  const head = sortedNodes.slice(0, maxSegments)
  const tail = sortedNodes.slice(maxSegments)
  const tailSize = tail.reduce((sum, item) => sum + item.sizeBytes, 0)

  const segments = head.map((item, index) => ({
    path: item.path,
    name: item.name,
    sizeBytes: item.sizeBytes,
    percent: item.sizeBytes / totalSize,
    color: SPACE_CLEANUP_CHART_COLORS[index % SPACE_CLEANUP_CHART_COLORS.length],
    childLabel: item.type === 'directory'
      ? `${item.childrenCount} 个直接子项`
      : item.extension || '文件',
    canDrill: item.type === 'directory'
  }))

  if (tailSize > 0) {
    segments.push({
      path: '__other__',
      name: '其他',
      sizeBytes: tailSize,
      percent: tailSize / totalSize,
      color: '#94a3b8',
      childLabel: `${tail.length} 项已合并`,
      canDrill: false
    })
  }

  return segments
}

function buildLargestFileBars(largestFiles: SpaceCleanupSession['largestFiles']): SpaceCleanupLargestFileBar[] {
  if (largestFiles.length === 0) {
    return []
  }

  const largestSize = largestFiles[0]?.sizeBytes ?? 0
  if (largestSize <= 0) {
    return []
  }

  return largestFiles.slice(0, 10).map((item) => ({
    path: item.path,
    name: item.name,
    sizeBytes: item.sizeBytes,
    percentOfLargest: item.sizeBytes / largestSize,
    extension: item.extension
  }))
}

function buildDistributionSource(
  tree: SpaceCleanupNode | null,
  currentDirectory: SpaceCleanupNode | null,
  scanMode: SpaceCleanupSession['scanMode']
): SpaceCleanupDistributionSource {
  if (!tree) {
    return {
      root: null,
      segments: [],
      note: null
    }
  }

  const activeDirectory = currentDirectory ?? tree
  const directChildren = buildDistributionSegments(activeDirectory.children, activeDirectory.sizeBytes)

  if (directChildren.length > 0) {
    return {
      root: activeDirectory,
      segments: directChildren,
      note: null
    }
  }

  if (scanMode === 'ntfs-fast' && activeDirectory.path !== tree.path && activeDirectory.sizeBytes > 0) {
    return {
      root: activeDirectory,
      segments: [
        {
          path: activeDirectory.path,
          name: activeDirectory.name,
          sizeBytes: activeDirectory.sizeBytes,
          percent: 1,
          color: SPACE_CLEANUP_CHART_COLORS[0],
          childLabel: '当前只拿到了目录摘要大小',
          canDrill: true
        }
      ],
      note: '极速扫描当前只展开顶层摘要。已切换为当前目录的摘要视图，深层分布需要后续展开数据。'
    }
  }

  return {
    root: tree,
    segments: buildDistributionSegments(tree.children, tree.sizeBytes),
    note:
      scanMode === 'ntfs-fast' && activeDirectory.path !== tree.path
        ? '极速扫描当前只展开顶层摘要，图形统计已回到可交互的上一级视图。'
        : null
  }
}

export function getSpaceCleanupActionAvailability({
  status,
  selectedNode,
  rootPath
}: {
  status: SpaceCleanupSession['status']
  selectedNode: Pick<SpaceCleanupNode, 'path' | 'type'> | null
  rootPath?: string | null
}) {
  const hasSelection = Boolean(selectedNode?.path)
  const scanning = status === 'scanning'
  const deletingRoot = hasSelection && selectedNode?.path === rootPath

  return {
    canOpen: hasSelection,
    canCopy: hasSelection,
    canDelete: hasSelection && !scanning && !deletingRoot,
    canCancel: scanning,
    canStartScan: !scanning
  }
}

export function buildSpaceCleanupViewModel({
  session,
  selectedPath,
  hydratedDirectories = {},
  loadingDirectoryPath = null
}: {
  session: SpaceCleanupSession | null
  selectedPath: string | null
  hydratedDirectories?: HydratedSpaceCleanupDirectoryMap
  loadingDirectoryPath?: string | null
}) {
  const activeSession = session ?? createIdleSpaceCleanupSession()
  const resolvedTree = applyHydratedSpaceCleanupDirectories(activeSession.tree, hydratedDirectories)
  const largestFileMatch = selectedPath
    ? activeSession.largestFiles.find((item) => item.path === selectedPath) ?? null
    : null
  const selectedNode =
    findSpaceCleanupNodeByPath(resolvedTree, selectedPath) ??
    (largestFileMatch
      ? {
          id: largestFileMatch.path,
          name: largestFileMatch.name,
          path: largestFileMatch.path,
          type: 'file' as const,
          sizeBytes: largestFileMatch.sizeBytes,
          extension: largestFileMatch.extension,
          childrenCount: 0,
          fileCount: 0,
          directoryCount: 0,
          skippedChildren: 0
        }
      : null) ??
    resolvedTree
  const currentDirectory = selectedNode?.type === 'directory' ? selectedNode : resolvedTree
  const distributionSource = buildDistributionSource(
    resolvedTree,
    currentDirectory,
    activeSession.scanMode
  )
  const distributionRoot = distributionSource.root
  const distributionSegments = distributionSource.segments
  const treemapSource = getRenderableTreemapChildren(distributionRoot?.children)
  const largestFileBars = buildLargestFileBars(activeSession.largestFiles)

  return {
    tree: resolvedTree,
    selectedNode,
    currentDirectory,
    distributionRoot,
    distributionLoading: currentDirectory?.type === 'directory' && currentDirectory.path === loadingDirectoryPath,
    modeLabel: activeSession.scanMode === 'ntfs-fast' ? '极速扫描（NTFS）' : '普通扫描',
    modeReason: activeSession.scanModeReason,
    partialLabel: activeSession.isPartial
      ? activeSession.scanMode === 'filesystem'
        ? '已限制到前两级目录'
        : '结果正在持续补全'
      : null,
    distributionNote: distributionSource.note,
    distributionSegments,
    breadcrumbs: getNodeBreadcrumbs(resolvedTree, selectedNode?.path ?? null),
    largestFiles: activeSession.largestFiles,
    largestFileBars,
    summaryCards: [
      { id: 'size', label: '扫描大小', value: formatSpaceCleanupBytes(activeSession.summary.totalBytes) },
      { id: 'files', label: '文件数', value: activeSession.summary.scannedFiles },
      { id: 'dirs', label: '目录数', value: activeSession.summary.scannedDirectories },
      { id: 'skipped', label: '已跳过', value: activeSession.summary.skippedEntries }
    ],
    treemapItems: layoutTreemapItems(
      treemapSource.map((item) => ({
        path: item.path,
        name: item.name,
        sizeBytes: item.sizeBytes
      })),
      640,
      280
    )
  }
}

export function useSpaceCleanup() {
  const [session, setSession] = useState<SpaceCleanupSession>(createIdleSpaceCleanupSession())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [rootPath, setRootPath] = useState('')
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [hydratedDirectories, setHydratedDirectories] = useState<HydratedSpaceCleanupDirectoryMap>({})
  const [loadingDirectoryPath, setLoadingDirectoryPath] = useState<string | null>(null)
  const hasBootstrappedRef = useRef(false)

  const applySession = useCallback((nextSession: SpaceCleanupSession) => {
    setSession(nextSession)
    if (nextSession.rootPath) {
      setRootPath(nextSession.rootPath)
    }
    if (!selectedPath && nextSession.tree) {
      setSelectedPath(nextSession.tree.path)
    }
  }, [selectedPath])

  const chooseRoot = useCallback(async () => {
    const result = await window.electron.spaceCleanup.chooseRoot()
    if (result.success && result.data?.path) {
      setRootPath(result.data.path)
    }
    return result
  }, [])

  const startScan = useCallback(async (nextRootPath?: string) => {
    const targetPath = nextRootPath ?? rootPath
    if (!targetPath) {
      return { success: false, error: '请先选择扫描目录' }
    }

    setPendingAction('scan')
    const result = await window.electron.spaceCleanup.startScan(targetPath)
    if (result.success && result.data) {
      setHydratedDirectories({})
      setLoadingDirectoryPath(null)
      applySession(result.data)
      setSelectedPath(result.data.tree?.path ?? targetPath)
    }
    setPendingAction(null)
    return result
  }, [applySession, rootPath])

  const cancelScan = useCallback(async () => {
    const result = await window.electron.spaceCleanup.cancelScan()
    if (result.success && result.data) {
      applySession(result.data)
    }
    return result
  }, [applySession])

  const refreshScan = useCallback(async () => {
    return startScan(rootPath)
  }, [rootPath, startScan])

  const openSelectedPath = useCallback(async () => {
    if (!selectedPath) {
      return { success: false, error: '请先选择条目' }
    }
    return window.electron.spaceCleanup.openPath(selectedPath)
  }, [selectedPath])

  const copySelectedPath = useCallback(async () => {
    if (!selectedPath) {
      return { success: false, error: '请先选择条目' }
    }
    return window.electron.spaceCleanup.copyPath(selectedPath)
  }, [selectedPath])

  const deleteSelectedPath = useCallback(async () => {
    if (!selectedPath) {
      return { success: false, error: '请先选择条目' }
    }

    const result = await window.electron.spaceCleanup.deleteToTrash(selectedPath)
    if (result.success && rootPath) {
      await startScan(rootPath)
    }
    return result
  }, [rootPath, selectedPath, startScan])

  useEffect(() => {
    if (hasBootstrappedRef.current) {
      return
    }

    hasBootstrappedRef.current = true
    void window.electron.spaceCleanup.getSession().then((result) => {
      if (result.success && result.data) {
        setHydratedDirectories({})
        setLoadingDirectoryPath(null)
        applySession(result.data)
      }
    })
  }, [applySession])

  useEffect(() => {
    const unsubscribeProgress = window.electron.spaceCleanup.onProgress((nextSession) => {
      applySession(nextSession)
    })
    const unsubscribeComplete = window.electron.spaceCleanup.onComplete((nextSession) => {
      applySession(nextSession)
    })
    const unsubscribeError = window.electron.spaceCleanup.onError((nextSession) => {
      applySession(nextSession)
    })

    return () => {
      unsubscribeProgress()
      unsubscribeComplete()
      unsubscribeError()
    }
  }, [applySession])

  useEffect(() => {
    if (session.scanMode !== 'ntfs-fast' || !session.tree || !selectedPath) {
      return
    }

    const selectedNode = findSpaceCleanupNodeByPath(
      applyHydratedSpaceCleanupDirectories(session.tree, hydratedDirectories),
      selectedPath
    )

    if (!selectedNode || selectedNode.type !== 'directory') {
      return
    }

    if ((selectedNode.children ?? []).length > 0 || selectedNode.childrenCount === 0 || hydratedDirectories[selectedNode.path]) {
      return
    }

    let disposed = false
    setLoadingDirectoryPath(selectedNode.path)
    void window.electron.spaceCleanup.scanDirectoryBreakdown(selectedNode.path).then((result) => {
      if (!result.success || !result.data || disposed) {
        return
      }

      const breakdownNode = result.data

      setHydratedDirectories((current) => ({
        ...current,
        [breakdownNode.path]: breakdownNode
      }))
    }).finally(() => {
      if (!disposed) {
        setLoadingDirectoryPath((currentPath) => currentPath === selectedNode.path ? null : currentPath)
      }
    })

    return () => {
      disposed = true
    }
  }, [hydratedDirectories, selectedPath, session.scanMode, session.tree])

  const viewModel = useMemo(() => buildSpaceCleanupViewModel({
    session,
    selectedPath,
    hydratedDirectories,
    loadingDirectoryPath
  }), [hydratedDirectories, loadingDirectoryPath, selectedPath, session])
  const actionState = useMemo(() => getSpaceCleanupActionAvailability({
    status: session.status,
    selectedNode: viewModel.selectedNode ? { path: viewModel.selectedNode.path, type: viewModel.selectedNode.type } : null,
    rootPath: session.rootPath
  }), [session.rootPath, session.status, viewModel.selectedNode])

  return {
    session,
    rootPath,
    selectedPath,
    pendingAction,
    viewModel,
    actionState,
    chooseRoot,
    startScan,
    refreshScan,
    cancelScan,
    openSelectedPath,
    copySelectedPath,
    deleteSelectedPath,
    selectPath: setSelectedPath
  }
}
