import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { createElectronBridge } from './createElectronBridge'

const electronBridge = createElectronBridge({ ipcRenderer, webUtils })

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronBridge)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronBridge
}
