import { ChildProcess } from 'child_process'
import { logger } from '../utils/logger'

class ProcessRegistry {
  private processes = new Set<ChildProcess>()

  register(proc: ChildProcess) {
    this.processes.add(proc)
    proc.on('exit', () => {
      this.processes.delete(proc)
    })
    return proc
  }

  killAll() {
    logger.info(`ProcessRegistry: Killing ${this.processes.size} active child processes.`)
    this.processes.forEach(proc => {
      if (!proc.killed) {
        try {
          // On Windows, taskkill /F /T /PID is more effective for process trees
          if (process.platform === 'win32') {
            const { execSync } = require('child_process')
            execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: 'ignore' })
          } else {
            proc.kill('SIGKILL')
          }
        } catch (e) {
          logger.error(`Failed to kill process ${proc.pid}:`, e)
        }
      }
    })
    this.processes.clear()
  }
}

export const processRegistry = new ProcessRegistry()
