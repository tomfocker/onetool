import { ipcMain } from 'electron'
import { translateService } from '../services/TranslateService'
import type { ScreenOverlayMode } from '../../shared/llm'

export function registerTranslateIpc() {
    ipcMain.handle('translate:image', async (_event, base64Image: string, mode: ScreenOverlayMode = 'translate') => {
        return translateService.translateImage(base64Image, mode)
    })
}
