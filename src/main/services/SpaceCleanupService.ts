import fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, BrowserWindow, clipboard, dialog, shell } from 'electron'
import type { IpcResponse } from '../../shared/types'
import {
  createEmptySpaceCleanupSummary,
  createIdleSpaceCleanupSession,
  type SpaceCleanupLargestFile,
  type SpaceCleanupNode,
  type SpaceCleanupScanMode,
  type SpaceCleanupSession,
  trimLargestFiles
} from '../../shared/spaceCleanup'
import { logger } from '../utils/logger'
import { getFastScanEligibility } from '../utils/windowsVolume'
import { isProcessElevated } from '../utils/windowsAdmin'
import { ElevatedNtfsScanRunner } from './ElevatedNtfsScanRunner'
import {
  NtfsFastScannerBridge,
  type NtfsFastScannerBridgeEvent,
  type NtfsFastScannerRunHandle
} from './NtfsFastScannerBridge'

type SpaceCleanupServiceDependencies = {
  fsPromises?: typeof fs
  pathModule?: typeof path
  dialogModule?: typeof dialog
  shellModule?: typeof shell
  clipboardModule?: typeof clipboard
  getFastScanEligibility?: typeof getFastScanEligibility
  isProcessElevated?: typeof isProcessElevated
  ntfsFastScannerBridge?: Pick<NtfsFastScannerBridge, 'start'>
  elevatedNtfsScanRunner?: Pick<ElevatedNtfsScanRunner, 'start'>
  now?: () => number
  createId?: () => string
  yieldEvery?: number
  filesystemMaxDirectoryDepth?: number
}

type TraversalState = {
  largestFiles: SpaceCleanupLargestFile[]
  largestFilesChanged: boolean
  depthLimitReached: boolean
  cancelled: boolean
  processedEntries: number
  emitProgress: boolean
}

type MutableSummary = ReturnType<typeof createEmptySpaceCleanupSummary>
const DEFAULT_FILESYSTEM_MAX_DIRECTORY_DEPTH = 2

function resolveNtfsFastScannerPath(pathModule: typeof path) {
  const isPackaged = typeof app?.isPackaged === 'boolean' ? app.isPackaged : false

  if (!isPackaged) {
    return pathModule.join(process.cwd(), 'resources', 'space-scan', 'ntfs-fast-scan.exe')
  }

  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : process.cwd()
  return pathModule.join(resourcesPath, 'space-scan', 'ntfs-fast-scan.exe')
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) {
      return message
    }
  }

  return String(error)
}

function normalizeNtfsFastScanFailureMessage(message: string): string {
  if (/管理员权限请求已取消/i.test(message)) {
    return '你取消了管理员权限请求，NTFS 极速扫描未启动'
  }

  if (
    /failed to open NTFS volume/i.test(message) &&
    (/(access is denied|拒绝访问)/i.test(message) || /\bos error 5\b/i.test(message))
  ) {
    return '当前进程没有管理员权限，NTFS 极速扫描需要提升权限后才能直接访问磁盘卷'
  }

  return message
}

function treeHasSkippedEntries(node: SpaceCleanupNode | null | undefined): boolean {
  if (!node) {
    return false
  }

  if (node.skippedChildren > 0) {
    return true
  }

  if (!Array.isArray(node.children) || node.children.length === 0) {
    return false
  }

  return node.children.some((child) => treeHasSkippedEntries(child))
}

function shouldKeepNtfsSessionPartial(session: Pick<SpaceCleanupSession, 'summary' | 'tree'>): boolean {
  return session.summary.skippedEntries > 0 || treeHasSkippedEntries(session.tree)
}

function updateSessionLargestFiles(
  session: SpaceCleanupSession,
  largestFiles: SpaceCleanupLargestFile[]
): SpaceCleanupSession {
  return {
    ...session,
    largestFiles,
    summary: {
      ...session.summary,
      largestFile: largestFiles[0] ?? null
    }
  }
}

function createLargestFilesSignature(largestFiles: SpaceCleanupLargestFile[]): string {
  return largestFiles
    .slice(0, 10)
    .map((item) => `${item.path}\u0000${item.sizeBytes}`)
    .join('\n')
}

export class SpaceCleanupService {
  private mainWindow: BrowserWindow | null = null
  private currentSession: SpaceCleanupSession = createIdleSpaceCleanupSession()
  private cancelled = false
  private activeNtfsFastScanRun: NtfsFastScannerRunHandle | null = null
  private readonly fsPromises: typeof fs
  private readonly pathModule: typeof path
  private readonly dialogModule: typeof dialog
  private readonly shellModule: typeof shell
  private readonly clipboardModule: typeof clipboard
  private readonly getFastScanEligibility: typeof getFastScanEligibility
  private readonly isProcessElevated: typeof isProcessElevated
  private readonly ntfsFastScannerBridge: Pick<NtfsFastScannerBridge, 'start'>
  private readonly elevatedNtfsScanRunner: Pick<ElevatedNtfsScanRunner, 'start'>
  private readonly now: () => number
  private readonly createId: () => string
  private readonly yieldEvery: number
  private readonly filesystemMaxDirectoryDepth: number

  constructor(dependencies: SpaceCleanupServiceDependencies = {}) {
    this.fsPromises = dependencies.fsPromises ?? fs
    this.pathModule = dependencies.pathModule ?? path
    this.dialogModule = dependencies.dialogModule ?? dialog
    this.shellModule = dependencies.shellModule ?? shell
    this.clipboardModule = dependencies.clipboardModule ?? clipboard
    this.getFastScanEligibility = dependencies.getFastScanEligibility ?? getFastScanEligibility
    this.isProcessElevated = dependencies.isProcessElevated ?? isProcessElevated
    this.ntfsFastScannerBridge = dependencies.ntfsFastScannerBridge ?? new NtfsFastScannerBridge({
      scannerPath: resolveNtfsFastScannerPath(this.pathModule)
    })
    this.elevatedNtfsScanRunner = dependencies.elevatedNtfsScanRunner ?? new ElevatedNtfsScanRunner()
    this.now = dependencies.now ?? Date.now
    this.createId = dependencies.createId ?? randomUUID
    this.yieldEvery = dependencies.yieldEvery ?? 50
    this.filesystemMaxDirectoryDepth =
      dependencies.filesystemMaxDirectoryDepth ?? DEFAULT_FILESYSTEM_MAX_DIRECTORY_DEPTH
  }

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  getSession(): IpcResponse<SpaceCleanupSession> {
    return { success: true, data: this.currentSession }
  }

  async chooseRoot(): Promise<IpcResponse<{ canceled: boolean; path: string | null }>> {
    const result = await this.dialogModule.showOpenDialog({
      properties: ['openDirectory']
    })

    return {
      success: true,
      data: {
        canceled: result.canceled,
        path: result.filePaths[0] ?? null
      }
    }
  }

  cancelScan(): IpcResponse<SpaceCleanupSession> {
    if (this.currentSession.status === 'scanning') {
      this.cancelled = true
      this.currentSession = {
        ...this.currentSession,
        status: 'cancelled',
        finishedAt: new Date(this.now()).toISOString()
      }
      this.activeNtfsFastScanRun?.cancel()
      this.activeNtfsFastScanRun = null
    }

    return { success: true, data: this.currentSession }
  }

  async startScan(rootPath: string): Promise<IpcResponse<SpaceCleanupSession>> {
    this.currentSession = this.createScanningSession(rootPath, 'filesystem', null, false)
    this.cancelled = false
    this.activeNtfsFastScanRun = null
    this.emit('space-cleanup-progress', this.currentSession)

    let eligibility
    try {
      eligibility = await this.getFastScanEligibility(rootPath)
    } catch (error) {
      logger.warn('SpaceCleanup: fast eligibility lookup failed, falling back to filesystem scan', error)
      if (this.cancelled || this.currentSession.status === 'cancelled') {
        this.currentSession = {
          ...this.currentSession,
          status: 'cancelled',
          finishedAt: this.currentSession.finishedAt ?? new Date(this.now()).toISOString()
        }
        this.emit('space-cleanup-complete', this.currentSession)
        return { success: true, data: this.currentSession }
      }

      return this.startFilesystemScan(rootPath, `NTFS 极速扫描不可用，已回退到普通扫描：${getErrorMessage(error)}`)
    }

    if (this.cancelled || this.currentSession.status === 'cancelled') {
      this.currentSession = {
        ...this.currentSession,
        status: 'cancelled',
        finishedAt: this.currentSession.finishedAt ?? new Date(this.now()).toISOString()
      }
      this.emit('space-cleanup-complete', this.currentSession)
      return { success: true, data: this.currentSession }
    }

    if (eligibility.mode === 'ntfs-fast') {
      const elevated = await this.isProcessElevated()
      if (elevated) {
        return this.startNtfsFastScan(rootPath)
      }

      return this.startElevatedNtfsFastScan(rootPath)
    }

    return this.startFilesystemScan(rootPath, eligibility.reason)
  }

  async openPath(targetPath: string): Promise<IpcResponse> {
    const targetStat = await this.fsPromises.stat(targetPath)
    if (targetStat.isDirectory()) {
      const result = await this.shellModule.openPath(targetPath)
      return result === '' ? { success: true } : { success: false, error: result }
    }

    this.shellModule.showItemInFolder(targetPath)
    return { success: true }
  }

  async copyPath(targetPath: string): Promise<IpcResponse> {
    this.clipboardModule.writeText(targetPath)
    return { success: true }
  }

  async deleteToTrash(targetPath: string): Promise<IpcResponse> {
    await this.shellModule.trashItem(targetPath)
    return { success: true }
  }

  async scanDirectoryBreakdown(targetPath: string): Promise<IpcResponse<SpaceCleanupNode>> {
    try {
      const summary = createEmptySpaceCleanupSummary()
      const traversalState: TraversalState = {
        largestFiles: [],
        largestFilesChanged: false,
        depthLimitReached: false,
        cancelled: false,
        processedEntries: 0,
        emitProgress: false
      }
      const node = await this.scanNode(targetPath, summary, traversalState, 1)
      return { success: true, data: node }
    } catch (error) {
      logger.error('SpaceCleanup: directory breakdown scan failed', error)
      return { success: false, error: getErrorMessage(error) }
    }
  }

  private createScanningSession(
    rootPath: string,
    scanMode: SpaceCleanupScanMode,
    scanModeReason: string | null,
    isPartial: boolean
  ): SpaceCleanupSession {
    return {
      ...createIdleSpaceCleanupSession(),
      sessionId: this.createId(),
      rootPath,
      status: 'scanning',
      scanMode,
      scanModeReason,
      isPartial,
      startedAt: new Date(this.now()).toISOString()
    }
  }

  private async startFilesystemScan(
    rootPath: string,
    scanModeReason: string | null
  ): Promise<IpcResponse<SpaceCleanupSession>> {
    this.currentSession = {
      ...this.currentSession,
      rootPath,
      scanMode: 'filesystem',
      scanModeReason,
      isPartial: false,
      error: null
    }
    this.activeNtfsFastScanRun = null
    this.emit('space-cleanup-progress', this.currentSession)

    const traversalState: TraversalState = {
      largestFiles: [],
      largestFilesChanged: false,
      depthLimitReached: false,
      cancelled: false,
      processedEntries: 0,
      emitProgress: true
    }

    const summary = createEmptySpaceCleanupSummary()

    try {
      const tree = await this.scanNode(
        rootPath,
        summary,
        traversalState,
        Number.POSITIVE_INFINITY,
        0,
        this.filesystemMaxDirectoryDepth
      )

      const finishedStatus = this.cancelled || this.currentSession.status === 'cancelled' ? 'cancelled' : 'completed'
      this.currentSession = {
        ...this.currentSession,
        status: finishedStatus,
        finishedAt: new Date(this.now()).toISOString(),
        isPartial: traversalState.depthLimitReached || summary.skippedEntries > 0,
        summary: {
          ...summary,
          largestFile: traversalState.largestFiles[0] ?? null
        },
        largestFiles: traversalState.largestFiles,
        tree
      }

      this.emit('space-cleanup-complete', this.currentSession)
      return { success: true, data: this.currentSession }
    } catch (error) {
      logger.error('SpaceCleanup: scan failed', error)
      this.currentSession = {
        ...this.currentSession,
        status: 'failed',
        finishedAt: new Date(this.now()).toISOString(),
        error: (error as Error).message
      }
      this.emit('space-cleanup-error', this.currentSession)
      return { success: false, error: (error as Error).message, data: this.currentSession }
    }
  }

  private startNtfsFastScan(rootPath: string): IpcResponse<SpaceCleanupSession> {
    this.currentSession = {
      ...this.currentSession,
      rootPath,
      scanMode: 'ntfs-fast',
      scanModeReason: null,
      isPartial: true,
      error: null
    }
    this.emit('space-cleanup-progress', this.currentSession)

    let run: NtfsFastScannerRunHandle
    try {
      run = this.ntfsFastScannerBridge.start(rootPath, (event) => {
        this.handleNtfsFastScanEvent(event)
      })
    } catch (error) {
      logger.warn('SpaceCleanup: ntfs-fast startup failed, falling back to filesystem scan', error)
      const message = normalizeNtfsFastScanFailureMessage(getErrorMessage(error))
      void this.startFilesystemScan(rootPath, `NTFS 极速扫描不可用，已回退到普通扫描：${message}`)
      return { success: true, data: this.currentSession }
    }
    this.activeNtfsFastScanRun = run
    void this.attachNtfsFastScanRun(rootPath, run)
    return { success: true, data: this.currentSession }

    void run.done.then(() => {
      if (this.currentSession.status !== 'scanning') {
        return
      }

      this.currentSession = {
        ...this.currentSession,
        status: 'completed',
        finishedAt: this.currentSession.finishedAt ?? new Date(this.now()).toISOString(),
        isPartial: shouldKeepNtfsSessionPartial(this.currentSession),
        error: null
      }
      this.emit('space-cleanup-complete', this.currentSession)
    }).catch((error) => {
      const message = normalizeNtfsFastScanFailureMessage(getErrorMessage(error))
      if (this.cancelled || this.currentSession.status === 'cancelled' || /cancelled/i.test(message)) {
        this.currentSession = {
          ...this.currentSession,
          status: 'cancelled',
          finishedAt: this.currentSession.finishedAt ?? new Date(this.now()).toISOString()
        }
        this.emit('space-cleanup-complete', this.currentSession)
        return
      }

      logger.warn('SpaceCleanup: ntfs-fast scan failed after start, falling back to filesystem scan', error)
      void this.startFilesystemScan(rootPath, `NTFS 极速扫描失败，已回退到普通扫描：${message}`)
    }).finally(() => {
      if (this.activeNtfsFastScanRun === run) {
        this.activeNtfsFastScanRun = null
      }
    })

    return { success: true, data: this.currentSession }
  }

  private async startElevatedNtfsFastScan(rootPath: string): Promise<IpcResponse<SpaceCleanupSession>> {
    this.currentSession = {
      ...this.currentSession,
      rootPath,
      scanMode: 'ntfs-fast',
      scanModeReason: '正在请求管理员权限以执行 NTFS 极速扫描',
      isPartial: true,
      error: null
    }
    this.emit('space-cleanup-progress', this.currentSession)

    let run: NtfsFastScannerRunHandle
    try {
      run = await this.elevatedNtfsScanRunner.start(rootPath, (event) => {
        this.handleNtfsFastScanEvent(event)
      })
    } catch (error) {
      logger.warn('SpaceCleanup: elevated ntfs-fast startup failed, falling back to filesystem scan', error)
      const message = normalizeNtfsFastScanFailureMessage(getErrorMessage(error))
      return this.startFilesystemScan(rootPath, `NTFS 极速扫描失败，已回退到普通扫描：${message}`)
    }

    this.activeNtfsFastScanRun = run
    void this.attachNtfsFastScanRun(rootPath, run)
    return { success: true, data: this.currentSession }
  }

  private async attachNtfsFastScanRun(rootPath: string, run: NtfsFastScannerRunHandle): Promise<void> {
    await run.done.then(() => {
      if (this.currentSession.status !== 'scanning') {
        return
      }

      this.currentSession = {
        ...this.currentSession,
        status: 'completed',
        finishedAt: this.currentSession.finishedAt ?? new Date(this.now()).toISOString(),
        isPartial: shouldKeepNtfsSessionPartial(this.currentSession),
        error: null
      }
      this.emit('space-cleanup-complete', this.currentSession)
    }).catch((error) => {
      const message = normalizeNtfsFastScanFailureMessage(getErrorMessage(error))
      if (this.cancelled || this.currentSession.status === 'cancelled' || /cancelled/i.test(message)) {
        this.currentSession = {
          ...this.currentSession,
          status: 'cancelled',
          finishedAt: this.currentSession.finishedAt ?? new Date(this.now()).toISOString()
        }
        this.emit('space-cleanup-complete', this.currentSession)
        return
      }

      logger.warn('SpaceCleanup: ntfs-fast scan failed after start, falling back to filesystem scan', error)
      void this.startFilesystemScan(rootPath, `NTFS 极速扫描失败，已回退到普通扫描：${message}`)
    }).finally(() => {
      if (this.activeNtfsFastScanRun === run) {
        this.activeNtfsFastScanRun = null
      }
    })
  }

  private emit(channel: string, payload: SpaceCleanupSession) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return
    }

    this.mainWindow.webContents.send(channel, payload)
  }

  private handleNtfsFastScanEvent(event: NtfsFastScannerBridgeEvent) {
    const nextSession: SpaceCleanupSession = { ...this.currentSession }

    if (event.type === 'volume-info') {
      if (typeof event.rootPath === 'string') {
        nextSession.rootPath = event.rootPath
      }
      nextSession.scanMode = event.mode === 'ntfs-fast' ? 'ntfs-fast' : nextSession.scanMode
      nextSession.scanModeReason = null
    }

    if (Array.isArray(event.largestFiles)) {
      const largestFiles = event.largestFiles as SpaceCleanupLargestFile[]
      const updatedSession = updateSessionLargestFiles(nextSession, largestFiles)
      nextSession.largestFiles = updatedSession.largestFiles
      nextSession.summary = updatedSession.summary
    }

    if (event.summary && typeof event.summary === 'object') {
      nextSession.summary = {
        ...createEmptySpaceCleanupSummary(),
        ...(event.summary as MutableSummary),
        largestFile:
          (event.summary as MutableSummary).largestFile ??
          nextSession.largestFiles[0] ??
          null
      }
    }

    if (event.tree && typeof event.tree === 'object') {
      nextSession.tree = event.tree as SpaceCleanupNode
    }

    if (event.type === 'complete') {
      nextSession.status = this.cancelled || nextSession.status === 'cancelled' ? 'cancelled' : 'completed'
      nextSession.finishedAt = new Date(this.now()).toISOString()
      nextSession.isPartial = shouldKeepNtfsSessionPartial(nextSession)
      nextSession.error = null
      this.currentSession = nextSession
      this.emit('space-cleanup-complete', this.currentSession)
      return
    }

    this.currentSession = nextSession
    this.emit('space-cleanup-progress', this.currentSession)
  }

  private async scanNode(
    targetPath: string,
    summary: MutableSummary,
    traversalState: TraversalState,
    retainedDepth = Number.POSITIVE_INFINITY,
    directoryDepth = 0,
    maxDirectoryDepth = Number.POSITIVE_INFINITY
  ): Promise<SpaceCleanupNode> {
    if (this.cancelled || this.currentSession.status === 'cancelled') {
      traversalState.cancelled = true
    }

    const targetStat = await this.fsPromises.stat(targetPath)
    const name = this.pathModule.basename(targetPath) || targetPath

    if (!targetStat.isDirectory()) {
      summary.scannedFiles += 1
      summary.totalBytes += targetStat.size
      traversalState.processedEntries += 1
      const largestFile = {
        path: targetPath,
        name,
        sizeBytes: targetStat.size,
        extension: this.pathModule.extname(targetPath) || null
      }
      const previousLargestFilesSignature = createLargestFilesSignature(traversalState.largestFiles)
      traversalState.largestFiles = trimLargestFiles(traversalState.largestFiles, largestFile, 500)
      traversalState.largestFilesChanged =
        traversalState.largestFilesChanged ||
        createLargestFilesSignature(traversalState.largestFiles) !== previousLargestFilesSignature
      await this.maybeYield(summary, traversalState)

      return {
        id: targetPath,
        name,
        path: targetPath,
        type: 'file',
        sizeBytes: targetStat.size,
        extension: largestFile.extension,
        childrenCount: 0,
        fileCount: 0,
        directoryCount: 0,
        skippedChildren: 0
      }
    }

    summary.scannedDirectories += 1
    traversalState.processedEntries += 1
    await this.maybeYield(summary, traversalState)

    if (directoryDepth >= maxDirectoryDepth) {
      traversalState.depthLimitReached = true
      summary.skippedEntries += 1
      return {
        id: targetPath,
        name,
        path: targetPath,
        type: 'directory',
        sizeBytes: 0,
        childrenCount: 0,
        fileCount: 0,
        directoryCount: 0,
        skippedChildren: 1,
        children: []
      }
    }

    let skippedChildren = 0
    let fileCount = 0
    let directoryCount = 0
    let totalSize = 0
    const children: SpaceCleanupNode[] = []

    let dirEntries: Dirent[] = []
    try {
      dirEntries = await this.fsPromises.readdir(targetPath, { withFileTypes: true } as any) as unknown as Dirent[]
    } catch (error: any) {
      if (error && (error.code === 'EACCES' || error.code === 'EPERM')) {
        summary.skippedEntries += 1
        return {
          id: targetPath,
          name,
          path: targetPath,
          type: 'directory',
          sizeBytes: 0,
          childrenCount: 0,
          fileCount: 0,
          directoryCount: 0,
          skippedChildren: 1,
          children: []
        }
      }
      throw error
    }

    for (const entry of dirEntries) {
      if (this.cancelled || this.currentSession.status === 'cancelled') {
        traversalState.cancelled = true
        break
      }

      const childPath = this.pathModule.join(targetPath, entry.name)
      try {
        if (entry.isSymbolicLink?.()) {
          summary.skippedEntries += 1
          skippedChildren += 1
          continue
        }

        const childNode = await this.scanNode(
          childPath,
          summary,
          traversalState,
          retainedDepth - 1,
          directoryDepth + (entry.isDirectory?.() ? 1 : 0),
          maxDirectoryDepth
        )
        if (retainedDepth > 0) {
          children.push(childNode)
        }
        totalSize += childNode.sizeBytes
        fileCount += childNode.type === 'file' ? 1 : childNode.fileCount
        directoryCount += childNode.type === 'directory' ? childNode.directoryCount + 1 : 0
        skippedChildren += childNode.skippedChildren
      } catch (error: any) {
        if (error && (error.code === 'EACCES' || error.code === 'EPERM')) {
          summary.skippedEntries += 1
          skippedChildren += 1
          continue
        }
        throw error
      }
    }

    return {
      id: targetPath,
      name,
      path: targetPath,
      type: 'directory',
      sizeBytes: totalSize,
      childrenCount: dirEntries.length,
      fileCount,
      directoryCount,
      skippedChildren,
      children: children.sort((left, right) => right.sizeBytes - left.sizeBytes)
    }
  }

  private async maybeYield(summary: MutableSummary, traversalState: TraversalState) {
    if (!traversalState.emitProgress) {
      return
    }

    const shouldEmitProgress =
      traversalState.largestFilesChanged ||
      traversalState.processedEntries % this.yieldEvery === 0

    if (!shouldEmitProgress) {
      return
    }

    const largestFiles = traversalState.largestFiles
    this.currentSession = {
      ...this.currentSession,
      largestFiles,
      summary: {
        ...summary,
        largestFile: largestFiles[0] ?? null
      }
    }
    traversalState.largestFilesChanged = false
    this.emit('space-cleanup-progress', this.currentSession)
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}

export const spaceCleanupService = new SpaceCleanupService()
