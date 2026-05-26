const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadTroubleshootingServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'TroubleshootingService.ts')
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
  const execPowerShellEncoded = overrides.execPowerShellEncoded || (async () => '')
  const customRequire = (specifier) => {
    if (specifier === '../utils/processUtils') {
      return { execPowerShellEncoded }
    }
    if (specifier === '../utils/logger') {
      return { logger: { info() {}, warn() {}, error() {} } }
    }
    if (specifier === '../../shared/troubleshooting') {
      return require(path.join(__dirname, '../../shared/troubleshooting.ts'))
    }
    if (specifier === '../../shared/types') {
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
    clearTimeout
  }, { filename: filePath })

  return module.exports
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value))
}

test('scanGroupPolicy reports unsupported on non-Windows without invoking PowerShell', async () => {
  let calls = 0
  const { TroubleshootingService } = loadTroubleshootingServiceModule({
    execPowerShellEncoded: async () => {
      calls += 1
      return ''
    }
  })
  const service = new TroubleshootingService({ platform: 'linux' })

  const result = await service.scanGroupPolicy()

  assert.equal(result.success, true)
  assert.equal(calls, 0)
  assert.equal(result.data.available, false)
  assert.match(result.data.reason, /Windows/)
})

test('scanGroupPolicy parses Home edition package availability', async () => {
  const payload = {
    caption: 'Microsoft Windows 11 Home',
    editionId: 'CoreSingleLanguage',
    productName: 'Windows 11 Home Single Language',
    gpeditExists: false,
    clientExtensionPackages: [
      'Microsoft-Windows-GroupPolicy-ClientExtensions-Package~31bf3856ad364e35~amd64~~10.0.22621.1.mum'
    ],
    clientToolsPackages: [
      'Microsoft-Windows-GroupPolicy-ClientTools-Package~31bf3856ad364e35~amd64~~10.0.22621.1.mum'
    ]
  }
  const { TroubleshootingService } = loadTroubleshootingServiceModule({
    execPowerShellEncoded: async () => `---GROUP_POLICY_STATUS_JSON_START---\n${JSON.stringify(payload)}\n---GROUP_POLICY_STATUS_JSON_END---`
  })
  const service = new TroubleshootingService({ platform: 'win32' })

  const result = await service.scanGroupPolicy()

  assert.equal(result.success, true)
  assert.equal(result.data.available, true)
  assert.equal(result.data.isHomeEdition, true)
  assert.equal(result.data.gpeditInstalled, false)
  assert.equal(result.data.packageCount, 2)
  assert.equal(result.data.canInstall, true)
  assert.deepEqual(toPlainObject(result.data.packageNames), [
    payload.clientExtensionPackages[0],
    payload.clientToolsPackages[0]
  ])
})

test('scanGroupPolicy handles already-installed gpedit as no-op', async () => {
  const payload = {
    caption: 'Microsoft Windows 11 Pro',
    editionId: 'Professional',
    productName: 'Windows 11 Pro',
    gpeditExists: true,
    clientExtensionPackages: [],
    clientToolsPackages: []
  }
  const { TroubleshootingService } = loadTroubleshootingServiceModule({
    execPowerShellEncoded: async () => `---GROUP_POLICY_STATUS_JSON_START---${JSON.stringify(payload)}---GROUP_POLICY_STATUS_JSON_END---`
  })
  const service = new TroubleshootingService({ platform: 'win32' })

  const result = await service.scanGroupPolicy()

  assert.equal(result.success, true)
  assert.equal(result.data.gpeditInstalled, true)
  assert.equal(result.data.canInstall, false)
  assert.match(result.data.reason, /已经可用/)
})

test('installGroupPolicy launches an elevated local-package DISM flow', async () => {
  const scripts = []
  const { TroubleshootingService } = loadTroubleshootingServiceModule({
    execPowerShellEncoded: async (script) => {
      scripts.push(script)
      return '---GROUP_POLICY_INSTALL_JSON_START---{"started":true,"exitCode":0,"logPath":"C:\\\\Temp\\\\onetool-gpedit.log","outputTail":"ok"}---GROUP_POLICY_INSTALL_JSON_END---'
    }
  })
  const service = new TroubleshootingService({ platform: 'win32' })

  const result = await service.installGroupPolicy()

  assert.equal(result.success, true)
  assert.equal(result.data.started, true)
  assert.equal(result.data.exitCode, 0)
  assert.match(scripts[0], /Microsoft-Windows-GroupPolicy-ClientExtensions-Package/)
  assert.match(scripts[0], /Microsoft-Windows-GroupPolicy-ClientTools-Package/)
  assert.match(scripts[0], /dism\.exe/)
  assert.match(scripts[0], /-Verb RunAs/)
})

test('installGroupPolicy reports UAC cancellation or malformed elevated output', async () => {
  const { TroubleshootingService } = loadTroubleshootingServiceModule({
    execPowerShellEncoded: async () => 'Start-Process : The operation was canceled by the user.'
  })
  const service = new TroubleshootingService({ platform: 'win32' })

  const result = await service.installGroupPolicy()

  assert.equal(result.success, false)
  assert.match(result.error, /管理员权限|取消|安装结果/)
})

test('normalizePrinterShareDiagnosis points stopped spooler and queued files at the client', () => {
  const { normalizePrinterShareDiagnosis } = loadTroubleshootingServiceModule()

  const diagnosis = normalizePrinterShareDiagnosis({
    targetHost: '192.168.6.7',
    printerName: 'HP LaserJet',
    spoolerStatus: 'Stopped',
    queueFileCount: 4,
    pingReachable: true,
    smbPortOpen: true,
    rpcPortOpen: true,
    uncAccessible: true,
    existingConnections: [],
    rpcUseNamedPipeProtocol: null,
    rpcAuthnLevelPrivacyEnabled: null,
    smb1ClientState: 'Disabled'
  }, { platform: 'win32' })

  assert.equal(diagnosis.summary.owner, 'client')
  assert.match(diagnosis.summary.title, /客户端/)
  assert.ok(diagnosis.recommendedActions.includes('restart-client-spooler'))
  assert.ok(diagnosis.recommendedActions.includes('clear-client-print-queue'))
  assert.equal(diagnosis.checks.find((check) => check.id === 'client-spooler').status, 'error')
})

test('normalizePrinterShareDiagnosis infers server-side sharing or firewall issues from blocked ports', () => {
  const { normalizePrinterShareDiagnosis } = loadTroubleshootingServiceModule()

  const diagnosis = normalizePrinterShareDiagnosis({
    targetHost: 'printer-host',
    printerName: '',
    spoolerStatus: 'Running',
    queueFileCount: 0,
    pingReachable: true,
    smbPortOpen: false,
    rpcPortOpen: false,
    uncAccessible: false,
    existingConnections: [],
    rpcUseNamedPipeProtocol: 1,
    rpcAuthnLevelPrivacyEnabled: 0,
    smb1ClientState: 'Disabled'
  }, { platform: 'win32' })

  assert.equal(diagnosis.summary.owner, 'server')
  assert.match(diagnosis.summary.detail, /445|135|服务端/)
  assert.ok(diagnosis.recommendedActions.includes('open-server-unc'))
  assert.equal(diagnosis.checks.find((check) => check.id === 'server-smb-port').target, 'server')
})

test('normalizePrinterShareDiagnosis recommends RPC compatibility when connectivity works but Win11 compatibility keys are absent', () => {
  const { normalizePrinterShareDiagnosis } = loadTroubleshootingServiceModule()

  const diagnosis = normalizePrinterShareDiagnosis({
    targetHost: '10.10.31.51',
    printerName: 'Canon',
    spoolerStatus: 'Running',
    queueFileCount: 0,
    pingReachable: true,
    smbPortOpen: true,
    rpcPortOpen: true,
    uncAccessible: true,
    existingConnections: [],
    rpcUseNamedPipeProtocol: null,
    rpcAuthnLevelPrivacyEnabled: null,
    smb1ClientState: 'Disabled'
  }, { platform: 'win32' })

  assert.equal(diagnosis.summary.owner, 'protocol')
  assert.ok(diagnosis.recommendedActions.includes('apply-rpc-compatibility'))
  assert.ok(diagnosis.recommendedActions.includes('open-credential-manager'))
  assert.match(diagnosis.checks.find((check) => check.id === 'rpc-compatibility').detail, /RPC/)
})

test('normalizePrinterShareDiagnosis guides reachable-but-locked shares into credential entry', () => {
  const { normalizePrinterShareDiagnosis } = loadTroubleshootingServiceModule()

  const diagnosis = normalizePrinterShareDiagnosis({
    targetHost: '192.168.6.7',
    printerName: 'HP',
    spoolerStatus: 'Running',
    queueFileCount: 0,
    pingReachable: true,
    smbPortOpen: true,
    rpcPortOpen: true,
    uncAccessible: false,
    existingConnections: [],
    savedCredentialTargets: [],
    activeServerConnections: [],
    rpcUseNamedPipeProtocol: null,
    rpcAuthnLevelPrivacyEnabled: null,
    smb1ClientState: 'Disabled'
  }, { platform: 'win32' })

  assert.equal(diagnosis.summary.owner, 'credential')
  assert.equal(diagnosis.wizardStep, 'need-credentials')
  assert.equal(diagnosis.nextAction.id, 'save-server-credential')
  assert.equal(diagnosis.credentialState, 'missing')
  assert.equal(diagnosis.advancedChecksVisibleByDefault, false)
  assert.ok(diagnosis.recommendedActions.includes('save-server-credential'))
})

test('normalizePrinterShareDiagnosis detects stale server sessions as a credential conflict', () => {
  const { normalizePrinterShareDiagnosis } = loadTroubleshootingServiceModule()

  const diagnosis = normalizePrinterShareDiagnosis({
    targetHost: 'printer-host',
    printerName: 'Canon',
    spoolerStatus: 'Running',
    queueFileCount: 0,
    pingReachable: true,
    smbPortOpen: true,
    rpcPortOpen: true,
    uncAccessible: false,
    existingConnections: [],
    savedCredentialTargets: ['LegacyGeneric:target=printer-host'],
    activeServerConnections: ['\\\\printer-host\\IPC$'],
    rpcUseNamedPipeProtocol: 1,
    rpcAuthnLevelPrivacyEnabled: 0,
    smb1ClientState: 'Disabled'
  }, { platform: 'win32' })

  assert.equal(diagnosis.summary.owner, 'credential')
  assert.equal(diagnosis.wizardStep, 'credential-conflict')
  assert.equal(diagnosis.nextAction.id, 'clear-server-connection')
  assert.equal(diagnosis.credentialState, 'conflict')
  assert.equal(diagnosis.hasCredentialConflict, true)
  assert.deepEqual(toPlainObject(diagnosis.activeServerConnections), ['\\\\printer-host\\IPC$'])
})

test('diagnosePrinterShare validates target host and parses marked PowerShell facts', async () => {
  const payload = {
    targetHost: '192.168.6.7',
    printerName: 'HP',
    spoolerStatus: 'Running',
    queueFileCount: 0,
    pingReachable: true,
    smbPortOpen: true,
    rpcPortOpen: true,
    uncAccessible: false,
    existingConnections: ['\\\\192.168.6.7\\OldPrinter'],
    rpcUseNamedPipeProtocol: null,
    rpcAuthnLevelPrivacyEnabled: null,
    smb1ClientState: 'Disabled'
  }
  const scripts = []
  const { TroubleshootingService } = loadTroubleshootingServiceModule({
    execPowerShellEncoded: async (script) => {
      scripts.push(script)
      return `---PRINTER_SHARE_DIAGNOSIS_JSON_START---${JSON.stringify(payload)}---PRINTER_SHARE_DIAGNOSIS_JSON_END---`
    }
  })
  const service = new TroubleshootingService({ platform: 'win32' })

  const result = await service.diagnosePrinterShare({ target: '\\\\192.168.6.7\\HP' })

  assert.equal(result.success, true)
  assert.equal(result.data.targetHost, '192.168.6.7')
  assert.equal(result.data.printerName, 'HP')
  assert.match(scripts[0], /Test-NetConnection/)
  const invalid = await service.diagnosePrinterShare({ target: 'bad-host & calc' })
  assert.equal(invalid.success, false)
  assert.match(invalid.error, /打印共享地址/)
})

test('diagnosePrinterShare collects credential and session facts without reading passwords', async () => {
  const payload = {
    targetHost: '192.168.6.7',
    printerName: 'HP',
    spoolerStatus: 'Running',
    queueFileCount: 0,
    pingReachable: true,
    smbPortOpen: true,
    rpcPortOpen: true,
    uncAccessible: false,
    existingConnections: [],
    savedCredentialTargets: ['Domain:target=192.168.6.7'],
    activeServerConnections: ['\\\\192.168.6.7\\IPC$'],
    rpcUseNamedPipeProtocol: null,
    rpcAuthnLevelPrivacyEnabled: null,
    smb1ClientState: 'Disabled'
  }
  const scripts = []
  const { TroubleshootingService } = loadTroubleshootingServiceModule({
    execPowerShellEncoded: async (script) => {
      scripts.push(script)
      return `---PRINTER_SHARE_DIAGNOSIS_JSON_START---${JSON.stringify(payload)}---PRINTER_SHARE_DIAGNOSIS_JSON_END---`
    }
  })
  const service = new TroubleshootingService({ platform: 'win32' })

  const result = await service.diagnosePrinterShare({ target: '\\\\192.168.6.7\\HP' })

  assert.equal(result.success, true)
  assert.equal(result.data.hasCredentialConflict, true)
  assert.match(scripts[0], /cmdkey\.exe \/list/)
  assert.match(scripts[0], /net\.exe use/)
  assert.doesNotMatch(scripts[0], /password/i)
})

test('repairPrinterShare builds elevated scripts for queue cleanup, RPC compatibility, and credential cleanup', async () => {
  const scripts = []
  const { TroubleshootingService } = loadTroubleshootingServiceModule({
    execPowerShellEncoded: async (script) => {
      scripts.push(script)
      return '---PRINTER_SHARE_REPAIR_JSON_START---{"actionId":"apply-rpc-compatibility","started":true,"exitCode":0,"message":"ok","outputTail":"ok"}---PRINTER_SHARE_REPAIR_JSON_END---'
    }
  })
  const service = new TroubleshootingService({ platform: 'win32' })

  const rpcResult = await service.repairPrinterShare({ actionId: 'apply-rpc-compatibility' })
  await service.repairPrinterShare({ actionId: 'clear-client-print-queue' })
  await service.repairPrinterShare({ actionId: 'clear-server-connection', targetHost: 'printer-host' })
  await service.repairPrinterShare({ actionId: 'clear-server-credential', targetHost: 'printer-host' })

  assert.equal(rpcResult.success, true)
  assert.match(scripts[0], /RpcUseNamedPipeProtocol/)
  assert.match(scripts[0], /RpcAuthnLevelPrivacyEnabled/)
  assert.match(scripts[0], /-Verb RunAs/)
  assert.match(scripts[1], /System32\\spool\\PRINTERS/)
  assert.match(scripts[1], /Stop-Service -Name Spooler/)
  assert.match(scripts[2], /net\.exe use/)
  assert.match(scripts[2], /\/delete/)
  assert.match(scripts[3], /cmdkey\.exe \/delete/)
  assert.match(scripts[3], /printer-host/)
})

test('savePrinterShareCredential writes Windows credentials without persisting the password in script text', async () => {
  const scripts = []
  const { TroubleshootingService } = loadTroubleshootingServiceModule({
    execPowerShellEncoded: async (script) => {
      scripts.push(script)
      return '---PRINTER_SHARE_CREDENTIAL_JSON_START---{"targetHost":"192.168.6.7","username":"SERVER\\\\printuser","saved":true,"uncAccessible":true,"message":"凭据已保存"}---PRINTER_SHARE_CREDENTIAL_JSON_END---'
    }
  })
  const service = new TroubleshootingService({ platform: 'win32' })

  const result = await service.savePrinterShareCredential({
    targetHost: '192.168.6.7',
    username: 'SERVER\\printuser',
    password: 'super-secret-password',
    clearExisting: true
  })

  assert.equal(result.success, true)
  assert.equal(result.data.saved, true)
  assert.match(scripts[0], /cmdkey\.exe/)
  assert.match(scripts[0], /\/add:\$TargetHost/)
  assert.match(scripts[0], /\/pass:\$Password/)
  assert.doesNotMatch(scripts[0], /super-secret-password/)
})
