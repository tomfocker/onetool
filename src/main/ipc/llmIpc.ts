import { ipcMain } from 'electron'
import { llmService } from '../services/LlmService'

export function registerLlmIpc() {
  ipcMain.handle('llm-get-config-status', async () => llmService.getConfigStatus())
  ipcMain.handle('llm-test-connection', async () => llmService.testConnection())
  ipcMain.handle('llm-analyze-system', async (_event, input) => llmService.analyzeSystem(input))
  ipcMain.handle('llm-suggest-rename', async (_event, input) => llmService.suggestRename(input))
  ipcMain.handle('llm-suggest-space-cleanup', async (_event, input) => llmService.suggestSpaceCleanup(input))
}
