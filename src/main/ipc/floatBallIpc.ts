import { ipcMain, nativeImage } from 'electron'
import { windowManagerService } from '../services/WindowManagerService'
import * as path from 'path'
import * as fs from 'fs'

export function registerFloatBallIpc() {
    ipcMain.on('floatball-move', (event, { x, y }) => {
        const floatBall = windowManagerService.getFloatBallWindow()
        if (floatBall) {
            const [currentX, currentY] = floatBall.getPosition()
            floatBall.setPosition(currentX + x, currentY + y)
        }
    })

    ipcMain.on('floatball-resize', (event, { width, height }) => {
        const floatBall = windowManagerService.getFloatBallWindow()
        if (floatBall) {
            floatBall.setBounds({ width, height })
        }
    })

    ipcMain.on('floatball-hide-window', () => {
        const floatBall = windowManagerService.getFloatBallWindow()
        if (floatBall) {
            floatBall.hide()
        }
    })

    ipcMain.on('floatball-show-window', () => {
        const floatBall = windowManagerService.getFloatBallWindow()
        if (floatBall) {
            floatBall.showInactive()
        }
    })

    ipcMain.on('floatball-toggle-visibility', (event, visible: boolean) => {
        const floatBall = windowManagerService.getFloatBallWindow()
        if (floatBall) {
            if (visible) {
                floatBall.showInactive()
            } else {
                floatBall.hide()
            }
        }
    })

    ipcMain.handle('settings-set-floatball-hotkey', async (event, hotkey: string) => {
        const { hotkeyService } = require('../services/HotkeyService')
        return hotkeyService.setFloatBallHotkey(hotkey)
    })

    ipcMain.on('ondragstart', (event, filePath) => {
        try {
            if (fs.existsSync(filePath)) {
                // 创建一个空的或默认图标进行拖拽
                let icon = nativeImage.createEmpty()
                const ext = path.extname(filePath).toLowerCase()
                if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
                    try {
                        icon = nativeImage.createFromPath(filePath).resize({ width: 32, height: 32 })
                    } catch (e) {
                        console.error('Failed to create icon from image', e)
                    }
                }
                event.sender.startDrag({
                    file: filePath,
                    icon: icon
                })
            }
        } catch (e) {
            console.error('Drag error', e)
        }
    })
}
