import { ipcMain } from 'electron'
import { doctorService } from '../services/DoctorService'

export function registerDoctorIpc() {
  ipcMain.handle('doctor-run-audit', async () => {
    return doctorService.runFullAudit()
  })
}
