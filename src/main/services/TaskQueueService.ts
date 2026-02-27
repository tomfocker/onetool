import { logger } from '../utils/logger'

type Task<T> = () => Promise<T>

class TaskQueueService {
  private queue: Array<{ task: Task<any>, resolve: (val: any) => void, reject: (err: any) => void, name: string }> = []
  private activeTasks = 0
  private readonly maxConcurrentTasks = 2 // 限制同时进行的重负载任务数

  constructor() {}

  /**
   * 将任务加入调度队列
   * @param name 任务名称（用于日志）
   * @param task 异步函数
   */
  async enqueue<T>(name: string, task: Task<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      logger.info(`TaskQueue: Enqueueing task [${name}]. Current active: ${this.activeTasks}`)
      this.queue.push({ task, resolve, reject, name })
      this.processQueue()
    })
  }

  private async processQueue() {
    if (this.activeTasks >= this.maxConcurrentTasks || this.queue.length === 0) {
      return
    }

    const { task, resolve, reject, name } = this.queue.shift()!
    this.activeTasks++
    
    logger.info(`TaskQueue: Starting task [${name}]. Active tasks: ${this.activeTasks}`)

    try {
      const result = await task()
      resolve(result)
    } catch (error) {
      logger.error(`TaskQueue: Task [${name}] failed:`, error)
      reject(error)
    } finally {
      this.activeTasks--
      logger.info(`TaskQueue: Task [${name}] finished. Active tasks: ${this.activeTasks}`)
      this.processQueue()
    }
  }
}

export const taskQueueService = new TaskQueueService()
