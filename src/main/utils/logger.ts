import { app } from 'electron'
import fs from 'fs'
import path from 'path'

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

class Logger {
  private logPath: string

  constructor() {
    const userDataPath = app.getPath('userData')
    const logsDir = path.join(userDataPath, 'logs')
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true })
    }
    this.logPath = path.join(logsDir, `main-${new Date().toISOString().slice(0, 10)}.log`)
  }

  private log(level: LogLevel, message: string, ...args: any[]) {
    const timestamp = new Date().toISOString()
    const formattedArgs = args.map(arg => 
      arg instanceof Error ? arg.stack : JSON.stringify(arg)
    ).join(' ')
    const logEntry = `[${timestamp}] [${level}] ${message} ${formattedArgs}
`

    // Output to console
    if (level === LogLevel.ERROR) {
      console.error(logEntry)
    } else if (level === LogLevel.WARN) {
      console.warn(logEntry)
    } else {
      console.log(logEntry)
    }

    // Persist to file asynchronously
    this.queueLog(logEntry)
  }

  private isWriting = false;
  private logQueue: string[] = [];

  private async queueLog(logEntry: string) {
    this.logQueue.push(logEntry);
    this.processQueue();
  }

  private async processQueue() {
    if (this.isWriting || this.logQueue.length === 0) return;
    
    this.isWriting = true;
    const entriesToWrite = this.logQueue.splice(0, this.logQueue.length);
    const contentToWrite = entriesToWrite.join('');

    try {
      await fs.promises.appendFile(this.logPath, contentToWrite);
    } catch (e) {
      console.error('Failed to write to log file:', e);
      // Optional: push back to queue on failure if strict logging is required
      // this.logQueue.unshift(...entriesToWrite);
    } finally {
      this.isWriting = false;
      this.processQueue();
    }
  }

  debug(message: string, ...args: any[]) { this.log(LogLevel.DEBUG, message, ...args) }
  info(message: string, ...args: any[]) { this.log(LogLevel.INFO, message, ...args) }
  warn(message: string, ...args: any[]) { this.log(LogLevel.WARN, message, ...args) }
  error(message: string, ...args: any[]) { this.log(LogLevel.ERROR, message, ...args) }
}

export const logger = new Logger()
