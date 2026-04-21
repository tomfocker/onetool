import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import type { IpcResponse } from '../../shared/types'
import {
  classifyDownloadOrganizerCategory,
  createConflictResolvedPath,
  createDefaultDownloadOrganizerStoredState,
  mergeMissingDefaultDownloadOrganizerRules,
  matchDownloadOrganizerRule,
  renderDownloadOrganizerTargetPath,
  type DownloadOrganizerCandidate,
  type DownloadOrganizerConfig,
  type DownloadOrganizerPreviewItem,
  type DownloadOrganizerState,
  type DownloadOrganizerStoredState
} from '../../shared/downloadOrganizer'
import { logger } from '../utils/logger'
import { storeService } from './StoreService'

type StoreServiceLike = {
  get: (key: 'downloadOrganizer') => any
  set: (key: 'downloadOrganizer', value: any) => void
}

type DownloadOrganizerServiceDependencies = {
  fsModule?: Pick<typeof fs, 'watch'>
  fsPromises?: Pick<typeof fsPromises, 'readdir' | 'stat' | 'mkdir' | 'rename' | 'copyFile' | 'unlink' | 'access' | 'cp' | 'rm'>
  pathModule?: typeof path
  appModule?: Pick<typeof app, 'getPath'>
  storeService: StoreServiceLike
  now?: () => number
  createId?: () => string
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
}

const APPLY_PREVIEW_CONCURRENCY = 4

type OrganizerDirent = {
  name: string
  isFile: () => boolean
  isDirectory: () => boolean
}

type OrganizerStats = {
  isFile: () => boolean
  isDirectory: () => boolean
  size: number
  mtime: Date
}

function createErrorMessage(error: unknown) {
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

function toDateIso(value: Date | string | number) {
  if (value instanceof Date) {
    return value.toISOString()
  }

  return new Date(value).toISOString()
}

export class DownloadOrganizerService {
  private readonly fsModule: Pick<typeof fs, 'watch'>
  private readonly fsPromises: Pick<typeof fsPromises, 'readdir' | 'stat' | 'mkdir' | 'rename' | 'copyFile' | 'unlink' | 'access' | 'cp' | 'rm'>
  private readonly pathModule: typeof path
  private readonly appModule: Pick<typeof app, 'getPath'>
  private readonly storeService: StoreServiceLike
  private readonly now: () => number
  private readonly createId: () => string
  private readonly setTimeoutFn: typeof setTimeout
  private readonly clearTimeoutFn: typeof clearTimeout

  private watcher: fs.FSWatcher | { close: () => void } | null = null
  private readonly pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly stateListeners = new Set<(state: DownloadOrganizerState) => void>()
  private state: DownloadOrganizerState = {
    ...createDefaultDownloadOrganizerStoredState(),
    watcherActive: false,
    lastError: null
  }

  constructor(dependencies: DownloadOrganizerServiceDependencies) {
    this.fsModule = dependencies.fsModule ?? fs
    this.fsPromises = dependencies.fsPromises ?? fsPromises
    this.pathModule = dependencies.pathModule ?? path
    this.appModule = dependencies.appModule ?? app
    this.storeService = dependencies.storeService
    this.now = dependencies.now ?? Date.now
    this.createId = dependencies.createId ?? (() => `${Date.now()}-${Math.random().toString(16).slice(2)}`)
    this.setTimeoutFn = dependencies.setTimeoutFn ?? setTimeout
    this.clearTimeoutFn = dependencies.clearTimeoutFn ?? clearTimeout
  }

  setMainWindow(_window: BrowserWindow | null) {
  }

  async initialize() {
    const storedState = this.hydrateStoredState(this.storeService.get('downloadOrganizer'))
    const watchPath = storedState.config.watchPath || this.appModule.getPath('downloads')
    const destinationRoot = storedState.config.destinationRoot || this.pathModule.join(watchPath, '整理归档')

    this.state = {
      ...storedState,
      config: {
        ...storedState.config,
        watchPath,
        destinationRoot
      },
      watcherActive: false,
      lastError: null
    }

    this.persistStoredState()
    if (this.state.config.enabled) {
      await this.restartWatcher()
    } else {
      this.emitState()
    }
  }

  getState(): IpcResponse<DownloadOrganizerState> {
    return {
      success: true,
      data: this.state
    }
  }

  onStateChanged(listener: (state: DownloadOrganizerState) => void) {
    this.stateListeners.add(listener)
    return () => {
      this.stateListeners.delete(listener)
    }
  }

  async updateConfig(updates: Partial<DownloadOrganizerConfig>): Promise<IpcResponse<DownloadOrganizerState>> {
    this.state = {
      ...this.state,
      config: {
        ...this.state.config,
        ...updates
      },
      lastError: null
    }

    this.persistStoredState()
    await this.restartWatcher()
    return this.getState()
  }

  async preview(): Promise<IpcResponse<DownloadOrganizerState>> {
    try {
      const items = await this.scanWatchDirectory()
      this.state = {
        ...this.state,
        lastPreviewAt: new Date(this.now()).toISOString(),
        lastPreviewItems: items,
        lastError: null
      }
      this.persistStoredState()
      this.emitState()
      return this.getState()
    } catch (error) {
      const message = createErrorMessage(error)
      logger.error('DownloadOrganizer: preview failed', error)
      this.state = {
        ...this.state,
        lastError: message
      }
      this.emitState()
      return { success: false, error: message, data: this.state }
    }
  }

  async applyPreview(): Promise<IpcResponse<DownloadOrganizerState>> {
    const nextItems = await this.mapWithConcurrency(this.state.lastPreviewItems, APPLY_PREVIEW_CONCURRENCY, async (item) => {
      if (item.status !== 'ready' || !item.targetPath) {
        return item
      }

      try {
        const finalTargetPath = await this.resolveTargetPath(item.targetPath)
        if (!finalTargetPath) {
          this.pushActivity('warning', `跳过 ${item.fileName}，目标文件已存在`, item.sourcePath, item.targetPath)
          return {
            ...item,
            status: 'skipped' as const,
            reason: '目标文件已存在，按策略跳过'
          }
        }

        await this.fsPromises.mkdir(this.pathModule.dirname(finalTargetPath), { recursive: true } as any)
        await this.moveEntry(item.sourcePath, finalTargetPath)
        this.pushActivity('success', `已整理 ${item.fileName}`, item.sourcePath, finalTargetPath)
        return {
          ...item,
          targetPath: finalTargetPath,
          status: 'moved' as const,
          reason: null
        }
      } catch (error) {
        const message = createErrorMessage(error)
        this.pushActivity('error', `整理 ${item.fileName} 失败：${message}`, item.sourcePath, item.targetPath)
        return {
          ...item,
          status: 'failed' as const,
          reason: message
        }
      }
    })

    this.state = {
      ...this.state,
      lastPreviewItems: nextItems,
      lastError: null
    }
    this.persistStoredState()
    this.emitState()
    return this.getState()
  }

  async restartWatcher() {
    this.stopWatcher()
    if (!this.state.config.enabled) {
      this.emitState()
      return
    }

    try {
      const watchPath = this.state.config.watchPath
      this.watcher = this.fsModule.watch(watchPath, { persistent: false }, (_eventType, fileName) => {
        if (!fileName) {
          return
        }

        const targetPath = this.pathModule.join(watchPath, String(fileName))
        this.queueAutoProcess(targetPath)
      })
      this.state = {
        ...this.state,
        watcherActive: true,
        lastError: null
      }
      this.emitState()
    } catch (error) {
      const message = createErrorMessage(error)
      logger.error('DownloadOrganizer: failed to start watcher', error)
      this.state = {
        ...this.state,
        watcherActive: false,
        lastError: message
      }
      this.emitState()
    }
  }

  private stopWatcher() {
    this.watcher?.close()
    this.watcher = null
    for (const timer of this.pendingTimers.values()) {
      this.clearTimeoutFn(timer)
    }
    this.pendingTimers.clear()
    this.state = {
      ...this.state,
      watcherActive: false
    }
  }

  private hydrateStoredState(storedState: unknown): DownloadOrganizerStoredState {
    const defaults = createDefaultDownloadOrganizerStoredState()
    if (!storedState || typeof storedState !== 'object') {
      return defaults
    }

    const candidate = storedState as Partial<DownloadOrganizerStoredState>
    return {
      ...defaults,
      ...candidate,
      config: {
        ...defaults.config,
        ...(candidate.config ?? {}),
        rules: mergeMissingDefaultDownloadOrganizerRules(
          Array.isArray(candidate.config?.rules) ? candidate.config.rules : defaults.config.rules
        ),
        ignoredExtensions: Array.isArray(candidate.config?.ignoredExtensions)
          ? candidate.config.ignoredExtensions
          : defaults.config.ignoredExtensions
      },
      lastPreviewItems: Array.isArray(candidate.lastPreviewItems)
        ? candidate.lastPreviewItems.map((item) => this.hydratePreviewItem(item))
        : [],
      activity: Array.isArray(candidate.activity) ? candidate.activity : []
    }
  }

  private persistStoredState() {
    this.storeService.set('downloadOrganizer', {
      config: this.state.config,
      lastPreviewAt: this.state.lastPreviewAt,
      lastPreviewItems: this.state.lastPreviewItems,
      activity: this.state.activity
    })
  }

  private emitState() {
    for (const listener of this.stateListeners) {
      listener(this.state)
    }
  }

  private async scanWatchDirectory() {
    const entries = await this.fsPromises.readdir(this.state.config.watchPath, { withFileTypes: true } as any) as unknown as OrganizerDirent[]
    const relevantEntries = entries.filter((entry) => {
      if (!entry.isFile() && !entry.isDirectory()) {
        return false
      }

      const sourcePath = this.pathModule.join(this.state.config.watchPath, entry.name)
      if (this.isDestinationRootPath(sourcePath)) {
        return false
      }

      if (entry.isFile() && this.isIgnoredFileName(entry.name)) {
        return false
      }

      return true
    })

    const previewItems = await Promise.all(relevantEntries.map(async (entry) => {
      const sourcePath = this.pathModule.join(this.state.config.watchPath, entry.name)
      const stats = await this.fsPromises.stat(sourcePath)
      if (!this.isSupportedEntryStats(stats)) {
        return null
      }

      return this.createPreviewItem(this.createCandidateFromStats(sourcePath, entry.name, stats))
    }))

    return previewItems.filter((item): item is DownloadOrganizerPreviewItem => item !== null)
  }

  private createPreviewItem(candidate: DownloadOrganizerCandidate): DownloadOrganizerPreviewItem {
    const matchedRule = this.state.config.rules.find((rule) => matchDownloadOrganizerRule(candidate, rule, this.now()))
    if (!matchedRule) {
      return {
        ...candidate,
        id: this.createId(),
        matchedRuleId: null,
        matchedRuleName: null,
        targetRelativePath: null,
        targetPath: null,
        status: 'skipped',
        reason: '没有匹配的规则'
      }
    }

    const targetRelativeDir = renderDownloadOrganizerTargetPath(matchedRule.action.targetPathTemplate, candidate)
    const targetPath = this.pathModule.join(this.state.config.destinationRoot, ...targetRelativeDir.split('/'), candidate.fileName)

    return {
      ...candidate,
      id: this.createId(),
      matchedRuleId: matchedRule.id,
      matchedRuleName: matchedRule.name,
      targetRelativePath: targetRelativeDir ? `${targetRelativeDir}/${candidate.fileName}` : candidate.fileName,
      targetPath,
      status: 'ready',
      reason: null
    }
  }

  private isIgnoredFileName(fileName: string) {
    const extension = this.pathModule.extname(fileName).toLowerCase()
    return this.state.config.ignoredExtensions.map((item) => item.toLowerCase()).includes(extension)
  }

  private async resolveTargetPath(targetPath: string): Promise<string | null> {
    const policy = this.state.config.conflictPolicy
    if (policy === 'overwrite') {
      return targetPath
    }

    const exists = await this.pathExists(targetPath)
    if (!exists) {
      return targetPath
    }

    if (policy === 'skip') {
      return null
    }

    let attempt = 1
    while (attempt < 1000) {
      const candidatePath = createConflictResolvedPath(targetPath, attempt)
      if (!(await this.pathExists(candidatePath))) {
        return candidatePath
      }
      attempt += 1
    }

    return null
  }

  private async pathExists(targetPath: string) {
    try {
      await this.fsPromises.access(targetPath)
      return true
    } catch {
      return false
    }
  }

  private async moveEntry(sourcePath: string, targetPath: string) {
    try {
      await this.fsPromises.rename(sourcePath, targetPath)
    } catch (error: any) {
      if (error?.code !== 'EXDEV') {
        throw error
      }

      const sourceStats = await this.fsPromises.stat(sourcePath)
      if (sourceStats.isDirectory()) {
        await this.fsPromises.cp(sourcePath, targetPath, { recursive: true } as any)
        await this.fsPromises.rm(sourcePath, { recursive: true, force: true } as any)
        return
      }

      await this.fsPromises.copyFile(sourcePath, targetPath)
      await this.fsPromises.unlink(sourcePath)
    }
  }

  private queueAutoProcess(targetPath: string) {
    const existingTimer = this.pendingTimers.get(targetPath)
    if (existingTimer) {
      this.clearTimeoutFn(existingTimer)
    }

    const timer = this.setTimeoutFn(() => {
      this.pendingTimers.delete(targetPath)
      void this.processAutoTarget(targetPath)
    }, this.state.config.stableWindowMs)

    this.pendingTimers.set(targetPath, timer)
  }

  private async processAutoTarget(targetPath: string) {
    if (this.isDestinationRootPath(targetPath)) {
      return
    }

    const fileName = this.pathModule.basename(targetPath)
    if (this.isIgnoredFileName(fileName)) {
      return
    }

    let firstStat: OrganizerStats
    try {
      firstStat = await this.fsPromises.stat(targetPath)
      if (!this.isSupportedEntryStats(firstStat)) {
        return
      }
    } catch {
      return
    }

    await new Promise<void>((resolve) => {
      this.setTimeoutFn(() => resolve(), this.state.config.stableWindowMs)
    })

    let secondStat: OrganizerStats
    try {
      secondStat = await this.fsPromises.stat(targetPath)
      if (!this.isSupportedEntryStats(secondStat)) {
        return
      }
    } catch {
      return
    }

    if (firstStat.size !== secondStat.size || firstStat.mtime.getTime() !== secondStat.mtime.getTime()) {
      this.queueAutoProcess(targetPath)
      return
    }

    const previewItem = this.createPreviewItem(this.createCandidateFromStats(targetPath, fileName, secondStat))
    const entryLabel = previewItem.entryType === 'directory' ? '文件夹' : '文件'

    if (previewItem.status !== 'ready' || !previewItem.targetPath) {
      this.pushActivity('info', `新${entryLabel} ${fileName} 未命中规则`, targetPath, null)
      this.persistStoredState()
      this.emitState()
      return
    }

    try {
      const finalTargetPath = await this.resolveTargetPath(previewItem.targetPath)
      if (!finalTargetPath) {
        this.pushActivity('warning', `新${entryLabel} ${fileName} 因重名被跳过`, targetPath, previewItem.targetPath)
        this.persistStoredState()
        this.emitState()
        return
      }

      await this.fsPromises.mkdir(this.pathModule.dirname(finalTargetPath), { recursive: true } as any)
      await this.moveEntry(targetPath, finalTargetPath)
      this.pushActivity('success', `自动整理${entryLabel} ${fileName}`, targetPath, finalTargetPath)
      this.persistStoredState()
      this.emitState()
    } catch (error) {
      const message = createErrorMessage(error)
      this.pushActivity('error', `自动整理${entryLabel} ${fileName} 失败：${message}`, targetPath, previewItem.targetPath)
      this.state = {
        ...this.state,
        lastError: message
      }
      this.persistStoredState()
      this.emitState()
    }
  }

  private pushActivity(level: 'info' | 'warning' | 'error' | 'success', message: string, sourcePath?: string | null, targetPath?: string | null) {
    this.state = {
      ...this.state,
      activity: [
        {
          id: this.createId(),
          timestamp: new Date(this.now()).toISOString(),
          level,
          message,
          sourcePath: sourcePath ?? null,
          targetPath: targetPath ?? null
        },
        ...this.state.activity
      ].slice(0, 100)
    }
  }

  private hydratePreviewItem(item: unknown): DownloadOrganizerPreviewItem {
    return {
      ...(item as DownloadOrganizerPreviewItem),
      entryType: (item as Partial<DownloadOrganizerPreviewItem>)?.entryType === 'directory' ? 'directory' : 'file'
    }
  }

  private createCandidateFromStats(sourcePath: string, fileName: string, stats: OrganizerStats): DownloadOrganizerCandidate {
    const isDirectory = stats.isDirectory()
    return {
      entryType: isDirectory ? 'directory' : 'file',
      sourcePath,
      fileName,
      extension: isDirectory ? '' : this.pathModule.extname(fileName).toLowerCase(),
      sizeBytes: stats.size,
      modifiedAt: toDateIso(stats.mtime),
      category: isDirectory ? 'other' : classifyDownloadOrganizerCategory(fileName)
    }
  }

  private isSupportedEntryStats(stats: OrganizerStats) {
    return stats.isFile() || stats.isDirectory()
  }

  private isDestinationRootPath(targetPath: string) {
    const normalizedTargetPath = this.normalizePath(targetPath)
    const normalizedDestinationRoot = this.normalizePath(this.state.config.destinationRoot)

    return normalizedTargetPath === normalizedDestinationRoot
      || normalizedTargetPath.startsWith(`${normalizedDestinationRoot}${this.pathModule.sep}`)
  }

  private normalizePath(targetPath: string) {
    const resolvedPath = this.pathModule.resolve(targetPath)
    return process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath
  }

  private async mapWithConcurrency<TInput, TResult>(
    items: TInput[],
    concurrency: number,
    worker: (item: TInput, index: number) => Promise<TResult>
  ) {
    const results = new Array<TResult>(items.length)
    let nextIndex = 0

    const runWorker = async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        results[currentIndex] = await worker(items[currentIndex], currentIndex)
      }
    }

    const workerCount = Math.max(1, Math.min(concurrency, items.length || 1))
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
    return results
  }
}

export const downloadOrganizerService = new DownloadOrganizerService({
  storeService
})
