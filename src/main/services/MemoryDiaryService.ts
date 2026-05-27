import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import type { IpcResponse } from '../../shared/types'
import {
  createDefaultMemoryDiaryStoredState,
  type MemoryDiaryGenerateRequest,
  type MemoryDiaryGenerateResult,
  type MemoryDiaryHistoryEntry,
  type MemoryDiaryStoredState
} from '../../shared/memoryDiary'
import { storeService } from './StoreService'
import { llmService } from './LlmService'

type StoreLike = {
  get: (key: 'memoryDiary') => MemoryDiaryStoredState | undefined
  set: (key: 'memoryDiary', value: MemoryDiaryStoredState) => void
}

type LlmLike = Pick<typeof llmService, 'generateMemoryDiary'>
type AppLike = Pick<typeof app, 'getPath'>
type FsPromisesLike = Pick<typeof fs.promises, 'mkdir' | 'writeFile' | 'readFile' | 'unlink'>

type MemoryDiaryServiceDependencies = {
  appModule?: AppLike
  fsPromises?: FsPromisesLike
  pathModule?: typeof path
  storeService?: StoreLike
  llmService?: LlmLike
  now?: () => Date
}

export class MemoryDiaryService {
  private readonly appModule: AppLike
  private readonly fsPromises: FsPromisesLike
  private readonly pathModule: typeof path
  private readonly store: StoreLike
  private readonly llm: LlmLike
  private readonly now: () => Date

  constructor(dependencies: MemoryDiaryServiceDependencies = {}) {
    this.appModule = dependencies.appModule ?? app
    this.fsPromises = dependencies.fsPromises ?? fs.promises
    this.pathModule = dependencies.pathModule ?? path
    this.store = dependencies.storeService ?? storeService
    this.llm = dependencies.llmService ?? llmService
    this.now = dependencies.now ?? (() => new Date())
  }

  async generate(request: MemoryDiaryGenerateRequest): Promise<IpcResponse<MemoryDiaryGenerateResult>> {
    return this.llm.generateMemoryDiary(request)
  }

  list(): IpcResponse<MemoryDiaryHistoryEntry[]> {
    return {
      success: true,
      data: [...this.getState().diaryHistory].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      )
    }
  }

  async open(id: string): Promise<IpcResponse<MemoryDiaryGenerateResult>> {
    try {
      const entry = this.getState().diaryHistory.find((item) => item.id === id)
      if (!entry) {
        return {
          success: false,
          error: '找不到已保存的日报'
        }
      }

      const markdown = await this.fsPromises.readFile(entry.markdownPath, 'utf8')
      return {
        success: true,
        data: {
          id: entry.id,
          date: entry.date,
          title: entry.title,
          summary: entry.summary,
          markdown: String(markdown),
          createdAt: entry.createdAt
        }
      }
    } catch (error) {
      return {
        success: false,
        error: this.toErrorMessage(error)
      }
    }
  }

  async save(result: MemoryDiaryGenerateResult): Promise<IpcResponse<MemoryDiaryHistoryEntry>> {
    try {
      const directory = this.pathModule.join(this.appModule.getPath('userData'), 'memory-diary', 'daily')
      await this.fsPromises.mkdir(directory, { recursive: true })

      const markdownPath = this.pathModule.join(directory, `${this.sanitizeFileName(result.id)}.md`)
      await this.fsPromises.writeFile(markdownPath, result.markdown, 'utf8')

      const entry: MemoryDiaryHistoryEntry = {
        id: result.id,
        date: result.date,
        title: result.title,
        summary: result.summary,
        markdownPath,
        createdAt: result.createdAt,
        updatedAt: this.now().toISOString()
      }
      const state = this.getState()
      this.saveState({
        ...state,
        diaryHistory: [
          entry,
          ...state.diaryHistory.filter((item) => item.id !== entry.id)
        ]
      })

      return {
        success: true,
        data: entry
      }
    } catch (error) {
      return {
        success: false,
        error: this.toErrorMessage(error)
      }
    }
  }

  async delete(id: string): Promise<IpcResponse> {
    const state = this.getState()
    const entry = state.diaryHistory.find((item) => item.id === id)
    if (entry) {
      await this.fsPromises.unlink(entry.markdownPath).catch(() => undefined)
    }

    this.saveState({
      ...state,
      diaryHistory: state.diaryHistory.filter((item) => item.id !== id)
    })
    return { success: true }
  }

  private getState(): MemoryDiaryStoredState {
    const storedState = this.store.get('memoryDiary')
    return {
      ...createDefaultMemoryDiaryStoredState(),
      ...(storedState || {}),
      config: {
        ...createDefaultMemoryDiaryStoredState().config,
        ...(storedState?.config || {})
      },
      diaryHistory: Array.isArray(storedState?.diaryHistory) ? storedState.diaryHistory : [],
      deploymentLogs: Array.isArray(storedState?.deploymentLogs) ? storedState.deploymentLogs : []
    }
  }

  private saveState(state: MemoryDiaryStoredState) {
    this.store.set('memoryDiary', state)
  }

  private sanitizeFileName(value: string): string {
    return value.replace(/[<>:"/\\|?*]/g, '-')
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}

export const memoryDiaryService = new MemoryDiaryService()
