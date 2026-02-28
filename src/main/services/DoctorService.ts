import { execSync } from 'child_process'
import fs from 'fs'
import { logger } from '../utils/logger'
import { IpcResponse } from '../../shared/types'
import { screenRecorderService } from './ScreenRecorderService'

export interface DoctorReport {
  winget: { ok: boolean; version?: string; error?: string }
  ffmpeg: { ok: boolean; path?: string; error?: string }
  powershell: { ok: boolean; executionPolicy?: string; error?: string }
  storage: { ok: boolean; writable: boolean }
}

export class DoctorService {
  constructor() {}

  async runFullAudit(): Promise<IpcResponse<DoctorReport>> {
    logger.info('DoctorService: Starting full system audit...')
    
    const report: DoctorReport = {
      winget: this.checkWinget(),
      ffmpeg: this.checkFFmpeg(),
      powershell: this.checkPowerShell(),
      storage: this.checkStorage()
    }

    const allOk = Object.values(report).every(v => v.ok)
    logger.info(`DoctorService: Audit finished. Status: ${allOk ? 'HEALTHY' : 'ISSUES_FOUND'}`)

    return { success: true, data: report }
  }

  private checkWinget() {
    try {
      const version = execSync('winget --version', { windowsHide: true }).toString().trim()
      return { ok: true, version }
    } catch (e) {
      return { ok: false, error: '未找到 winget 或环境未配置' }
    }
  }

  private checkFFmpeg() {
    try {
      const path = screenRecorderService.getFfmpegPath()
      if (fs.existsSync(path)) {
        execSync(`"${path}" -version`, { windowsHide: true, timeout: 2000 })
        return { ok: true, path }
      }
      return { ok: false, error: 'FFmpeg 路径无效' }
    } catch (e) {
      return { ok: false, error: 'FFmpeg 无法执行或损坏' }
    }
  }

  private checkPowerShell() {
    try {
      const policy = execSync('powershell Get-ExecutionPolicy', { windowsHide: true }).toString().trim()
      const isOk = !['Restricted', 'AllSigned'].includes(policy)
      return { ok: isOk, executionPolicy: policy, error: isOk ? undefined : '执行策略受限' }
    } catch (e) {
      return { ok: false, error: 'PowerShell 调用失败' }
    }
  }

  private checkStorage() {
    try {
      const testPath = require('path').join((require('electron')).app.getPath('userData'), '.doctor_test')
      fs.writeFileSync(testPath, 'test')
      fs.unlinkSync(testPath)
      return { ok: true, writable: true }
    } catch (e) {
      return { ok: false, writable: false }
    }
  }
}

export const doctorService = new DoctorService()
