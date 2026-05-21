const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadLocalProxyServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'LocalProxyService.ts')
  const transpile = (sourcePath) => ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    },
    fileName: sourcePath
  }).outputText

  const module = { exports: {} }
  const execPowerShellEncoded = overrides.execPowerShellEncoded || (async () => 'ok')
  const execCommand = overrides.execCommand || (async () => '')
  const connectToPort = overrides.connectToPort || (async () => false)
  const processEnv = overrides.processEnv || {}
  const spawn = overrides.spawn || (() => ({ unref() {} }))
  const logger = overrides.logger || {
    error() {},
    warn() {}
  }

  const loadSharedProxyDoctor = () => {
    const sharedPath = path.resolve(__dirname, '../../shared/proxyDoctor.ts')
    const sharedModule = { exports: {} }
    vm.runInNewContext(transpile(sharedPath), {
      module: sharedModule,
      exports: sharedModule.exports,
      require,
      __dirname: path.dirname(sharedPath),
      __filename: sharedPath,
      console,
      process,
      URL,
      Buffer,
      setTimeout,
      clearTimeout
    }, { filename: sharedPath })
    return sharedModule.exports
  }

  const customRequire = (specifier) => {
    if (specifier === '../utils/processUtils') {
      return { execPowerShellEncoded, execCommand }
    }

    if (specifier === 'net') {
      return require(specifier)
    }

    if (specifier === 'child_process') {
      return { spawn }
    }

    if (specifier === '../utils/logger') {
      return { logger }
    }

    if (specifier === '../../shared/types') {
      return {}
    }

    if (specifier === '../../shared/proxyDoctor') {
      return loadSharedProxyDoctor()
    }

    return require(specifier)
  }

  vm.runInNewContext(transpile(filePath), {
    module,
    exports: module.exports,
    require: customRequire,
    __dirname,
    __filename: filePath,
    console,
    process: { ...process, env: processEnv },
    URL,
    Buffer,
    setTimeout,
    clearTimeout
  }, { filename: filePath })

  return module.exports
}

test('setConfig returns a failure when the proxy apply script resolves empty output', async () => {
  const { LocalProxyService } = loadLocalProxyServiceModule({
    execPowerShellEncoded: async () => ''
  })
  const service = new LocalProxyService()
  service.getStatus = async () => ({ success: true, data: { enabled: true } })

  const result = await service.setConfig({
    host: '127.0.0.1',
    port: 7890,
    protocol: 'http',
    bypass: []
  })

  assert.equal(result.success, false)
  assert.match(result.error, /代理设置应用失败/)
})

test('doctorScan returns layered Windows proxy diagnostics', async () => {
  const commands = []
  const winInetJson = {
    enabled: true,
    server: 'http=127.0.0.1:7897;https=127.0.0.1:7897',
    override: 'localhost;127.*',
    autoConfigUrl: null
  }
  const envJson = {
    HTTP_PROXY: 'http://127.0.0.1:7897',
    HTTPS_PROXY: 'http://127.0.0.1:7897',
    ALL_PROXY: 'http://127.0.0.1:7897',
    http_proxy: 'http://127.0.0.1:7897',
    https_proxy: 'http://127.0.0.1:7897',
    all_proxy: 'http://127.0.0.1:7897',
    NO_PROXY: 'localhost,127.0.0.1,::1',
    no_proxy: 'localhost,127.0.0.1,::1'
  }
  const deps = {
    execPowerShellEncoded: async (script) => {
      if (script.includes('LOCAL_PROXY_ENV_JSON_START')) {
        return `---LOCAL_PROXY_ENV_JSON_START---\n${JSON.stringify(envJson)}\n---LOCAL_PROXY_ENV_JSON_END---`
      }

      return `---LOCAL_PROXY_JSON_START---\n${JSON.stringify(winInetJson)}\n---LOCAL_PROXY_JSON_END---`
    },
    execCommand: async (command) => {
      commands.push(command)
      const outputs = {
        'netsh winhttp show proxy': 'Proxy Server(s) :  http=127.0.0.1:7897;https=127.0.0.1:7897\r\nBypass List     :  localhost;127.*',
        'git config --global --get http.proxy': 'http://127.0.0.1:7897',
        'git config --global --get https.proxy': 'http://127.0.0.1:7897',
        'npm config get proxy': 'http://127.0.0.1:7897',
        'npm config get https-proxy': 'http://127.0.0.1:7897'
      }
      return outputs[command] || ''
    },
    connectToPort: async () => true,
    processEnv: {
      HTTP_PROXY: 'http://127.0.0.1:7897',
      HTTPS_PROXY: 'http://127.0.0.1:7897'
    }
  }
  const { LocalProxyService } = loadLocalProxyServiceModule()
  const service = new LocalProxyService(deps)

  const result = await service.doctorScan('7897')

  assert.equal(result.success, true)
  assert.equal(result.data.summary, 'unified')
  assert.equal(result.data.portOpen, true)
  for (const id of ['wininet', 'winhttp', 'env', 'git', 'npm']) {
    assert.equal(result.data.layers.find((layer) => layer.id === id).state, 'ok')
  }
  assert.match(result.data.reportText, /OneTool 代理医生诊断报告/)
  assert.equal(commands.includes('netsh winhttp show proxy'), true)
})

test('doctorScan marks Git and npm as unavailable when command output indicates missing tools', async () => {
  const winInetJson = {
    enabled: false,
    server: '',
    override: '',
    autoConfigUrl: null
  }

  const deps = {
    execPowerShellEncoded: async (script) => {
      if (script.includes('LOCAL_PROXY_ENV_JSON_START')) {
        return '---LOCAL_PROXY_ENV_JSON_START---\n{}\n---LOCAL_PROXY_ENV_JSON_END---'
      }

      return `---LOCAL_PROXY_JSON_START---\n${JSON.stringify(winInetJson)}\n---LOCAL_PROXY_JSON_END---`
    },
    execCommand: async (command) => {
      if (command === 'netsh winhttp show proxy') {
        return 'Direct access (no proxy server).'
      }

      if (command.startsWith('git config')) {
        throw new Error('git not found')
      }

      if (command.startsWith('npm config')) {
        throw new Error('npm not found')
      }

      return ''
    },
    connectToPort: async () => false,
    processEnv: {}
  }
  const { LocalProxyService } = loadLocalProxyServiceModule()
  const service = new LocalProxyService(deps)

  const result = await service.doctorScan('7897')

  assert.equal(result.success, true)
  assert.equal(result.data.summary, 'off')
  assert.equal(result.data.layers.find((layer) => layer.id === 'git').state, 'unavailable')
  assert.equal(result.data.layers.find((layer) => layer.id === 'npm').state, 'unavailable')
})

test('doctorScan reports stale Git value when paired key is missing', async () => {
  const winInetJson = {
    enabled: false,
    server: '',
    override: '',
    autoConfigUrl: null
  }

  const deps = {
    execPowerShellEncoded: async (script) => {
      if (script.includes('LOCAL_PROXY_ENV_JSON_START')) {
        return '---LOCAL_PROXY_ENV_JSON_START---\n{}\n---LOCAL_PROXY_ENV_JSON_END---'
      }

      return `---LOCAL_PROXY_JSON_START---\n${JSON.stringify(winInetJson)}\n---LOCAL_PROXY_JSON_END---`
    },
    execCommand: async (command) => {
      if (command === 'netsh winhttp show proxy') {
        return 'Direct access (no proxy server).'
      }

      if (command === 'git config --global --get http.proxy') {
        return 'http://127.0.0.1:1080'
      }

      if (command === 'git config --global --get https.proxy') {
        throw new Error('missing git https.proxy')
      }

      if (command.startsWith('npm config')) {
        throw new Error('npm not found')
      }

      return ''
    },
    connectToPort: async () => false,
    processEnv: {}
  }
  const { LocalProxyService } = loadLocalProxyServiceModule()
  const service = new LocalProxyService(deps)

  const result = await service.doctorScan('7897')
  const gitLayer = result.data.layers.find((layer) => layer.id === 'git')

  assert.equal(result.success, true)
  assert.equal(gitLayer.state, 'conflict')
  assert.match(gitLayer.currentValue, /http\.proxy=http:\/\/127\.0\.0\.1:1080/)
})

test('doctorScan accepts Windows fallback proxy server syntax', async () => {
  const winInetJson = {
    enabled: true,
    server: '127.0.0.1:7897',
    override: '',
    autoConfigUrl: null
  }
  const envJson = {
    HTTP_PROXY: 'http://127.0.0.1:7897',
    HTTPS_PROXY: 'http://127.0.0.1:7897'
  }

  const deps = {
    execPowerShellEncoded: async (script) => {
      if (script.includes('LOCAL_PROXY_ENV_JSON_START')) {
        return `---LOCAL_PROXY_ENV_JSON_START---\n${JSON.stringify(envJson)}\n---LOCAL_PROXY_ENV_JSON_END---`
      }

      return `---LOCAL_PROXY_JSON_START---\n${JSON.stringify(winInetJson)}\n---LOCAL_PROXY_JSON_END---`
    },
    execCommand: async (command) => {
      const outputs = {
        'netsh winhttp show proxy': 'Proxy Server(s) :  127.0.0.1:7897\r\nBypass List     :',
        'git config --global --get http.proxy': 'http://127.0.0.1:7897',
        'git config --global --get https.proxy': 'http://127.0.0.1:7897',
        'npm config get proxy': 'http://127.0.0.1:7897',
        'npm config get https-proxy': 'http://127.0.0.1:7897'
      }
      return outputs[command] || ''
    },
    connectToPort: async () => true,
    processEnv: {}
  }
  const { LocalProxyService } = loadLocalProxyServiceModule()
  const service = new LocalProxyService(deps)

  const result = await service.doctorScan('7897')

  assert.equal(result.success, true)
  assert.equal(result.data.layers.find((layer) => layer.id === 'wininet').state, 'ok')
  assert.equal(result.data.layers.find((layer) => layer.id === 'winhttp').state, 'ok')
})

test('doctorApplyAll writes every managed proxy layer', async () => {
  const powershellScripts = []
  const commands = []
  const targetServer = 'http=127.0.0.1:7897;https=127.0.0.1:7897'
  const targetEnvValue = 'http://127.0.0.1:7897'
  const winInetJson = {
    enabled: true,
    server: targetServer,
    override: 'localhost;127.*',
    autoConfigUrl: null
  }
  const envJson = {
    HTTP_PROXY: targetEnvValue,
    HTTPS_PROXY: targetEnvValue,
    ALL_PROXY: targetEnvValue,
    http_proxy: targetEnvValue,
    https_proxy: targetEnvValue,
    all_proxy: targetEnvValue
  }
  const deps = {
    execPowerShellEncoded: async (script) => {
      powershellScripts.push(script)
      if (script.includes('Get-ItemProperty')) {
        return `---LOCAL_PROXY_JSON_START---\n${JSON.stringify(winInetJson)}\n---LOCAL_PROXY_JSON_END---`
      }

      if (script.includes('GetEnvironmentVariable')) {
        return `---LOCAL_PROXY_ENV_JSON_START---\n${JSON.stringify(envJson)}\n---LOCAL_PROXY_ENV_JSON_END---`
      }

      return 'ok'
    },
    execCommand: async (command) => {
      commands.push(command)
      if (command === 'netsh winhttp show proxy') {
        return `Proxy Server(s) :  ${targetServer}\r\nBypass List     :  localhost;127.*`
      }

      if (command.includes('--get') || command.includes('get proxy') || command.includes('get https-proxy')) {
        return targetEnvValue
      }

      return 'ok'
    },
    connectToPort: async () => true,
    processEnv: {}
  }
  const { LocalProxyService } = loadLocalProxyServiceModule()
  const service = new LocalProxyService(deps)

  const result = await service.doctorApplyAll({ target: '7897', bypass: ['localhost', '127.*'] })

  assert.equal(result.success, true)
  assert.equal(
    powershellScripts.some((script) => script.includes('Set-ItemProperty') && script.includes('ProxyEnable -Value 1')),
    true
  )
  assert.equal(
    powershellScripts.some((script) => script.includes("SetEnvironmentVariable('HTTP_PROXY', 'http://127.0.0.1:7897', 'User')")),
    true
  )
  assert.equal(
    commands.includes('netsh winhttp set proxy proxy-server="http=127.0.0.1:7897;https=127.0.0.1:7897" bypass-list="localhost;127.*"'),
    true
  )
  assert.equal(commands.includes('git config --global http.proxy http://127.0.0.1:7897'), true)
  assert.equal(commands.includes('npm config set proxy http://127.0.0.1:7897'), true)
})

test('doctorClearLayer clears only the selected layer', async () => {
  const commands = []
  const deps = {
    execPowerShellEncoded: async () => 'ok',
    execCommand: async (command) => {
      commands.push(command)
      return 'ok'
    },
    connectToPort: async () => false,
    processEnv: {}
  }
  const { LocalProxyService } = loadLocalProxyServiceModule()
  const service = new LocalProxyService(deps)

  const result = await service.doctorClearLayer('git')

  assert.equal(result.success, true)
  assert.deepEqual(commands, [
    'git config --global --unset http.proxy',
    'git config --global --unset https.proxy'
  ])
})

test('doctorFixLayer returns failure when Git apply command returns failure text', async () => {
  const commands = []
  const deps = {
    execCommand: async (command) => {
      commands.push(command)
      if (command === 'git config --global http.proxy http://127.0.0.1:7897') {
        return "'git' is not recognized as an internal or external command"
      }

      return 'ok'
    },
    processEnv: {}
  }
  const { LocalProxyService } = loadLocalProxyServiceModule()
  const service = new LocalProxyService(deps)

  const result = await service.doctorFixLayer('git', '7897')

  assert.equal(result.success, false)
  assert.match(result.error, /not recognized/)
  assert.deepEqual(commands, ['git config --global http.proxy http://127.0.0.1:7897'])
})

test('doctorClearLayer treats absent Git proxy keys as already clear', async () => {
  const commands = []
  const deps = {
    execCommand: async (command) => {
      commands.push(command)
      const absentKeyError = new Error(`Command failed: ${command}\n`)
      absentKeyError.code = 5
      absentKeyError.cmd = command
      throw absentKeyError
    },
    processEnv: {}
  }
  const { LocalProxyService } = loadLocalProxyServiceModule()
  const service = new LocalProxyService(deps)

  const result = await service.doctorClearLayer('git')

  assert.equal(result.success, true)
  assert.deepEqual(commands, [
    'git config --global --unset http.proxy',
    'git config --global --unset https.proxy'
  ])
})

test('doctorFixLayer rejects unsafe WinHTTP bypass entries before running netsh set proxy', async () => {
  const commands = []
  const deps = {
    execCommand: async (command) => {
      commands.push(command)
      return 'ok'
    },
    processEnv: {}
  }
  const { LocalProxyService } = loadLocalProxyServiceModule()
  const service = new LocalProxyService(deps)

  const result = await service.doctorFixLayer('winhttp', '7897', ['local"host'])

  assert.equal(result.success, false)
  assert.match(result.error, /bypass/i)
  assert.equal(commands.some((command) => command.startsWith('netsh winhttp set proxy')), false)
})

test('doctorFixLayer allows the Windows local WinHTTP bypass token', async () => {
  const commands = []
  const deps = {
    execCommand: async (command) => {
      commands.push(command)
      return 'ok'
    },
    processEnv: {}
  }
  const { LocalProxyService } = loadLocalProxyServiceModule()
  const service = new LocalProxyService(deps)

  const result = await service.doctorFixLayer('winhttp', '7897', ['<local>'])

  assert.equal(result.success, true)
  assert.equal(
    commands.includes('netsh winhttp set proxy proxy-server="http=127.0.0.1:7897;https=127.0.0.1:7897" bypass-list="<local>"'),
    true
  )
})

test('doctorApplyAll rejects unsafe bypass before enabling WinINET', async () => {
  const powershellScripts = []
  const commands = []
  const winInetJson = {
    enabled: false,
    server: '',
    override: '',
    autoConfigUrl: null
  }
  const deps = {
    execPowerShellEncoded: async (script) => {
      powershellScripts.push(script)
      if (script.includes('Get-ItemProperty')) {
        return `---LOCAL_PROXY_JSON_START---\n${JSON.stringify(winInetJson)}\n---LOCAL_PROXY_JSON_END---`
      }

      return 'ok'
    },
    execCommand: async (command) => {
      commands.push(command)
      return 'ok'
    },
    connectToPort: async () => false,
    processEnv: {}
  }
  const { LocalProxyService } = loadLocalProxyServiceModule()
  const service = new LocalProxyService(deps)

  const result = await service.doctorApplyAll({ target: '7897', bypass: ['local"host'] })

  assert.equal(result.success, false)
  assert.match(result.error, /bypass/i)
  assert.equal(
    powershellScripts.some((script) => script.includes('Set-ItemProperty') && script.includes('ProxyEnable -Value 1')),
    false
  )
  assert.equal(commands.some((command) => command.startsWith('netsh winhttp set proxy')), false)
})

test('disable returns a failure when the proxy disable script resolves empty output', async () => {
  const { LocalProxyService } = loadLocalProxyServiceModule({
    execPowerShellEncoded: async () => ''
  })
  const service = new LocalProxyService()
  service.getStatus = async () => ({ success: true, data: { enabled: false } })

  const result = await service.disable()

  assert.equal(result.success, false)
  assert.match(result.error, /代理设置应用失败/)
})
