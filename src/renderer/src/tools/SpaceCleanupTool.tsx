import React from 'react'
import {
  FolderSearch,
  HardDrive,
  Trash2,
  FolderOpen,
  Copy,
  RefreshCw,
  StopCircle
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useGlobalStore } from '@/store'
import { formatSpaceCleanupBytes, type SpaceCleanupNode } from '../../../shared/spaceCleanup'
import { useSpaceCleanup } from '../hooks/useSpaceCleanup'

function TreeNode({
  node,
  selectedPath,
  onSelect,
  depth = 0
}: {
  node: SpaceCleanupNode
  selectedPath: string | null
  onSelect: (path: string) => void
  depth?: number
}) {
  const isSelected = selectedPath === node.path

  return (
    <div className="space-y-1">
      <button
        onClick={() => onSelect(node.path)}
        className={`w-full rounded-xl px-3 py-2 text-left transition-colors ${isSelected ? 'bg-indigo-500 text-white' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{node.name}</div>
            <div className={`truncate text-xs ${isSelected ? 'text-white/80' : 'text-muted-foreground'}`}>{node.type === 'directory' ? '目录' : '文件'}</div>
          </div>
          <div className={`shrink-0 text-xs font-semibold ${isSelected ? 'text-white/90' : 'text-muted-foreground'}`}>
            {formatSpaceCleanupBytes(node.sizeBytes)}
          </div>
        </div>
      </button>
      {node.type === 'directory' && (node.children ?? []).length > 0 ? (
        <div className="space-y-1">
          {node.children!.map((child) => (
            <TreeNode key={child.path} node={child} selectedPath={selectedPath} onSelect={onSelect} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function SpaceCleanupTool() {
  const showNotification = useGlobalStore((state) => state.showNotification)
  const {
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
    selectPath
  } = useSpaceCleanup()

  const handleChooseRoot = async () => {
    const result = await chooseRoot()
    if (!result.success) {
      showNotification({ type: 'error', message: result.error || '无法选择目录' })
    }
  }

  const handleStartScan = async () => {
    const result = await startScan()
    if (!result.success) {
      showNotification({ type: 'error', message: result.error || '扫描失败' })
    }
  }

  const handleRefreshScan = async () => {
    const result = await refreshScan()
    if (!result.success) {
      showNotification({ type: 'error', message: result.error || '重新扫描失败' })
    }
  }

  const handleDelete = async () => {
    if (!viewModel.selectedNode) {
      return
    }

    if (!window.confirm(`确认将 ${viewModel.selectedNode.name} 移到回收站吗？`)) {
      return
    }

    const result = await deleteSelectedPath()
    if (!result.success) {
      showNotification({ type: 'error', message: result.error || '删除失败' })
      return
    }

    showNotification({ type: 'success', message: '已移入回收站' })
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <HardDrive className="w-6 h-6 text-primary" />
          空间清理
        </h2>
        <p className="text-muted-foreground">扫描单个目录或盘符的空间占用，并用树图和大文件列表快速定位清理目标。</p>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <Input value={rootPath} readOnly placeholder="请选择扫描目录或磁盘根目录" className="h-11" />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void handleChooseRoot()}>
                <FolderSearch className="w-4 h-4 mr-2" />
                选择目录
              </Button>
              <Button onClick={() => void handleStartScan()} disabled={!actionState.canStartScan || pendingAction === 'scan'}>
                <RefreshCw className={`w-4 h-4 mr-2 ${pendingAction === 'scan' ? 'animate-spin' : ''}`} />
                {session.status === 'completed' ? '重新扫描' : '开始扫描'}
              </Button>
              <Button variant="outline" onClick={() => void cancelScan()} disabled={!actionState.canCancel}>
                <StopCircle className="w-4 h-4 mr-2" />
                取消扫描
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline">状态：{session.status}</Badge>
            <Badge variant="outline">{viewModel.modeLabel}</Badge>
            {viewModel.partialLabel ? <Badge variant="outline">{viewModel.partialLabel}</Badge> : null}
            {session.startedAt ? <Badge variant="outline">开始：{new Date(session.startedAt).toLocaleString('zh-CN')}</Badge> : null}
            {session.finishedAt ? <Badge variant="outline">完成：{new Date(session.finishedAt).toLocaleString('zh-CN')}</Badge> : null}
          </div>

          {viewModel.modeReason ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              {viewModel.modeReason}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-4">
            {viewModel.summaryCards.map((card) => (
              <div key={card.id} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">{card.label}</div>
                <div className="text-2xl font-black mt-1">{card.value}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[320px_1fr_360px]">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle>目录树</CardTitle>
            <CardDescription>按大小排序，可直接切换当前聚焦目录。</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[720px] overflow-auto space-y-1">
            {session.tree ? (
              <TreeNode node={session.tree} selectedPath={selectedPath} onSelect={selectPath} />
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-8 text-sm text-muted-foreground text-center">
                扫描完成后会在这里显示目录树。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle>Treemap</CardTitle>
            <CardDescription>
              {viewModel.currentDirectory ? `当前聚焦：${viewModel.currentDirectory.name}` : '扫描完成后显示可视化矩形图'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {viewModel.breadcrumbs.map((item) => (
                <button
                  key={item.path}
                  onClick={() => selectPath(item.path)}
                  className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-xs font-semibold hover:bg-indigo-500 hover:text-white transition-colors"
                >
                  {item.name}
                </button>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3">
              {viewModel.treemapItems.length > 0 ? (
                <svg viewBox="0 0 640 280" className="w-full h-[280px] rounded-2xl overflow-hidden">
                  {viewModel.treemapItems.map((item, index) => (
                    <g key={item.path} onClick={() => selectPath(item.path)} className="cursor-pointer">
                      <rect
                        x={item.x}
                        y={item.y}
                        width={item.width}
                        height={item.height}
                        rx={16}
                        fill={index % 2 === 0 ? '#4f46e5' : '#7c3aed'}
                        opacity={selectedPath === item.path ? 0.95 : 0.8}
                      />
                      <text x={item.x + 14} y={item.y + 28} fill="#ffffff" fontSize="14" fontWeight="700">
                        {item.name}
                      </text>
                      <text x={item.x + 14} y={item.y + 48} fill="#e0e7ff" fontSize="12">
                        {formatSpaceCleanupBytes(item.sizeBytes)}
                      </text>
                    </g>
                  ))}
                </svg>
              ) : (
                <div className="h-[280px] rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-sm text-muted-foreground">
                  当前没有可渲染的空间块。
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle>当前条目</CardTitle>
              <CardDescription>打开位置、复制路径或移到回收站。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {viewModel.selectedNode ? (
                <>
                  <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-900 p-4 space-y-2">
                    <div className="text-lg font-bold">{viewModel.selectedNode.name}</div>
                    <div className="text-xs text-muted-foreground break-all">{viewModel.selectedNode.path}</div>
                    <div className="text-sm font-medium">{formatSpaceCleanupBytes(viewModel.selectedNode.sizeBytes)}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" disabled={!actionState.canOpen} onClick={() => void openSelectedPath()}>
                      <FolderOpen className="w-4 h-4 mr-2" />
                      打开位置
                    </Button>
                    <Button variant="outline" size="sm" disabled={!actionState.canCopy} onClick={() => void copySelectedPath()}>
                      <Copy className="w-4 h-4 mr-2" />
                      复制路径
                    </Button>
                    <Button size="sm" variant="destructive" disabled={!actionState.canDelete} onClick={() => void handleDelete()}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      删除到回收站
                    </Button>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-8 text-sm text-muted-foreground text-center">
                  请选择目录树或 Treemap 中的条目。
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle>大文件列表</CardTitle>
              <CardDescription>按体积降序保留当前扫描中最大的文件。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[360px] overflow-auto">
              {viewModel.largestFiles.length > 0 ? viewModel.largestFiles.map((item) => (
                <button
                  key={item.path}
                  onClick={() => selectPath(item.path)}
                  className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-left hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{item.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{item.path}</div>
                    </div>
                    <div className="shrink-0 text-sm font-bold">{formatSpaceCleanupBytes(item.sizeBytes)}</div>
                  </div>
                </button>
              )) : (
                <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-8 text-sm text-muted-foreground text-center">
                  扫描完成后会在这里显示最大文件。
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
