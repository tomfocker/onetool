import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { IpcResponse } from '../../shared/types'

export interface OcrLine {
    index: number
    text: string
    x: number       // 像素，相对于被识别的图片
    y: number
    width: number
    height: number
}

// 复用同一个 worker，避免重复初始化（每次初始化要 2-3 秒）
let _worker: any = null

async function getWorker() {
    if (!_worker) {
        const { createWorker } = await import('tesseract.js')
        // 优先识别英文和中文简体
        _worker = await createWorker(['eng', 'chi_sim'], 1, {
            logger: () => { }   // 关闭进度日志
        })
    }
    return _worker
}

export class OcrService {
    /**
     * 使用 tesseract.js 进行本地 OCR 识别
     * 返回带精确像素坐标的行级数据，支持沉浸式原位翻译
     */
    async recognize(base64Image: string): Promise<IpcResponse<OcrLine[]>> {
        const tmpFile = join(tmpdir(), `ocr_${Date.now()}.png`)
        try {
            // 写入临时 PNG 文件
            const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '')
            writeFileSync(tmpFile, Buffer.from(base64Data, 'base64'))

            const worker = await getWorker()
            const { data } = await worker.recognize(tmpFile)

            const lines: OcrLine[] = data.lines
                .filter((l: any) => l.text.trim().length > 1)  // 过滤掉单字符噪声
                .map((line: any, idx: number) => ({
                    index: idx,
                    text: line.text.trim(),
                    x: line.bbox.x0,
                    y: line.bbox.y0,
                    width: line.bbox.x1 - line.bbox.x0,
                    height: line.bbox.y1 - line.bbox.y0
                }))

            if (lines.length === 0) {
                return { success: false, error: '未在选区内识别到文字' }
            }

            return { success: true, data: lines }
        } catch (error) {
            console.error('[OcrService] Tesseract error:', error)
            return { success: false, error: (error as Error).message }
        } finally {
            try { if (existsSync(tmpFile)) unlinkSync(tmpFile) } catch (e) { }
        }
    }
}

export const ocrService = new OcrService()
