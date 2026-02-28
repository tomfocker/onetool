import { app, clipboard, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { ClipboardItem } from '../../shared/types'

export class ClipboardService {
  private history: ClipboardItem[] = []
  private lastText: string = ''
  private lastImageDataUrl: string = ''
  private watcherInterval: NodeJS.Timeout | null = null
  private mainWindow: BrowserWindow | null = null

  constructor() {
    this.loadHistory()
  }

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window
  }

  private broadcastHistory(): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('clipboard-history', this.history)
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }

  startWatcher(): void {
    if (this.watcherInterval) return
    
    this.lastText = clipboard.readText() || ''
    const initialImage = clipboard.readImage()
    this.lastImageDataUrl = initialImage.isEmpty() ? '' : initialImage.toDataURL()
    
    this.watcherInterval = setInterval(() => {
      if (!this.mainWindow) return
      
      const currentText = clipboard.readText()
      const currentImage = clipboard.readImage()
      
      if (currentText && currentText !== this.lastText) {
        this.lastText = currentText
        
        const newItem: ClipboardItem = {
          id: this.generateId(),
          type: 'text',
          content: currentText,
          timestamp: Date.now(),
          pinned: false
        }
        
        this.history = [newItem, ...this.history.filter(item => item.content !== currentText)].slice(0, 100)
        this.saveHistory()
        this.mainWindow.webContents.send('clipboard-change', newItem)
      } else if (currentImage && !currentImage.isEmpty()) {
        const dataUrl = currentImage.toDataURL()
        if (dataUrl !== this.lastImageDataUrl) {
          this.lastImageDataUrl = dataUrl
          
          const newItem: ClipboardItem = {
            id: this.generateId(),
            type: 'image',
            content: dataUrl,
            timestamp: Date.now(),
            pinned: false
          }
          
          this.history = [newItem, ...this.history.filter(item => item.content !== dataUrl)].slice(0, 100)
          this.saveHistory()
          this.mainWindow.webContents.send('clipboard-change', newItem)
        }
      }
    }, 500)
  }

  stopWatcher(): void {
    if (this.watcherInterval) {
      clearInterval(this.watcherInterval)
      this.watcherInterval = null
    }
  }

  private getHistoryPath(): string {
    const userDataPath = app.getPath('userData')
    return path.join(userDataPath, 'clipboard-history.json')
  }

  private saveHistory(): void {
    try {
      const historyPath = this.getHistoryPath()
      fs.writeFileSync(historyPath, JSON.stringify(this.history, null, 2))
    } catch (error) {
      console.error('ClipboardService: Failed to save history:', error)
    }
  }

  private loadHistory(): void {
    try {
      const historyPath = this.getHistoryPath()
      if (fs.existsSync(historyPath)) {
        const data = fs.readFileSync(historyPath, 'utf-8')
        const parsed = JSON.parse(data)
        if (Array.isArray(parsed)) {
          // 清洗数据：确保每一项都是有效的 ClipboardItem
          this.history = parsed.filter(item => 
            item && typeof item === 'object' && item.id && item.type && item.content
          )
        } else {
          this.history = []
        }
      }
    } catch (error) {
      console.error('ClipboardService: Failed to load history:', error)
      this.history = []
    }
  }

  getHistory(): ClipboardItem[] {
    return this.history
  }

  deleteItem(id: string): void {
    this.history = this.history.filter(item => item.id !== id)
    this.saveHistory()
    this.broadcastHistory()
  }

  togglePin(id: string): void {
    const item = this.history.find(item => item.id === id)
    if (item) {
      item.pinned = !item.pinned
      this.saveHistory()
      this.broadcastHistory()
    }
  }

  clearHistory(): void {
    this.history = this.history.filter(item => item.pinned)
    this.saveHistory()
    this.broadcastHistory()
  }
}

export const clipboardService = new ClipboardService()
