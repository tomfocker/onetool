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
  type SpaceCleanupSession,
  trimLargestFiles
} from '../../shared/spaceCleanup'
import { logger } from '../utils/logger'

type SpaceCleanupServiceDependencies = {
  fsPromises?: typeof fs
  pathModule?: typeof path
  dialogModule?: typeof dialog
  shellModule?: typeof shell
  clipboardModule?: typeof clipboard
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

export class SpaceCleanupService {
  private mainWindow: BrowserWindow | null = null
  private currentSession: SpaceCleanupSession = createIdleSpaceCleanupSession()
  private cancelled = false
  private readonly fsPromises: typeof fs
  private readonly pathModule: typeof path
  private readonly dialogModule: typeof dialog
  private readonly shellModule: typeof shell
  private readonly clipboardModule: typeof clipboard
  private readonly now: () => number
  private readonly createId: () => string
  private readonly yieldEvery: number

  constructor(dependencies: SpaceCleanupServiceDependencies = {}) {
    this.fsPromises = dependencies.fsPromises ?? fs
    this.pathModule = dependencies.pathModule ?? path
    this.dialogModule = dependencies.dialogModule ?? dialog
    this.shellModule = dependencies.shellModule ?? shell
    this.clipboardModule = dependencies.clipboardModule ?? clipboard
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
    }

    return { success: true, data: this.currentSession }
  }

  async startScan(rootPath: string): Promise<IpcResponse<SpaceCleanupSession>> {
    const session: SpaceCleanupSession = {
      sessionId: this.createId(),
      rootPath,
      status: 'scanning',
      startedAt: new Date(this.now()).toISOString(),
      finishedAt: null,
      summary: createEmptySpaceCleanupSummary(),
      largestFiles: [],
      tree: null,
      error: null
    }

    this.currentSession = session
    this.cancelled = false
    this.emit('space-cleanup-progress', session)

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

  private emit(channel: string, payload: SpaceCleanupSession) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return
    }

    this.mainWindow.webContents.send(channel, payload)
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
