import { ipcMain } from 'electron'
import { translateService } from '../services/TranslateService'
import type { ScreenOverlayMode } from '../../shared/llm'
import { logger } from '../utils/logger'

export function registerTranslateIpc() {
    ipcMain.handle('translate:image', async (_event, base64Image: string, mode: ScreenOverlayMode = 'translate') => {
        logger.info('[translate:image] received request', {
            mode,
            imageLength: base64Image.length
        })
        const result = await translateService.translateImage(base64Image, mode)
        logger.info('[translate:image] completed request', {
            mode,
            success: result.success,
            itemCount: Array.isArray(result.data) ? result.data.length : null,
            error: result.success ? null : result.error
        })
        return result
    })
}
