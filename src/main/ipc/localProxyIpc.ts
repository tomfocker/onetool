import { ipcMain } from 'electron'
import { localProxyService } from '../services/LocalProxyService'
import { LocalProxyConfig, ProxyDoctorApplyRequest, ProxyDoctorLayerId } from '../../shared/types'

export function registerLocalProxyIpc() {
  ipcMain.handle('local-proxy:get-status', async () => {
    return localProxyService.getStatus()
  })

  ipcMain.handle('local-proxy:set-config', async (_event, config: LocalProxyConfig) => {
    return localProxyService.setConfig(config)
  })

  ipcMain.handle('local-proxy:disable', async () => {
    return localProxyService.disable()
  })

  ipcMain.handle('local-proxy:open-system-settings', async () => {
    return localProxyService.openSystemSettings()
  })

  ipcMain.handle('local-proxy:doctor-scan', async (_event, target: string) => {
    return localProxyService.doctorScan(target)
  })

  ipcMain.handle('local-proxy:doctor-apply-all', async (_event, request: ProxyDoctorApplyRequest) => {
    return localProxyService.doctorApplyAll(request)
  })

  ipcMain.handle('local-proxy:doctor-clear-all', async () => {
    return localProxyService.doctorClearAll()
  })

  ipcMain.handle('local-proxy:doctor-fix-layer', async (
    _event,
    input: { layerId: ProxyDoctorLayerId; target: string; bypass: string[] }
  ) => {
    return localProxyService.doctorFixLayer(input.layerId, input.target, input.bypass)
  })

  ipcMain.handle('local-proxy:doctor-clear-layer', async (_event, layerId: ProxyDoctorLayerId) => {
    return localProxyService.doctorClearLayer(layerId)
  })
}
