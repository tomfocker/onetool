import { IpcResponse } from '../../shared/types'
import { settingsService } from './SettingsService'

export interface TranslationResult {
    originalText: string
    translatedText: string
}

export class TranslateService {
    constructor() { }

    async translateImage(base64Image: string): Promise<IpcResponse<TranslationResult>> {
        try {
            const settings = settingsService.getSettings()

            const apiUrl = settings.translateApiUrl || 'https://api.openai.com/v1'
            const apiKey = settings.translateApiKey
            const model = settings.translateModel || 'gpt-4o'

            if (!apiKey) {
                return { success: false, error: '请先在设置中配置大模型 API Key' }
            }

            // 为了确保兼容包含 data:image 前缀或不包含的数据格式
            const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image

            const prompt = `你是一个精准的翻译和 OCR 助手。
请识别图片中的文本。如果文本是外语，请将其翻译为中文；如果是中文，则翻译为英文。
请严格仅返回 JSON 格式结果，不要有任何额外的文字内容、代码块或 Markdown 标记。格式如下：
{
  "originalText": "识别出的原文内容",
  "translatedText": "翻译后的文字内容"
}`

            const response = await fetch(`${apiUrl.replace(/\/$/, '')}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: prompt },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:image/jpeg;base64,${base64Data}`
                                    }
                                }
                            ]
                        }
                    ],
                    response_format: { type: "json_object" }
                })
            })

            if (!response.ok) {
                const errorData = await response.text()
                console.error('TranslateService API Error:', errorData)
                throw new Error(`API Request failed with status ${response.status}`)
            }

            const data = await response.json()
            const content = data.choices?.[0]?.message?.content

            if (!content) {
                throw new Error('Invalid translation response')
            }

            const result = JSON.parse(content) as TranslationResult
            return { success: true, data: result }
        } catch (error) {
            console.error('TranslateService Error:', error)
            return { success: false, error: (error as Error).message }
        }
    }
}

export const translateService = new TranslateService()
