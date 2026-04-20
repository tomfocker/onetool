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
  selectedPath
}: {
  session: SpaceCleanupSession | null
  selectedPath: string | null
}) {
  const activeSession = session ?? createIdleSpaceCleanupSession()
  const selectedNode = findSpaceCleanupNodeByPath(activeSession.tree, selectedPath) ?? activeSession.tree
  const currentDirectory = selectedNode?.type === 'directory' ? selectedNode : activeSession.tree
  const treemapSource = getRenderableTreemapChildren(currentDirectory?.children)

  return {
    selectedNode,
    currentDirectory,
    breadcrumbs: getNodeBreadcrumbs(activeSession.tree, selectedNode?.path ?? null),
    largestFiles: activeSession.largestFiles,
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

  const viewModel = useMemo(() => buildSpaceCleanupViewModel({
    session,
    selectedPath
  }), [selectedPath, session])
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
