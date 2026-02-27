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

    // Persist to file
    try {
      fs.appendFileSync(this.logPath, logEntry)
    } catch (e) {
      console.error('Failed to write to log file:', e)
    }
  }

  debug(message: string, ...args: any[]) { this.log(LogLevel.DEBUG, message, ...args) }
  info(message: string, ...args: any[]) { this.log(LogLevel.INFO, message, ...args) }
  warn(message: string, ...args: any[]) { this.log(LogLevel.WARN, message, ...args) }
  error(message: string, ...args: any[]) { this.log(LogLevel.ERROR, message, ...args) }
}

export const logger = new Logger()
