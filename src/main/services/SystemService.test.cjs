const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadSystemServiceModule() {
  const filePath = path.join(__dirname, 'SystemService.ts');
  const source = fs.readFileSync(filePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filePath,
  }).outputText;

  const module = { exports: {} };
  const customRequire = (specifier) => {
    if (specifier === 'electron') {
      return {
        app: {},
        dialog: {},
        BrowserWindow: function BrowserWindow() {},
      };
    }

    if (specifier === '../utils/processUtils') {
      return { execPowerShell: async () => '' };
    }

    if (specifier === '../utils/logger') {
      return { logger: { info() {}, error() {} } };
    }

    if (specifier === './TaskQueueService') {
      return { taskQueueService: { enqueue: async (_name, fn) => fn() } };
    }

    if (specifier === '../../shared/types') {
      return {};
    }

    if (specifier === '../../shared/hardwareIdentity') {
      return require(path.join(__dirname, '../../shared/hardwareIdentity.ts'));
    }

    return require(specifier);
  };

  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require: customRequire,
    __dirname,
    __filename: filePath,
    console,
    process,
  }, { filename: filePath });

  return module.exports;
}

const { buildSystemConfigFromHardwarePayload } = loadSystemServiceModule();

test('buildSystemConfigFromHardwarePayload maps raw CIM keys into deviceModel and motherboard', () => {
  const config = buildSystemConfigFromHardwarePayload(
    {
      cpu: 'Intel Core Ultra 7 155H',
      cspVendor: 'Dell Inc.',
      cspName: '',
      cspVersion: 'XPS 13',
      csManufacturer: 'Dell Inc.',
      csModel: 'Dell XPS 13',
      mbManufacturer: 'ASUSTeK COMPUTER INC.',
      mbProduct: 'ROG STRIX B650E-F GAMING WIFI',
      ram: '32GB|2|5600|Samsung',
      gpu: 'NVIDIA RTX 4060',
      disk: 'Samsung SSD (1024GB)',
      mon: 'Dell|Dell U2720Q|2560x1440',
      os: 'Windows 11 Pro',
    },
    [],
  );

  assert.equal(config.deviceModel, 'Dell XPS 13');
  assert.equal(config.motherboard, 'ASUS ROG STRIX B650E-F GAMING WIFI');
});

test('buildSystemConfigFromHardwarePayload keeps a valid computer-system model ahead of motherboard identity', () => {
  const config = buildSystemConfigFromHardwarePayload(
    {
      cpu: 'Intel Core Ultra 7 155H',
      cspVendor: 'System manufacturer',
      cspName: 'Default string',
      cspVersion: 'A01',
      csManufacturer: 'Dell Inc.',
      csModel: 'Dell XPS 13 9340',
      mbManufacturer: 'ASUSTeK COMPUTER INC.',
      mbProduct: 'ROG STRIX B650E-F GAMING WIFI',
      ram: '32GB|2|5600|Samsung',
      gpu: 'NVIDIA RTX 4060',
      disk: 'Samsung SSD (1024GB)',
      mon: '',
      os: 'Windows 11 Pro',
    },
    [],
  );

  assert.equal(config.deviceModel, 'Dell XPS 13 9340');
  assert.equal(config.motherboard, 'ASUS ROG STRIX B650E-F GAMING WIFI');
});

test('buildSystemConfigFromHardwarePayload falls back to Electron display resolution for invalid WMI monitor sizes', () => {
  const config = buildSystemConfigFromHardwarePayload(
    {
      cpu: 'AMD Ryzen 7 7800X3D',
      cspVendor: 'System manufacturer',
      cspName: 'To Be Filled By O.E.M.',
      cspVersion: 'Default string',
      csManufacturer: 'System manufacturer',
      csModel: 'System Product Name',
      mbManufacturer: 'ASUSTeK COMPUTER INC.',
      mbProduct: 'ROG STRIX B650E-F GAMING WIFI',
      ram: '32GB|2|6000|Kingston',
      gpu: 'NVIDIA RTX 4080',
      disk: 'WD SN850X (2048GB)',
      mon: 'Dell|Dell U2720Q|0x0',
      os: 'Windows 11 Pro',
    },
    [
      { bounds: { width: 2560, height: 1440 }, scaleFactor: 1 },
    ],
  );

  assert.equal(config.monitor, 'Dell|U2720Q|2560x1440');
});

test('buildSystemConfigFromHardwarePayload avoids guessed monitor resolutions when multiple displays make ordering ambiguous', () => {
  const config = buildSystemConfigFromHardwarePayload(
    {
      cpu: 'AMD Ryzen 7 7800X3D',
      cspVendor: 'System manufacturer',
      cspName: 'To Be Filled By O.E.M.',
      cspVersion: 'Default string',
      csManufacturer: 'System manufacturer',
      csModel: 'System Product Name',
      mbManufacturer: 'ASUSTeK COMPUTER INC.',
      mbProduct: 'ROG STRIX B650E-F GAMING WIFI',
      ram: '32GB|2|6000|Kingston',
      gpu: 'NVIDIA RTX 4080',
      disk: 'WD SN850X (2048GB)',
      mon: 'Dell|Dell U2720Q|0x0\nAOC|AOC Q27G3XMN|',
      os: 'Windows 11 Pro',
    },
    [
      { bounds: { width: 2560, height: 1440 }, scaleFactor: 1 },
      { bounds: { width: 1920, height: 1080 }, scaleFactor: 1.25 },
    ],
  );

  assert.equal(config.monitor, 'Dell|U2720Q|\nAOC|Q27G3XMN|');
});

test('buildSystemConfigFromHardwarePayload uses normalized motherboard fallback when device candidates are junk', () => {
  const config = buildSystemConfigFromHardwarePayload(
    {
      cpu: 'AMD Ryzen 7 7800X3D',
      cspVendor: 'System manufacturer',
      cspName: 'Default string',
      cspVersion: 'A01',
      csManufacturer: 'System manufacturer',
      csModel: 'To Be Filled By O.E.M.',
      mbManufacturer: 'ASUSTeK COMPUTER INC.',
      mbProduct: 'ROG STRIX B650E-F GAMING WIFI',
      ram: '32GB|2|6000|Kingston',
      gpu: 'NVIDIA RTX 4080',
      disk: 'WD SN850X (2048GB)',
      mon: '',
      os: 'Windows 11 Pro',
    },
    [],
  );

  assert.equal(config.deviceModel, 'ASUS ROG STRIX B650E-F GAMING WIFI');
  assert.equal(config.motherboard, 'ASUS ROG STRIX B650E-F GAMING WIFI');
});
