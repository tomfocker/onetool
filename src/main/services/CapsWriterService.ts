import { ChildProcess, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { IpcResponse } from '../../shared/types'
import { processRegistry } from './ProcessRegistry'

export class CapsWriterService {
  private serverProcess: ChildProcess | null = null
  private clientProcess: ChildProcess | null = null
  private readonly CAPS_WRITER_PATH = 'c:\CapsWriter-Offline'

  constructor() {}

  async startServer(): Promise<IpcResponse> {
    try {
      if (this.serverProcess) {
        return { success: false, error: '服务端已在运行' }
      }

      const serverExe = path.join(this.CAPS_WRITER_PATH, 'start_server.exe')
      if (!fs.existsSync(serverExe)) {
        return { success: false, error: `找不到服务端文件: ${serverExe}` }
      }

      this.serverProcess = spawn(serverExe, [], {
        cwd: this.CAPS_WRITER_PATH,
        detached: false,
        stdio: 'pipe'
      })
      processRegistry.register(this.serverProcess)

      this.serverProcess.on('close', () => {
        this.serverProcess = null
      })

      this.serverProcess.on('error', () => {
        this.serverProcess = null
      })

      return { success: true }
    } catch (error) {
      this.serverProcess = null
      return { success: false, error: (error as Error).message }
    }
  }

  async startClient(): Promise<IpcResponse> {
    try {
      if (this.clientProcess) {
        return { success: false, error: '客户端已在运行' }
      }

      const clientExe = path.join(this.CAPS_WRITER_PATH, 'start_client.exe')
      if (!fs.existsSync(clientExe)) {
        return { success: false, error: `找不到客户端文件: ${clientExe}` }
      }

      this.clientProcess = spawn(clientExe, [], {
        cwd: this.CAPS_WRITER_PATH,
        detached: false,
        stdio: 'pipe'
      })
      processRegistry.register(this.clientProcess)

      this.clientProcess.on('close', () => {
        this.clientProcess = null
      })

      this.clientProcess.on('error', () => {
        this.clientProcess = null
      })

      return { success: true }
    } catch (error) {
      this.clientProcess = null
      return { success: false, error: (error as Error).message }
    }
  }

  async stopServer(): Promise<IpcResponse> {
    try {
      if (this.serverProcess) {
        this.serverProcess.kill()
        this.serverProcess = null
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  async stopClient(): Promise<IpcResponse> {
    try {
      if (this.clientProcess) {
        this.clientProcess.kill()
        this.clientProcess = null
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  getStatus(): IpcResponse<{ serverRunning: boolean, clientRunning: boolean }> {
    return {
      success: true,
      data: {
        serverRunning: this.serverProcess !== null,
        clientRunning: this.clientProcess !== null
      }
    }
  }

  async startAll(): Promise<IpcResponse<{ serverSuccess: boolean, clientSuccess: boolean, serverError?: string, clientError?: string }>> {
    try {
      let serverSuccess = true
      let clientSuccess = true
      let serverError: string | undefined
      let clientError: string | undefined

      if (!this.serverProcess) {
        const serverRes = await this.startServer()
        if (!serverRes.success) {
          serverSuccess = false
          serverError = serverRes.error
        }
      }

      if (!this.clientProcess) {
        const clientRes = await this.startClient()
        if (!clientRes.success) {
          clientSuccess = false
          clientError = clientRes.error
        }
      }

      return {
        success: serverSuccess && clientSuccess,
        data: {
          serverSuccess,
          clientSuccess,
          serverError,
          clientError
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  async stopAll(): Promise<IpcResponse> {
    try {
      await this.stopServer()
      await this.stopClient()
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
}

export const capsWriterService = new CapsWriterService()
