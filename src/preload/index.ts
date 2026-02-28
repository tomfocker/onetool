import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { z } from 'zod'
import {
  AutoClickerConfig,
  ScreenRecorderConfig,
  WebActivatorToggleSchema,
  WebActivatorShortcutSchema
} from '../shared/ipc-schemas'

const renameAPI = {
  renameFiles: (files: string[], mode: string, options: any) => {
    return ipcRenderer.invoke('rename-files', { files, mode, options })
  },
  getFileInfo: (filePaths: string[]) => {
    return ipcRenderer.invoke('get-file-info', filePaths)
  },
  selectFilesAndFolders: () => {
    return ipcRenderer.invoke('select-files-folders')
  }
}

const capswriterAPI = {
  startServer: () => {
    return ipcRenderer.invoke('capswriter-start-server')
  },
  startClient: () => {
    return ipcRenderer.invoke('capswriter-start-client')
  },
  stopServer: () => {
    return ipcRenderer.invoke('capswriter-stop-server')
  },
  stopClient: () => {
    return ipcRenderer.invoke('capswriter-stop-client')
  },
  getStatus: () => {
    return ipcRenderer.invoke('capswriter-get-status')
  },
  startAll: () => {
    return ipcRenderer.invoke('capswriter-start-all')
  },
  stopAll: () => {
    return ipcRenderer.invoke('capswriter-stop-all')
  }
}

const quickInstallerAPI = {
  installSoftware: (softwareList: { id: string; name: string; source: string }[]) => {
    return ipcRenderer.invoke('quick-installer-install', softwareList)
  },
  onInstallLog: (callback: (data: { type: 'stdout' | 'stderr' | 'info' | 'error' | 'success'; message: string }) => void) => {
    const handler = (_event: any, data: { type: 'stdout' | 'stderr' | 'info' | 'error' | 'success'; message: string }) => callback(data)
    ipcRenderer.on('quick-installer-log', handler)
    return () => {
      ipcRenderer.removeListener('quick-installer-log', handler)
    }
  },
  onInstallProgress: (callback: (data: { current: number; total: number; currentName: string }) => void) => {
    const handler = (_event: any, data: { current: number; total: number; currentName: string }) => callback(data)
    ipcRenderer.on('quick-installer-progress', handler)
    return () => {
      ipcRenderer.removeListener('quick-installer-progress', handler)
    }
  },
  onInstallComplete: (callback: (data: { success: boolean; message: string }) => void) => {
    const handler = (_event: any, data: { success: boolean; message: string }) => callback(data)
    ipcRenderer.on('quick-installer-complete', handler)
    return () => {
      ipcRenderer.removeListener('quick-installer-complete', handler)
    }
  }
}

const autoClickerAPI = {
  start: (config: AutoClickerConfig) => {
    return ipcRenderer.invoke('autoclicker-start', config)
  },
  stop: () => {
    return ipcRenderer.invoke('autoclicker-stop')
  },
  getStatus: () => {
    return ipcRenderer.invoke('autoclicker-status')
  },
  updateConfig: (config: any) => {
    return ipcRenderer.invoke('autoclicker-update-config', config)
  }
}

const autoStartAPI = {
  getStatus: () => {
    return ipcRenderer.invoke('autostart-get-status')
  },
  set: (enabled: boolean) => {
    return ipcRenderer.invoke('autostart-set', enabled)
  }
}

const settingsAPI = {
  getAll: () => ipcRenderer.invoke('settings-get-all'),
  update: (updates: any) => ipcRenderer.invoke('settings-update', updates),
  onChanged: (callback: (newSettings: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data)
    ipcRenderer.on('settings-changed', subscription)
    return () => ipcRenderer.removeListener('settings-changed', subscription)
  }
}

const storeAPI = {
  getAll: () => ipcRenderer.invoke('store-get-all'),
  get: (key: string) => ipcRenderer.invoke('store-get', key),
  set: (key: string, value: any) => ipcRenderer.invoke('store-set', { key, value }),
  onChanged: (callback: (newStore: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data)
    ipcRenderer.on('store-changed', subscription)
    return () => ipcRenderer.removeListener('store-changed', subscription)
  }
}

const systemConfigAPI = {
  getSystemConfig: () => {
    return ipcRenderer.invoke('get-system-config')
  }
}

const screenSaverAPI = {
  start: () => {
    return ipcRenderer.invoke('start-screen-saver')
  }
}

const webActivatorAPI = {
  getWindowList: () => {
    return ipcRenderer.invoke('web-activator-get-window-list')
  },
  toggleWindow: (config: z.infer<typeof WebActivatorToggleSchema>) => {
    return ipcRenderer.invoke('web-activator-toggle-window', config)
  },
  registerShortcuts: (configs: Array<z.infer<typeof WebActivatorShortcutSchema>>) => {
    return ipcRenderer.invoke('web-activator-register-shortcuts', configs)
  },
  checkVisibility: (configs: Array<{ type: 'app' | 'tab'; pattern: string; hwnd?: number }>) => {
    return ipcRenderer.invoke('web-activator-check-visibility', configs)
  },
  onShortcutTriggered: (callback: (data: { id: string; action: string }) => void) => {
    const handler = (_event: any, data: { id: string; action: string }) => callback(data)
    ipcRenderer.on('web-activator-shortcut-triggered', handler)
    return () => {
      ipcRenderer.removeListener('web-activator-shortcut-triggered', handler)
    }
  }
}

interface ClipboardItem {
  id: string
  type: 'text' | 'image'
  content: string
  preview?: string
  timestamp: number
  pinned: boolean
}

const clipboardAPI = {
  getHistory: () => {
    ipcRenderer.send('get-clipboard-history')
  },
  deleteItem: (id: string) => {
    ipcRenderer.send('delete-clipboard-item', id)
  },
  togglePin: (id: string) => {
    ipcRenderer.send('toggle-clipboard-pin', id)
  },
  clearHistory: () => {
    ipcRenderer.send('clear-clipboard-history')
  },
  copyImage: (dataUrl: string) => {
    ipcRenderer.send('copy-image-to-clipboard', dataUrl)
  },
  onChange: (callback: (item: ClipboardItem) => void) => {
    const handler = (_event: any, item: ClipboardItem) => callback(item)
    ipcRenderer.on('clipboard-change', handler)
    return () => {
      ipcRenderer.removeListener('clipboard-change', handler)
    }
  },
  onHistory: (callback: (history: ClipboardItem[]) => void) => {
    const handler = (_event: any, history: ClipboardItem[]) => callback(history)
    ipcRenderer.on('clipboard-history', handler)
    return () => {
      ipcRenderer.removeListener('clipboard-history', handler)
    }
  }
}

const screenRecorderAPI = {
  selectOutput: () => {
    return ipcRenderer.invoke('screen-recorder-select-output')
  },
  startRecording: (config: ScreenRecorderConfig) => {
    return ipcRenderer.invoke('screen-recorder-start', config)
  },
  stopRecording: () => {
    return ipcRenderer.invoke('screen-recorder-stop')
  },
  getStatus: () => {
    return ipcRenderer.invoke('screen-recorder-status')
  },
  getDefaultPath: () => {
    return ipcRenderer.invoke('screen-recorder-get-default-path')
  },
  getHotkey: () => {
    return ipcRenderer.invoke('recorder-hotkey-get')
  },
  setHotkey: (hotkey: string) => {
    return ipcRenderer.invoke('recorder-hotkey-set', hotkey)
  },
  getWindows: () => {
    return ipcRenderer.invoke('screen-recorder-get-windows')
  },
  onStarted: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('screen-recorder-started', handler)
    return () => {
      ipcRenderer.removeListener('screen-recorder-started', handler)
    }
  },
  onProgress: (callback: (data: { timemark: string }) => void) => {
    const handler = (_event: any, data: { timemark: string }) => callback(data)
    ipcRenderer.on('screen-recorder-progress', handler)
    return () => {
      ipcRenderer.removeListener('screen-recorder-progress', handler)
    }
  },
  onStopped: (callback: (data: { success: boolean; outputPath?: string; error?: string }) => void) => {
    const handler = (_event: any, data: { success: boolean; outputPath?: string; error?: string }) => callback(data)
    ipcRenderer.on('screen-recorder-stopped', handler)
    return () => {
      ipcRenderer.removeListener('screen-recorder-stopped', handler)
    }
  },
  onError: (callback: (data: { message: string }) => void) => {
    const handler = (_event: any, data: { message: string }) => callback(data)
    ipcRenderer.on('screen-recorder-error', handler)
    return () => {
      ipcRenderer.removeListener('screen-recorder-error', handler)
    }
  },
  onToggleHotkey: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('screen-recorder-toggle-hotkey', handler)
    return () => {
      ipcRenderer.removeListener('screen-recorder-toggle-hotkey', handler)
    }
  }
}

const windowAPI = {
  minimize: () => {
    return ipcRenderer.invoke('window-minimize')
  },
  maximize: () => {
    return ipcRenderer.invoke('window-maximize')
  },
  close: () => {
    return ipcRenderer.invoke('window-close')
  },
  isMaximized: () => {
    return ipcRenderer.invoke('window-is-maximized')
  }
}

const floatBallAPI = {
  move: (x: number, y: number) => {
    ipcRenderer.send('floatball-move', { x, y })
  },
  resize: (width: number, height: number) => {
    ipcRenderer.send('floatball-resize', { width, height })
  },
  startDrag: (filePath: string) => {
    ipcRenderer.send('ondragstart', filePath)
  },
  hideWindow: () => {
    ipcRenderer.send('floatball-hide-window')
  },
  showWindow: () => {
    ipcRenderer.send('floatball-show-window')
  }
}

const screenOverlayAPI = {
  start: () => {
    return ipcRenderer.invoke('screen-overlay-start')
  },
  close: () => {
    return ipcRenderer.invoke('screen-overlay-close')
  },
  notifyReady: () => {
    return ipcRenderer.send('screen-overlay:ready')
  },
  onScreenshot: (callback: (dataUrl: string) => void) => {
    const handler = (_event: any, dataUrl: string) => callback(dataUrl)
    ipcRenderer.on('screen-overlay:screenshot', handler)
    return () => {
      ipcRenderer.removeListener('screen-overlay:screenshot', handler)
    }
  }
}

const screenshotAPI = {
  getSettings: () => ipcRenderer.invoke('screenshot-settings-get'),
  setSettings: (settings: { savePath: string; autoSave: boolean }) => ipcRenderer.invoke('screenshot-settings-set', settings),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  capture: (bounds: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke('screenshot-capture', bounds),
  saveImage: (dataUrl: string, customPath?: string) => ipcRenderer.invoke('save-image', dataUrl, customPath),
  copyToClipboard: (dataUrl: string) => ipcRenderer.invoke('copy-to-clipboard-image', dataUrl),
  getHotkey: () => ipcRenderer.invoke('screenshot-hotkey-get'),
  setHotkey: (hotkey: string) => ipcRenderer.invoke('screenshot-hotkey-set', hotkey)
}

const colorPickerAPI = {
  enable: () => {
    return ipcRenderer.invoke('color-picker:enable')
  },
  disable: () => {
    return ipcRenderer.invoke('color-picker:disable')
  },
  pick: () => {
    return ipcRenderer.invoke('color-picker:pick')
  },
  confirm: (data: any) => {
    return ipcRenderer.send('color-picker:confirm-pick', data)
  },
  cancel: () => {
    return ipcRenderer.send('color-picker:cancel-pick')
  },
  // overlay 渲染进程就绪后调用，通知主进程可以发送截图了
  notifyReady: () => {
    ipcRenderer.send('color-picker:overlay-ready')
  },
  onUpdate: (callback: (data: { hex: string; rgb: string; r: number; g: number; b: number; x: number; y: number }) => void) => {
    const handler = (_event: any, data: { hex: string; rgb: string; r: number; g: number; b: number; x: number; y: number }) => callback(data)
    ipcRenderer.on('color-picker:update', handler)
    return () => {
      ipcRenderer.removeListener('color-picker:update', handler)
    }
  },
  onScreenshot: (callback: (dataUrl: string) => void) => {
    const handler = (_event: any, dataUrl: string) => callback(dataUrl)
    ipcRenderer.on('color-picker:screenshot', handler)
    return () => {
      ipcRenderer.removeListener('color-picker:screenshot', handler)
    }
  },
  onSelected: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('color-picker:selected', handler)
    return () => {
      ipcRenderer.removeListener('color-picker:selected', handler)
    }
  }
}

const networkAPI = {
  ping: (host: string) => {
    return ipcRenderer.invoke('network:ping', host)
  },
  pingBatch: (hosts: string[]) => {
    return ipcRenderer.invoke('network:ping-batch', hosts)
  },
  getInfo: () => {
    return ipcRenderer.invoke('network:get-info')
  },
  scanLan: (subnet: string) => {
    return ipcRenderer.invoke('network:scan-lan', subnet)
  }
}

const translateAPI = {
  translateImage: (base64Image: string) => {
    return ipcRenderer.invoke('translate:image', base64Image)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', {
      ...electronAPI,
      ipcRenderer: {
        on: (channel: string, func: (...args: any[]) => void) => {
          const subscription = (_event: any, ...args: any[]) => func(...args)
          ipcRenderer.on(channel, subscription)
          return () => ipcRenderer.removeListener(channel, subscription)
        },
        send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
        invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args)
      },
      rename: renameAPI,
      capswriter: capswriterAPI,
      quickInstaller: quickInstallerAPI,
      autoClicker: autoClickerAPI,
      autoStart: autoStartAPI,
      settings: settingsAPI,
      store: storeAPI,
      systemConfig: systemConfigAPI,
      screenSaver: screenSaverAPI,
      webActivator: webActivatorAPI,
      clipboard: clipboardAPI,
      screenRecorder: screenRecorderAPI,
      window: windowAPI,
      floatBall: floatBallAPI,
      screenOverlay: screenOverlayAPI,
      screenshot: screenshotAPI,
      colorPicker: colorPickerAPI,
      network: networkAPI,
      translate: translateAPI
    })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = {
    ...electronAPI,
    ipcRenderer: {
      on: (channel: string, func: (...args: any[]) => void) => {
        const subscription = (_event: any, ...args: any[]) => func(...args)
        ipcRenderer.on(channel, subscription)
        return () => ipcRenderer.removeListener(channel, subscription)
      },
      send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
      invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args)
    },
    rename: renameAPI,
    capswriter: capswriterAPI,
    quickInstaller: quickInstallerAPI,
    autoClicker: autoClickerAPI,
    autoStart: autoStartAPI,
    settings: settingsAPI,
    store: storeAPI,
    systemConfig: systemConfigAPI,
    screenSaver: screenSaverAPI,
    webActivator: webActivatorAPI,
    clipboard: clipboardAPI,
    screenRecorder: screenRecorderAPI,
    window: windowAPI,
    floatBall: floatBallAPI,
    screenOverlay: screenOverlayAPI,
    screenshot: screenshotAPI,
    colorPicker: colorPickerAPI,
    network: networkAPI,
    translate: translateAPI
  }
}
