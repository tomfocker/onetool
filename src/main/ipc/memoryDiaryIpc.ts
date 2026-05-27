import { ipcMain } from 'electron'
import { screenpipeManagementService } from '../services/ScreenpipeManagementService'
import { memoryTimelineService } from '../services/MemoryTimelineService'
import { memoryDiaryService } from '../services/MemoryDiaryService'

export function registerMemoryDiaryIpc() {
  ipcMain.handle('memory-screenpipe-get-state', () => {
    return screenpipeManagementService.getStoredState()
  })

  ipcMain.handle('memory-screenpipe-get-cli-status', () => {
    return screenpipeManagementService.getCliStatus()
  })

  ipcMain.handle('memory-screenpipe-update-config', (_event, updates) => {
    return screenpipeManagementService.updateConfig(updates)
  })

  ipcMain.handle('memory-screenpipe-install-latest', () => {
    return screenpipeManagementService.installLatest()
  })

  ipcMain.handle('memory-screenpipe-start', () => {
    return screenpipeManagementService.start()
  })

  ipcMain.handle('memory-screenpipe-stop', () => {
    return screenpipeManagementService.stop()
  })

  ipcMain.handle('memory-screenpipe-get-runtime-status', () => {
    return screenpipeManagementService.getRuntimeStatus()
  })

  ipcMain.handle('memory-screenpipe-get-token', () => {
    return screenpipeManagementService.getAuthToken()
  })

  ipcMain.handle('memory-screenpipe-get-logs', () => {
    return screenpipeManagementService.getLogs()
  })

  ipcMain.handle('memory-timeline-query', (_event, request) => {
    return memoryTimelineService.queryTimeline(request)
  })

  ipcMain.handle('memory-diary-generate', (_event, request) => {
    return memoryDiaryService.generate(request)
  })

  ipcMain.handle('memory-diary-list', () => {
    return memoryDiaryService.list()
  })

  ipcMain.handle('memory-diary-open', (_event, id: string) => {
    return memoryDiaryService.open(id)
  })

  ipcMain.handle('memory-diary-save', (_event, request) => {
    return memoryDiaryService.save(request)
  })

  ipcMain.handle('memory-diary-delete', (_event, id: string) => {
    return memoryDiaryService.delete(id)
  })
}
