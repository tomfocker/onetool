import { ipcMain } from 'electron'
import { troubleshootingService } from '../services/TroubleshootingService'

type TroubleshootingServiceLike = Pick<
  typeof troubleshootingService,
  | 'scanGroupPolicy'
  | 'installGroupPolicy'
  | 'openGroupPolicyEditor'
  | 'diagnosePrinterShare'
  | 'repairPrinterShare'
  | 'savePrinterShareCredential'
  | 'openPrinterShareTarget'
>

export function registerTroubleshootingIpc(service: TroubleshootingServiceLike = troubleshootingService) {
  ipcMain.handle('troubleshooting:group-policy-scan', () => {
    return service.scanGroupPolicy()
  })

  ipcMain.handle('troubleshooting:group-policy-install', () => {
    return service.installGroupPolicy()
  })

  ipcMain.handle('troubleshooting:group-policy-open', () => {
    return service.openGroupPolicyEditor()
  })

  ipcMain.handle('troubleshooting:printer-share-diagnose', (_event, request) => {
    return service.diagnosePrinterShare(request)
  })

  ipcMain.handle('troubleshooting:printer-share-repair', (_event, request) => {
    return service.repairPrinterShare(request)
  })

  ipcMain.handle('troubleshooting:printer-share-credential', (_event, request) => {
    return service.savePrinterShareCredential(request)
  })

  ipcMain.handle('troubleshooting:printer-share-open', (_event, request) => {
    return service.openPrinterShareTarget(request)
  })
}
