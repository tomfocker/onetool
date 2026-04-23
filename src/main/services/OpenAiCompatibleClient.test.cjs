const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadClientModule(overrides = {}) {
  const filePath = path.join(__dirname, 'OpenAiCompatibleClient.ts')
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
  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require,
    __dirname,
    __filename: filePath,
    console,
    process,
    Buffer,
    setTimeout,
    clearTimeout,
    fetch: overrides.fetchImpl || fetch
  }, { filename: filePath })

  return module.exports
}

test('createJsonCompletion posts an OpenAI-compatible chat completion request', async () => {
  const fetchCalls = []
  const { OpenAiCompatibleClient } = loadClientModule({
    fetchImpl: async (...args) => {
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
    }
  })

  const client = new OpenAiCompatibleClient()
  const result = await client.createJsonCompletion({
    apiUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
    systemPrompt: 'system',
    userPrompt: 'user'
  })

  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true })
  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0][0], 'https://api.openai.com/v1/chat/completions')
  assert.deepEqual(JSON.parse(fetchCalls[0][1].body), {
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'user' }
    ]
  })
})
