import { IpcResponse } from '../../shared/types'
import { settingsService } from './SettingsService'
import { ocrService, OcrLine } from './OcrService'

export interface TranslatedLine extends OcrLine {
    translatedText: string
}

export class TranslateService {
    constructor() { }

    async translateImage(base64Image: string): Promise<IpcResponse<TranslatedLine[]>> {
        try {
            const ocrRes = await ocrService.recognize(base64Image)
            if (!ocrRes.success || !ocrRes.data || ocrRes.data.length === 0) {
                return { success: false, error: ocrRes.error || '未识别到有效文字' }
            }

            const ocrLines = ocrRes.data
            const settings = settingsService.getSettings()
            const apiUrl = settings.translateApiUrl || 'https://api.openai.com/v1'
            const apiKey = settings.translateApiKey
            const model = settings.translateModel || 'gpt-4o'

            if (!apiKey) return { success: false, error: '请先在设置中配置大模型 API Key' }

            const linesText = ocrLines.map((l) => `[${l.index}] ${l.text}`).join('\n')

            const prompt = `你是一个专业的屏幕翻译专家。
任务要求：
1. 接收到的文本是多行 OCR 识别结果，每行前有编号 [n]。
2. 请对每一行内容进行语境校对并翻译成中文（如果是中文则译为英文）。
3. 保持翻译结果的行数与输入完全一致。
4. 必须仅返回指定 JSON 格式，不含任何 Markdown 标签或说明。

JSON 格式要求（必须是对象，不能是顶层数组）：
{
  "lines": [
    {"index": 0, "translatedText": "第一行的译文"},
    {"index": 1, "translatedText": "第二行的译文"}
  ]
}`

            const response = await fetch(`${apiUrl.replace(/\/$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: prompt },
                        { role: 'user', content: linesText }
                    ],
                    response_format: { type: 'json_object' }
                })
            })

            if (!response.ok) {
                let errorMsg = `API 请求失败 (${response.status})`
                try { const e = await response.json(); errorMsg = e.error?.message || errorMsg } catch (e) { }
                throw new Error(errorMsg)
            }

            const data = await response.json()
            const content = data.choices?.[0]?.message?.content
            if (!content) throw new Error('API 返回内容为空')

            let translatedLines: any[] = []
            try {
                const parsed = JSON.parse(content)
                translatedLines = parsed.lines || parsed.results || parsed.translations ||
                    (Array.isArray(parsed) ? parsed : Object.values(parsed)[0])
            } catch (e) {
                throw new Error('翻译结果解析失败: ' + content.substring(0, 50))
            }

            const result: TranslatedLine[] = ocrLines.map((line) => {
                const t = translatedLines.find((t: any) => t.index === line.index) || translatedLines[line.index]
                return { ...line, translatedText: t?.translatedText || '翻译失败' }
            })

            return { success: true, data: result }
        } catch (error) {
            console.error('TranslateService Error:', error)
            return { success: false, error: (error as Error).message }
        }
    }
}

export const translateService = new TranslateService()
