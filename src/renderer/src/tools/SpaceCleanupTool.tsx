import React from 'react'
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FolderSearch,
  HardDrive,
  PieChart,
  RefreshCw,
  Sparkles,
  StopCircle
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useGlobalStore } from '@/store'
import { formatSpaceCleanupBytes, type SpaceCleanupNode } from '../../../shared/spaceCleanup'
import {
  getInitialExpandedSpaceCleanupPaths,
  toggleExpandedSpaceCleanupPath,
  useSpaceCleanup
} from '../hooks/useSpaceCleanup'

type DistributionSegment = {
  path: string
  name: string
  sizeBytes: number
  percent: number
  color: string
  childLabel: string
  canDrill: boolean
}

type LargestFileBar = {
  path: string
  name: string
  sizeBytes: number
  percentOfLargest: number
  extension: string | null
}

type TreeContextMenuState = {
  x: number
  y: number
  path: string
  name: string
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const radians = ((angleInDegrees - 90) * Math.PI) / 180
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians)
  }
}

function describeArcPath(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number
) {
  const outerStart = polarToCartesian(cx, cy, outerRadius, endAngle)
  const outerEnd = polarToCartesian(cx, cy, outerRadius, startAngle)
  const innerStart = polarToCartesian(cx, cy, innerRadius, endAngle)
  const innerEnd = polarToCartesian(cx, cy, innerRadius, startAngle)
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${innerStart.x} ${innerStart.y}`,
    'Z'
  ].join(' ')
}

function TreeNode({
  node,
  selectedPath,
  expandedPathSet,
  onSelect,
  onToggleExpand,
  onOpenContextMenu,
  depth = 0
}: {
  node: SpaceCleanupNode
  selectedPath: string | null
  expandedPathSet: Set<string>
  onSelect: (path: string) => void
  onToggleExpand: (path: string) => void
  onOpenContextMenu: (event: React.MouseEvent<HTMLButtonElement>, node: SpaceCleanupNode) => void
  depth?: number
}) {
  const isSelected = selectedPath === node.path
  const hasChildren = node.type === 'directory' && (node.children ?? []).length > 0
  const isExpanded = expandedPathSet.has(node.path)

  return (
    <div className="space-y-1">
      <button
        onClick={() => onSelect(node.path)}
        onContextMenu={(event) => onOpenContextMenu(event, node)}
        className={`w-full rounded-xl px-3 py-2 text-left transition-colors ${
          isSelected ? 'bg-indigo-500 text-white' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
        }`}
        style={{ paddingLeft: `${depth * 14 + 12}px` }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
              {hasChildren ? (
                <span
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleExpand(node.path)
                  }}
                  className={`flex h-5 w-5 items-center justify-center rounded-full ${
                    isSelected ? 'hover:bg-white/20' : 'hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </span>
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{node.name}</div>
              <div className={`truncate text-[11px] ${isSelected ? 'text-white/80' : 'text-muted-foreground'}`}>
                {node.type === 'directory' ? `${node.childrenCount} 个直接子项` : node.extension || '文件'}
              </div>
            </div>
          </div>
          <div className={`shrink-0 text-xs font-semibold ${isSelected ? 'text-white/90' : 'text-muted-foreground'}`}>
            {formatSpaceCleanupBytes(node.sizeBytes)}
          </div>
        </div>
      </button>
      {hasChildren && isExpanded ? (
        <div className="space-y-1">
          {node.children!.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              expandedPathSet={expandedPathSet}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onOpenContextMenu={onOpenContextMenu}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function DistributionDonut({
  segments,
  totalLabel,
  subtitle,
  selectedPath,
  onSelect
}: {
  segments: DistributionSegment[]
  totalLabel: string
  subtitle: string
  selectedPath: string | null
  onSelect: (path: string) => void
}) {
  if (segments.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-3xl border border-dashed border-zinc-300 text-sm text-muted-foreground dark:border-zinc-700">
        扫描完成后会在这里显示占用分布。
      </div>
    )
  }

  const size = 280
  const center = size / 2
  const outerRadius = 104
  const innerRadius = 62
  let startAngle = 0

  return (
    <div className="flex h-[280px] items-center justify-center rounded-3xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full max-w-[320px]">
        {segments.map((segment) => {
          const angle = Math.max(segment.percent * 360, 4)
          const endAngle = startAngle + angle
          const pathData = describeArcPath(center, center, outerRadius, innerRadius, startAngle, endAngle)
          const isSelected = selectedPath === segment.path
          const nextStart = endAngle
          const element = (
            <path
              key={segment.path}
              d={pathData}
              fill={segment.color}
              opacity={isSelected ? 1 : 0.9}
              className={`${segment.canDrill && segment.path !== '__other__' ? 'cursor-pointer' : 'cursor-default'} transition-all`}
              transform={isSelected ? `scale(1.02) translate(${-(center * 0.02)} ${-(center * 0.02)})` : undefined}
              onClick={segment.canDrill && segment.path !== '__other__' ? () => onSelect(segment.path) : undefined}
            />
          )
          startAngle = nextStart
          return element
        })}
        <circle cx={center} cy={center} r={innerRadius - 8} fill="white" className="dark:fill-zinc-950" />
        <text x={center} y={center - 12} textAnchor="middle" className="fill-zinc-500 text-[12px] font-medium dark:fill-zinc-400">
          当前总量
        </text>
        <text x={center} y={center + 14} textAnchor="middle" className="fill-zinc-950 text-[26px] font-black dark:fill-white">
          {totalLabel}
        </text>
        <text x={center} y={center + 36} textAnchor="middle" className="fill-zinc-500 text-[11px] dark:fill-zinc-400">
          {subtitle}
        </text>
      </svg>
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
    cancelScan,
    selectPath
  } = useSpaceCleanup()
  const [expandedPaths, setExpandedPaths] = React.useState<string[]>([])
  const [treeMenu, setTreeMenu] = React.useState<TreeContextMenuState | null>(null)
  const [aiLoading, setAiLoading] = React.useState(false)
  const [aiInsight, setAiInsight] = React.useState<{
    summary: string
    bullets: string[]
    warnings: string[]
    actions: string[]
  } | null>(null)

  React.useEffect(() => {
    setExpandedPaths(getInitialExpandedSpaceCleanupPaths(viewModel.tree))
  }, [session.sessionId, viewModel.tree?.path])

  React.useEffect(() => {
    if (!treeMenu) {
      return
    }

    const closeMenu = () => setTreeMenu(null)
    window.addEventListener('mousedown', closeMenu)
    window.addEventListener('resize', closeMenu)

    return () => {
      window.removeEventListener('mousedown', closeMenu)
      window.removeEventListener('resize', closeMenu)
    }
  }, [treeMenu])

  const expandedPathSet = React.useMemo(() => new Set(expandedPaths), [expandedPaths])

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

  const handleToggleExpand = React.useCallback((path: string) => {
    setExpandedPaths((currentPaths) => toggleExpandedSpaceCleanupPath({
      tree: viewModel.tree,
      expandedPaths: currentPaths,
      targetPath: path
    }))
  }, [viewModel.tree])

  const handleOpenTreeContextMenu = React.useCallback((
    event: React.MouseEvent<HTMLButtonElement>,
    node: SpaceCleanupNode
  ) => {
    event.preventDefault()
    selectPath(node.path)
    setTreeMenu({
      x: event.clientX,
      y: event.clientY,
      path: node.path,
      name: node.name
    })
  }, [selectPath])

  const handleOpenTreePath = async () => {
    if (!treeMenu) {
      return
    }

    const result = await window.electron.spaceCleanup.openPath(treeMenu.path)
    if (!result.success) {
      showNotification({ type: 'error', message: result.error || '无法打开位置' })
    }
    setTreeMenu(null)
  }

  const handleAiCleanupSuggestion = async () => {
    if (!session.rootPath) {
      showNotification({ type: 'error', message: '请先完成一次空间扫描' })
      return
    }

    setAiLoading(true)
    try {
      const result = await window.electron.llm.suggestSpaceCleanup({
        rootPath: session.rootPath,
        summary: session.summary,
        largestFiles: session.largestFiles.slice(0, 10).map((item) => ({
          path: item.path,
          name: item.name,
          sizeBytes: item.sizeBytes,
          extension: item.extension || undefined
        }))
      })

      if (!result.success || !result.data) {
        showNotification({ type: 'error', message: result.error || 'AI 清理建议生成失败' })
        return
      }

      setAiInsight(result.data)
    } finally {
      setAiLoading(false)
    }
  }

  const distributionSubtitle = viewModel.distributionRoot
    ? `${viewModel.distributionSegments.length} 个主要分段`
    : '等待扫描结果'

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <HardDrive className="h-6 w-6 text-primary" />
          空间分析
        </h2>
        <p className="text-muted-foreground">扫描单个目录或磁盘的空间占用，并用目录树和分布图快速定位占用来源。</p>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <Input value={rootPath} readOnly placeholder="请选择扫描目录或磁盘根目录" className="h-11" />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void handleChooseRoot()}>
                <FolderSearch className="mr-2 h-4 w-4" />
                选择目录
              </Button>
              <Button onClick={() => void handleStartScan()} disabled={!actionState.canStartScan || pendingAction === 'scan'}>
                <RefreshCw className={`mr-2 h-4 w-4 ${pendingAction === 'scan' ? 'animate-spin' : ''}`} />
                {session.status === 'completed' ? '重新扫描' : '开始扫描'}
              </Button>
              <Button variant="outline" onClick={() => void cancelScan()} disabled={!actionState.canCancel}>
                <StopCircle className="mr-2 h-4 w-4" />
                取消扫描
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleAiCleanupSuggestion()}
                disabled={session.status === 'idle' || aiLoading}
              >
                <Sparkles className={`mr-2 h-4 w-4 ${aiLoading ? 'animate-pulse' : ''}`} />
                {aiLoading ? 'AI 分析中...' : 'AI 清理建议'}
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

          {viewModel.isScanning && viewModel.activityLabel ? (
            <div className="overflow-hidden rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
              <div className="flex items-center gap-3">
                <RefreshCw className="h-4 w-4 animate-spin text-sky-500" />
                <div>
                  <div className="font-semibold">{viewModel.activityLabel}</div>
                  <div className="mt-1 text-xs text-sky-700/80 dark:text-sky-200/80">
                    扫描器正在后台工作，结果会自动刷新到目录树和大文件列表。
                  </div>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sky-200/70 dark:bg-sky-900">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-sky-400 via-indigo-500 to-cyan-400" />
              </div>
            </div>
          ) : null}

          {viewModel.modeReason && !viewModel.isScanning ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              {viewModel.modeReason}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
            {viewModel.summaryCards.map((card) => (
              <div key={card.id} className="rounded-2xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">{card.label}</div>
                <div className="mt-1 text-2xl font-black">{card.value}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {aiInsight ? (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI 清理建议
            </CardTitle>
            <CardDescription>{aiInsight.summary}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiInsight.bullets.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {aiInsight.bullets.map((line) => (
                  <div key={line} className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
                    {line}
                  </div>
                ))}
              </div>
            ) : null}
            {aiInsight.actions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold">推荐动作</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {aiInsight.actions.map((line) => (
                    <li key={line}>• {line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {aiInsight.warnings.length > 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                {aiInsight.warnings.map((line) => (
                  <div key={line}>• {line}</div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(260px,300px)_minmax(0,1fr)]">
        <Card className="min-w-0 border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle>目录树</CardTitle>
            <CardDescription>各层级默认收起。点箭头展开，右键条目可直接打开位置。</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[780px] space-y-1 overflow-auto">
            {viewModel.tree ? (
              <TreeNode
                node={viewModel.tree}
                selectedPath={selectedPath}
                expandedPathSet={expandedPathSet}
                onSelect={selectPath}
                onToggleExpand={handleToggleExpand}
                onOpenContextMenu={handleOpenTreeContextMenu}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-muted-foreground dark:border-zinc-700">
                {viewModel.emptyTreeLabel}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-5">
          <Card className="min-w-0 border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5 text-primary" />
                空间分布统计
              </CardTitle>
              <CardDescription>
                {viewModel.distributionRoot
                  ? `当前聚焦：${viewModel.distributionRoot.name}`
                  : '扫描完成后显示目录占用的图形分布'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {viewModel.breadcrumbs.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => selectPath(item.path)}
                    className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold transition-colors hover:bg-indigo-500 hover:text-white dark:bg-zinc-800"
                  >
                    {item.name}
                  </button>
                ))}
              </div>

              {viewModel.distributionNote ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                  {viewModel.distributionNote}
                </div>
              ) : null}

              {viewModel.distributionLoading ? (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
                  正在补扫当前目录下一层结构，完成后会自动刷新扇形图。
                </div>
              ) : null}

              <div className="grid gap-4 2xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
                <DistributionDonut
                  segments={viewModel.distributionSegments}
                  totalLabel={viewModel.distributionRoot ? formatSpaceCleanupBytes(viewModel.distributionRoot.sizeBytes) : '0 B'}
                  subtitle={distributionSubtitle}
                  selectedPath={selectedPath}
                  onSelect={selectPath}
                />

                <div className="min-w-0 space-y-2">
                  {viewModel.distributionSegments.length > 0 ? (
                    viewModel.distributionSegments.map((segment) => {
                      const isSelected = selectedPath === segment.path
                      return (
                        <button
                          key={segment.path}
                          onClick={segment.canDrill && segment.path !== '__other__' ? () => selectPath(segment.path) : undefined}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-500/5'
                              : 'border-zinc-200 hover:border-indigo-500/40 hover:bg-indigo-500/5 dark:border-zinc-800'
                          } ${segment.canDrill && segment.path !== '__other__' ? '' : 'cursor-default'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
                                <span className="truncate font-semibold">{segment.name}</span>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">{segment.childLabel}</div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-sm font-bold">{formatSpaceCleanupBytes(segment.sizeBytes)}</div>
                              <div className="text-xs text-muted-foreground">{(segment.percent * 100).toFixed(1)}%</div>
                            </div>
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                            <div
                              className="h-2 rounded-full"
                              style={{
                                width: `${Math.max(segment.percent * 100, 4)}%`,
                                backgroundColor: segment.color
                              }}
                            />
                          </div>
                        </button>
                      )
                    })
                  ) : (
                    <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-muted-foreground dark:border-zinc-700">
                      {viewModel.isScanning ? '扫描进行中，目录分布会在结果返回后自动生成。' : '当前没有可用的目录分布数据。'}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="min-w-0 border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                大文件体积分布
              </CardTitle>
              <CardDescription>按最大文件做条形占比，方便快速锁定真正占空间的目标。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {viewModel.largestFileBars.length > 0 ? (
                (viewModel.largestFileBars as LargestFileBar[]).map((item) => (
                  <button
                    key={item.path}
                    onClick={() => selectPath(item.path)}
                    className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-left transition-colors hover:border-indigo-500/40 hover:bg-indigo-500/5 dark:border-zinc-800"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{item.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{item.extension || '文件'}</div>
                      </div>
                      <div className="shrink-0 text-sm font-bold">{formatSpaceCleanupBytes(item.sizeBytes)}</div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500"
                        style={{ width: `${Math.max(item.percentOfLargest * 100, 6)}%` }}
                      />
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-muted-foreground dark:border-zinc-700">
                  {viewModel.isScanning ? '正在筛选大文件，扫描结果返回后会优先展示最大文件。' : '扫描完成后会在这里显示最大的文件占比。'}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {treeMenu ? (
        <div
          className="fixed z-50 min-w-[180px] rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
          style={{ left: treeMenu.x, top: treeMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="px-2 pb-2 pt-1 text-xs text-muted-foreground">{treeMenu.name}</div>
          <button
            onClick={() => void handleOpenTreePath()}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <FolderOpen className="h-4 w-4" />
            打开位置
          </button>
        </div>
      ) : null}
    </div>
  )
}
