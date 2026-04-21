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

    ipcMain.on('floatball-set-position', (event, { x, y }) => {
        const floatBall = windowManagerService.getFloatBallWindow()
        if (floatBall) {
            floatBall.setPosition(Math.round(x), Math.round(y))
        }
    })

    ipcMain.on('floatball-resize', (event, { width, height }) => {
        const floatBall = windowManagerService.getFloatBallWindow()
        if (floatBall) {
            floatBall.setBounds({ width, height })
        }
    })

    ipcMain.on('floatball-hide-window', () => {
        windowManagerService.hideFloatBallWindow()
    })

    ipcMain.on('floatball-show-window', () => {
        windowManagerService.showFloatBallWindow()
    })

    ipcMain.on('floatball-toggle-visibility', (event, visible: boolean) => {
        windowManagerService.setFloatBallVisible(Boolean(visible))
    })

    ipcMain.on('floatball-set-visibility', (event, visible: boolean) => {
        windowManagerService.setFloatBallVisible(Boolean(visible))
    })

    ipcMain.on('floatball-begin-drag', (event, payload: { pointerOffsetX: number; pointerOffsetY: number }) => {
        windowManagerService.beginFloatBallDrag(payload)
    })

    ipcMain.on('floatball-drag-to', (event, payload: { screenX: number; screenY: number }) => {
        windowManagerService.dragFloatBallTo(payload)
    })

    ipcMain.handle('floatball-get-state', () => {
        return windowManagerService.getFloatBallState()
    })

    ipcMain.handle('floatball-end-drag', () => {
        return windowManagerService.endFloatBallDrag()
    })

    ipcMain.handle('floatball-peek', () => {
        const service = windowManagerService as typeof windowManagerService & {
            peekFloatBall?: () => unknown
        }

        if (typeof service.peekFloatBall === 'function') {
            return service.peekFloatBall()
        }

        return { success: false, error: '悬浮球预览尚未实现' }
    })

    ipcMain.handle('floatball-restore-dock', () => {
        const service = windowManagerService as typeof windowManagerService & {
            restoreFloatBallDock?: () => unknown
        }

        if (typeof service.restoreFloatBallDock === 'function') {
            return service.restoreFloatBallDock()
        }

        return { success: false, error: '悬浮球停靠恢复尚未实现' }
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
