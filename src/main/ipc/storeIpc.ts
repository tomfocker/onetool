import { ipcMain, BrowserWindow } from 'electron'
import { storeService } from '../services/StoreService'
import { GlobalStore } from '../../shared/types'

export function registerStoreIpc(getMainWindow: () => BrowserWindow | null) {
  // 获取全量数据
  ipcMain.handle('store-get-all', () => {
    return { success: true, data: storeService.getAll() }
  })

  // 获取单个键值
  ipcMain.handle('store-get', (_event, key: keyof GlobalStore) => {
    return { success: true, data: storeService.get(key) }
  })

  // 设置键值
  ipcMain.handle('store-set', (_event, { key, value }: { key: keyof GlobalStore, value: any }) => {
    storeService.set(key, value)
    return { success: true }
  })

  // 监听数据变更并推送到前端
  storeService.on('changed', (newStore) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('store-changed', newStore)
    }
  })
}
