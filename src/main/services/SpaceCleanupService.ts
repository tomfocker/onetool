import fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { BrowserWindow, clipboard, dialog, shell } from 'electron'
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
  ntfsFastScannerBridge?: Pick<NtfsFastScannerBridge, 'start'>
  now?: () => number
  createId?: () => string
  yieldEvery?: number
}

type TraversalState = {
  largestFiles: SpaceCleanupLargestFile[]
  cancelled: boolean
  processedEntries: number
}

type MutableSummary = ReturnType<typeof createEmptySpaceCleanupSummary>

function resolveNtfsFastScannerPath(pathModule: typeof path) {
  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : process.cwd()
  return pathModule.join(resourcesPath, 'space-scan', 'ntfs-fast-scan.exe')
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return String(error)
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
  private readonly ntfsFastScannerBridge: Pick<NtfsFastScannerBridge, 'start'>
  private readonly now: () => number
  private readonly createId: () => string
  private readonly yieldEvery: number

  constructor(dependencies: SpaceCleanupServiceDependencies = {}) {
    this.fsPromises = dependencies.fsPromises ?? fs
    this.pathModule = dependencies.pathModule ?? path
    this.dialogModule = dependencies.dialogModule ?? dialog
    this.shellModule = dependencies.shellModule ?? shell
    this.clipboardModule = dependencies.clipboardModule ?? clipboard
    this.getFastScanEligibility = dependencies.getFastScanEligibility ?? getFastScanEligibility
    this.ntfsFastScannerBridge = dependencies.ntfsFastScannerBridge ?? new NtfsFastScannerBridge({
      scannerPath: resolveNtfsFastScannerPath(this.pathModule)
    })
    this.now = dependencies.now ?? Date.now
    this.createId = dependencies.createId ?? randomUUID
    this.yieldEvery = dependencies.yieldEvery ?? 50
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
      return this.startNtfsFastScan(rootPath)
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
      cancelled: false,
      processedEntries: 0
    }

    const summary = createEmptySpaceCleanupSummary()

    try {
      const tree = await this.scanNode(rootPath, summary, traversalState)

      const finishedStatus = this.cancelled || this.currentSession.status === 'cancelled' ? 'cancelled' : 'completed'
      this.currentSession = {
        ...this.currentSession,
        status: finishedStatus,
        finishedAt: new Date(this.now()).toISOString(),
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

  private async startNtfsFastScan(rootPath: string): Promise<IpcResponse<SpaceCleanupSession>> {
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
      return this.startFilesystemScan(rootPath, `NTFS 极速扫描不可用，已回退到普通扫描：${getErrorMessage(error)}`)
    }
    this.activeNtfsFastScanRun = run

    try {
      await run.done
      this.currentSession = {
        ...this.currentSession,
        status: this.currentSession.status === 'cancelled' ? 'cancelled' : 'completed',
        finishedAt: this.currentSession.finishedAt ?? new Date(this.now()).toISOString(),
        isPartial: this.currentSession.status === 'cancelled' ? this.currentSession.isPartial : false
      }
      this.emit('space-cleanup-complete', this.currentSession)
      return { success: true, data: this.currentSession }
    } catch (error) {
      const message = (error as Error).message
      if (this.cancelled || this.currentSession.status === 'cancelled' || /cancelled/i.test(message)) {
        this.currentSession = {
          ...this.currentSession,
          status: 'cancelled',
          finishedAt: this.currentSession.finishedAt ?? new Date(this.now()).toISOString()
        }
        this.emit('space-cleanup-complete', this.currentSession)
        return { success: true, data: this.currentSession }
      }

      logger.error('SpaceCleanup: ntfs-fast scan failed', error)
      this.currentSession = {
        ...this.currentSession,
        status: 'failed',
        finishedAt: new Date(this.now()).toISOString(),
        error: message
      }
      this.emit('space-cleanup-error', this.currentSession)
      return { success: false, error: message, data: this.currentSession }
    } finally {
      if (this.activeNtfsFastScanRun === run) {
        this.activeNtfsFastScanRun = null
      }
    }
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

    if (event.summary && typeof event.summary === 'object') {
      const largestFiles = Array.isArray(event.largestFiles)
        ? event.largestFiles as SpaceCleanupLargestFile[]
        : nextSession.largestFiles

      nextSession.summary = {
        ...createEmptySpaceCleanupSummary(),
        ...(event.summary as MutableSummary),
        largestFile:
          (event.summary as MutableSummary).largestFile ??
          largestFiles[0] ??
          null
      }
      nextSession.largestFiles = largestFiles
    }

    if (event.tree && typeof event.tree === 'object') {
      nextSession.tree = event.tree as SpaceCleanupNode
    }

    if (event.type === 'complete') {
      nextSession.status = this.cancelled || nextSession.status === 'cancelled' ? 'cancelled' : 'completed'
      nextSession.finishedAt = new Date(this.now()).toISOString()
      nextSession.isPartial = false
      nextSession.error = null
    }

    this.currentSession = nextSession
    this.emit('space-cleanup-progress', this.currentSession)
  }

  private async scanNode(
    targetPath: string,
    summary: MutableSummary,
    traversalState: TraversalState
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
      traversalState.largestFiles = trimLargestFiles(traversalState.largestFiles, largestFile, 500)
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

        const childNode = await this.scanNode(childPath, summary, traversalState)
        children.push(childNode)
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
      childrenCount: children.length,
      fileCount,
      directoryCount,
      skippedChildren,
      children: children.sort((left, right) => right.sizeBytes - left.sizeBytes)
    }
  }

  private async maybeYield(summary: MutableSummary, traversalState: TraversalState) {
    if (traversalState.processedEntries % this.yieldEvery !== 0) {
      return
    }

    this.currentSession = {
      ...this.currentSession,
      summary: {
        ...summary,
        largestFile: this.currentSession.largestFiles[0] ?? null
      }
    }
    this.emit('space-cleanup-progress', this.currentSession)
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}

export const spaceCleanupService = new SpaceCleanupService()
