const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadLlmServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'LlmService.ts')
  const source = fs.readFileSync(filePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    },
    fileName: filePath
  }).outputText

  const module = { exports: {} }
  const fetchCalls = []
  const fetchImpl = overrides.fetchImpl || (async (...args) => {
    fetchCalls.push(args)
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({ ok: true })
              }
            }
          ]
        }
      }
    }
  })

  const customRequire = (specifier) => {
    if (specifier === './SettingsService') {
      return {
        settingsService: overrides.settingsService || {
          getSettings() {
            return {
              translateApiUrl: 'https://api.openai.com/v1',
              translateApiKey: 'sk-test',
              translateModel: 'gpt-4o-mini'
            }
          }
        }
      }
    }

    if (specifier === './OcrService') {
      return {
        ocrService: overrides.ocrService || {
          async recognize() {
            return {
              success: true,
              data: [{ index: 0, text: 'Hello world' }]
            }
          }
        }
      }
    }

    if (specifier === './OpenAiCompatibleClient') {
      return {
        OpenAiCompatibleClient: class OpenAiCompatibleClient {
          constructor(dependencies = {}) {
            this.fetchImpl = dependencies.fetch || (async (...args) => {
              fetchCalls.push(args)
              return fetchImpl(...args)
            })
          }

          async createJsonCompletion({ apiUrl, apiKey, model, systemPrompt, userPrompt }) {
            const response = await this.fetchImpl(`${apiUrl.replace(/\/$/, '')}/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
              },
              body: JSON.stringify({
                model,
                response_format: { type: 'json_object' },
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt }
                ]
              })
            })
            const payload = await response.json()
            return JSON.parse(payload.choices[0].message.content)
          }
        }
      }
    }

    if (specifier === './llmAdapters/ScreenshotInsightAdapter') {
      return {
        ScreenshotInsightAdapter: overrides.ScreenshotInsightAdapter || class ScreenshotInsightAdapter {
          buildTranslationCompletion(ocrLines) {
            return {
              systemPrompt: [
                '你是一个专业的屏幕翻译专家。',
                '输入是带 [index] 标号的 OCR 行文本。',
                '如果原文是中文则翻成英文，否则翻成中文。',
                '保持与输入相同的行数和顺序。',
                '只返回 JSON：{"lines":[{"index":0,"translatedText":"..." }]}。'
              ].join('\n'),
              userPrompt: ocrLines.map((line) => `[${line.index}] ${line.text}`).join('\n')
            }
          }

          mapTranslationResults(ocrLines, payload, fallbackText) {
            const translatedLines = Array.isArray(payload.lines) ? payload.lines : []
            return ocrLines.map((line) => {
              const matched = translatedLines.find((item) => item?.index === line.index)
              return {
                ...line,
                translatedText: typeof matched?.translatedText === 'string' && matched.translatedText.trim()
                  ? matched.translatedText.trim()
                  : fallbackText
              }
            })
          }
        }
      }
    }

    if (specifier === './llmAdapters/RenameSuggestionAdapter') {
      return {
        RenameSuggestionAdapter: overrides.RenameSuggestionAdapter || class RenameSuggestionAdapter {
          buildCompletion(input) {
            return {
              systemPrompt: [
                '你是文件批量重命名助手。',
                '根据用户目标，为每个文件生成清晰、一致、可落地的新文件名。',
                '不要返回路径，只返回文件名。',
                '只返回 JSON：{"summary":"","namingPattern":"","warnings":[],"suggestions":[{"index":0,"newName":"","reason":""}]}'
              ].join('\n'),
              userPrompt: [
                `用户要求：${input.instructions}`,
                '[文件列表]',
                ...input.files.map((file, index) => `${index}. ${file.name} (${file.size} B)`)
              ].join('\n')
            }
          }

          mapSuggestionResult(input, payload) {
            const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : []
            return {
              summary: payload.summary || '已生成一组建议命名',
              namingPattern: payload.namingPattern || '统一命名',
              warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
              suggestions: input.files.map((file, index) => {
                const matched = suggestions.find((item) => item?.index === index)
                const extension = path.extname(file.name)
                const suggestedName = matched?.newName || file.name
                const newName = path.extname(suggestedName) || !extension
                  ? suggestedName
                  : `${suggestedName}${extension}`
                return {
                  index,
                  oldName: file.name,
                  newName,
                  reason: typeof matched?.reason === 'string' ? matched.reason.trim() : null
                }
              })
            }
          }
        }
      }
    }

    if (specifier === './llmAdapters/SystemDiagnosisAdapter') {
      return {
        SystemDiagnosisAdapter: overrides.SystemDiagnosisAdapter || class SystemDiagnosisAdapter {
          buildCompletion(input) {
            const doctorLines = Object.entries(input.doctorReport ?? {})
              .map(([key, value]) => `${key}: ${value.ok ? 'OK' : 'FAIL'}`)
              .join('\n')
            return {
              systemPrompt: [
                '你是 Windows 工具箱的硬件与环境诊断助手。',
                '只根据给定快照和依赖自检结果给建议，不要编造不存在的信息。',
                '优先输出可执行建议，避免泛泛而谈。',
                '只返回 JSON：{"summary":"","bullets":[],"warnings":[],"actions":[]}'
              ].join('\n'),
              userPrompt: [
                `设备型号: ${input.config.deviceModel}`,
                doctorLines ? `[依赖自检]\n${doctorLines}` : ''
              ].filter(Boolean).join('\n')
            }
          }

          mapInsightResult(payload) {
            return {
              summary: payload.summary || '当前设备整体状态可用',
              bullets: Array.isArray(payload.bullets) ? payload.bullets : [],
              warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
              actions: Array.isArray(payload.actions) ? payload.actions : []
            }
          }
        }
      }
    }

    if (specifier === './llmAdapters/SpaceCleanupAdapter') {
      return {
        SpaceCleanupAdapter: overrides.SpaceCleanupAdapter || class SpaceCleanupAdapter {
          buildCompletion(input) {
            return {
              systemPrompt: [
                '你是磁盘空间清理助手。',
                '目标是给出低风险、可执行的清理建议。',
                '默认先建议可回收、可迁移、可归档的内容，不要建议直接删除系统文件。',
                '只返回 JSON：{"summary":"","bullets":[],"warnings":[],"actions":[]}'
              ].join('\n'),
              userPrompt: [
                `扫描根目录：${input.rootPath}`,
                `总占用：${input.summary.totalBytes} B`
              ].join('\n')
            }
          }

          mapInsightResult(payload) {
            return {
              summary: payload.summary || '已生成当前目录的清理建议',
              bullets: Array.isArray(payload.bullets) ? payload.bullets : [],
              warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
              actions: Array.isArray(payload.actions) ? payload.actions : []
            }
          }
        }
      }
    }

    if (specifier === './llmAdapters/CalendarAssistantAdapter') {
      return {
        CalendarAssistantAdapter: overrides.CalendarAssistantAdapter || class CalendarAssistantAdapter {
          buildCompletion(input) {
            return {
              systemPrompt: [
                '你是自然语言日历意图解析器。',
                '只返回 JSON：{"action":"create|filter|help","message":"","event":{}}'
              ].join('\n'),
              userPrompt: `用户输入：${input.message}`
            }
          }

          mapAssistantResult(_input, payload) {
            return {
              type: 'create',
              message: payload.message || '已创建日程',
              event: {
                title: payload.event?.title || '方案会',
                date: payload.event?.date || '2025-07-24',
                start: payload.event?.start || '15:00',
                end: payload.event?.end || '16:00',
                calendar: payload.event?.calendar || '工作',
                color: '#38b887',
                location: payload.event?.location || '',
                participants: payload.event?.participants || '',
                description: payload.event?.description || ''
              }
            }
          }
        }
      }
    }

    if (specifier === '../../shared/types' || specifier === '../../shared/llm') {
      return {}
    }

    return require(specifier)
  }

  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require: customRequire,
    __dirname,
    __filename: filePath,
    console,
    process,
    Buffer,
    setTimeout,
    clearTimeout,
    fetch: async (...args) => {
      fetchCalls.push(args)
      return fetchImpl(...args)
    }
  }, { filename: filePath })

  return {
    ...module.exports,
    fetchCalls
  }
}

test('getConfigStatus reports missing global llm fields', () => {
  const { LlmService } = loadLlmServiceModule({
    settingsService: {
      getSettings() {
        return {
          translateApiUrl: '',
          translateApiKey: '',
          translateModel: ''
        }
      }
    }
  })

  const service = new LlmService()
  const result = service.getConfigStatus()

  assert.equal(result.success, true)
  assert.equal(result.data.configured, false)
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.missing)), ['baseUrl', 'apiKey', 'model'])
})

test('translateImage uses the shared llm config and maps translated OCR lines', async () => {
  const { LlmService, fetchCalls } = loadLlmServiceModule({
    ocrService: {
      async recognize() {
        return {
          success: true,
          data: [
            { index: 0, text: 'Hello' },
            { index: 1, text: 'World' }
          ]
        }
      }
    },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  lines: [
                    { index: 0, translatedText: '你好' },
                    { index: 1, translatedText: '世界' }
                  ]
                })
              }
            }
          ]
        }
      }
    })
  })

  const service = new LlmService()
  const result = await service.translateImage('data:image/png;base64,abc')

  assert.equal(result.success, true)
  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0][0], 'https://api.openai.com/v1/chat/completions')
  assert.deepEqual(result.data.map((line) => line.translatedText), ['你好', '世界'])
})

test('translateImage returns OCR text directly without hitting the llm when mode is ocr', async () => {
  const { LlmService, fetchCalls } = loadLlmServiceModule({
    ocrService: {
      async recognize() {
        return {
          success: true,
          data: [
            { index: 0, text: 'Hello', x: 10, y: 20, width: 40, height: 18 },
            { index: 1, text: 'World', x: 10, y: 50, width: 50, height: 18 }
          ]
        }
      }
    }
  })

  const service = new LlmService()
  const result = await service.translateImage('data:image/png;base64,abc', 'ocr')

  assert.equal(result.success, true)
  assert.equal(fetchCalls.length, 0)
  assert.deepEqual(normalize(result.data), [
    { index: 0, text: 'Hello', x: 10, y: 20, width: 40, height: 18, translatedText: null },
    { index: 1, text: 'World', x: 10, y: 50, width: 50, height: 18, translatedText: null }
  ])
})

test('suggestRename normalizes llm suggestions back onto the input file extensions', async () => {
  const { LlmService } = loadLlmServiceModule({
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: '按项目和顺序重命名',
                  namingPattern: 'project-001.ext',
                  warnings: [],
                  suggestions: [
                    { index: 0, newName: 'project-001' },
                    { index: 1, newName: 'project-002.md' }
                  ]
                })
              }
            }
          ]
        }
      }
    })
  })

  const service = new LlmService()
  const result = await service.suggestRename({
    instructions: '按项目整理并统一命名',
    files: [
      { name: 'draft.txt', path: 'D:/docs/draft.txt', size: 120 },
      { name: 'notes.md', path: 'D:/docs/notes.md', size: 220 }
    ]
  })

  assert.equal(result.success, true)
  assert.equal(result.data.summary, '按项目和顺序重命名')
  assert.deepEqual(result.data.suggestions.map((item) => item.newName), ['project-001.txt', 'project-002.md'])
})

test('suggestSpaceCleanup delegates prompt construction to the space cleanup adapter', async () => {
  const adapterCalls = []
  const { LlmService } = loadLlmServiceModule({
    SpaceCleanupAdapter: class SpaceCleanupAdapter {
      buildCompletion(input) {
        adapterCalls.push(input)
        return {
          systemPrompt: 'space-system',
          userPrompt: 'space-user'
        }
      }

      mapInsightResult(payload) {
        return {
          summary: payload.summary || 'space-summary',
          bullets: [],
          warnings: [],
          actions: []
        }
      }
    },
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body)
      assert.deepEqual(body.messages, [
        { role: 'system', content: 'space-system' },
        { role: 'user', content: 'space-user' }
      ])
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({ summary: '已生成建议' })
                }
              }
            ]
          }
        }
      }
    }
  })

  const service = new LlmService()
  const input = {
    rootPath: 'D:/downloads',
    summary: {
      totalBytes: 2048,
      scannedFiles: 8,
      scannedDirectories: 3,
      skippedEntries: 1
    },
    largestFiles: []
  }

  const result = await service.suggestSpaceCleanup(input)

  assert.equal(result.success, true)
  assert.equal(adapterCalls.length, 1)
  assert.deepEqual(adapterCalls[0], input)
  assert.equal(result.data.summary, '已生成建议')
})

test('parseCalendarAssistant delegates natural language parsing to the shared llm client', async () => {
  const adapterCalls = []
  const { LlmService } = loadLlmServiceModule({
    CalendarAssistantAdapter: class CalendarAssistantAdapter {
      buildCompletion(input) {
        adapterCalls.push(input)
        return {
          systemPrompt: 'calendar-system',
          userPrompt: 'calendar-user'
        }
      }

      mapAssistantResult(input, payload) {
        return {
          type: 'create',
          message: payload.message,
          event: {
            title: payload.event.title,
            date: payload.event.date,
            start: payload.event.start,
            end: payload.event.end,
            calendar: payload.event.calendar,
            color: '#38b887',
            location: payload.event.location,
            participants: payload.event.participants,
            description: `source:${input.message}`
          }
        }
      }
    },
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body)
      assert.deepEqual(body.messages, [
        { role: 'system', content: 'calendar-system' },
        { role: 'user', content: 'calendar-user' }
      ])
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    action: 'create',
                    message: '已创建方案会',
                    event: {
                      title: '方案会',
                      date: '2025-07-24',
                      start: '15:00',
                      end: '16:00',
                      calendar: '工作',
                      location: '湖景会议室',
                      participants: '林澈'
                    }
                  })
                }
              }
            ]
          }
        }
      }
    }
  })

  const service = new LlmService()
  const input = {
    message: '明天下午三点和林澈开方案会，地点湖景会议室',
    context: {
      selectedDate: '2025-07-23',
      today: '2025-07-23',
      events: []
    }
  }

  const result = await service.parseCalendarAssistant(input)

  assert.equal(result.success, true)
  assert.deepEqual(adapterCalls, [input])
  assert.equal(result.data.type, 'create')
  assert.equal(result.data.event.title, '方案会')
  assert.equal(result.data.event.description, 'source:明天下午三点和林澈开方案会，地点湖景会议室')
})

function normalize(value) {
  return JSON.parse(JSON.stringify(value))
}
