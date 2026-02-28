import { ipcMain } from 'electron'
import { translateService, TranslationResult } from '../services/TranslateService'

export function registerTranslateIpc() {
    ipcMain.handle('translate:image', async (_event, base64Image: string) => {
        return translateService.translateImage(base64Image)
    })
}
