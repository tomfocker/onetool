const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isPlaceholderHardwareValue,
  normalizeManufacturerName,
  normalizeCompositeHardwareName,
  pickBestDeviceModel,
  normalizeMonitorEntry,
  translateHardwareLabel,
} = require('./hardwareIdentity.ts');

test('isPlaceholderHardwareValue rejects firmware filler strings', () => {
  assert.equal(isPlaceholderHardwareValue('System Product Name'), true);
  assert.equal(isPlaceholderHardwareValue('Default string'), true);
  assert.equal(isPlaceholderHardwareValue('To Be Filled By O.E.M.'), true);
  assert.equal(isPlaceholderHardwareValue('Real Manufacturer'), false);
});

test('normalizeCompositeHardwareName removes placeholder manufacturer values', () => {
  assert.equal(normalizeCompositeHardwareName('Default string', 'ThinkPad T14'), 'ThinkPad T14');
  assert.equal(normalizeCompositeHardwareName('Lenovo', 'ThinkPad T14'), 'Lenovo ThinkPad T14');
  assert.equal(normalizeCompositeHardwareName('System Product Name', 'XPS 13'), 'XPS 13');
});

test('pickBestDeviceModel prefers Win32_ComputerSystemProduct candidates over weaker fallbacks', () => {
  const model = pickBestDeviceModel([
    { source: 'Win32_BaseBoard', manufacturer: 'Dell', model: '0ABCD', version: 'A01' },
    { source: 'Win32_ComputerSystemProduct', manufacturer: 'Dell Inc.', model: 'Precision 5680', version: '1.0' },
  ]);

  assert.equal(model, 'Dell Precision 5680');
});

test('pickBestDeviceModel uses descriptive version text only when model is missing', () => {
  const model = pickBestDeviceModel([
    { source: 'Win32_ComputerSystemProduct', manufacturer: 'Microsoft Corporation', model: '', version: 'Surface Laptop Studio 2' },
  ]);

  assert.equal(model, 'Microsoft Surface Laptop Studio 2');
});

test('pickBestDeviceModel accepts common two-token version strings when model is missing', () => {
  assert.equal(
    pickBestDeviceModel([
      { source: 'Win32_ComputerSystemProduct', manufacturer: 'Dell Inc.', model: '', version: 'XPS 13' },
    ]),
    'Dell XPS 13',
  );

  assert.equal(
    pickBestDeviceModel([
      { source: 'Win32_ComputerSystemProduct', manufacturer: 'Lenovo', model: '', version: 'ThinkPad T14' },
    ]),
    'Lenovo ThinkPad T14',
  );
});

test('normalizeManufacturerName canonicalizes common vendor strings directly', () => {
  assert.equal(normalizeManufacturerName('HUAWEI Technologies Co., Ltd.'), 'HUAWEI');
  assert.equal(normalizeManufacturerName('Advanced Micro Devices, Inc.'), 'AMD');
  assert.equal(normalizeManufacturerName('NVIDIA Corporation'), 'NVIDIA');
  assert.equal(normalizeManufacturerName('Western Digital Corporation'), 'Western Digital');
  assert.equal(normalizeManufacturerName('AOC International'), 'AOC');
});

test('pickBestDeviceModel does not treat generic product family text as descriptive version text', () => {
  const model = pickBestDeviceModel([
    { source: 'Win32_ComputerSystemProduct', manufacturer: 'Microsoft Corporation', model: '', version: 'Surface Laptop' },
    { source: 'Win32_ComputerSystemProduct', manufacturer: 'Microsoft Corporation', model: '', version: 'Notebook PC' },
  ]);

  assert.equal(model, 'Unknown hardware');
});

test('pickBestDeviceModel does not return a bare vendor name when no usable model data exists', () => {
  assert.equal(
    pickBestDeviceModel([
      { source: 'Win32_ComputerSystemProduct', manufacturer: 'Dell Inc.', model: '', version: 'Notebook PC' },
    ]),
    'Unknown hardware',
  );

  assert.equal(
    pickBestDeviceModel(
      [
        { source: 'Win32_ComputerSystemProduct', manufacturer: 'Lenovo', model: '', version: 'Laptop PC' },
      ],
      'Fallback board',
    ),
    'Fallback board',
  );
});

test('pickBestDeviceModel treats generic non-placeholder model strings as unusable identity', () => {
  assert.equal(
    pickBestDeviceModel([
      { source: 'Win32_ComputerSystemProduct', manufacturer: 'Dell Inc.', model: 'Notebook PC', version: '' },
    ]),
    'Unknown hardware',
  );

  assert.equal(
    pickBestDeviceModel(
      [
        { source: 'Win32_ComputerSystemProduct', manufacturer: 'Lenovo', model: 'Laptop PC', version: '' },
      ],
      'Fallback board',
    ),
    'Fallback board',
  );

  assert.equal(
    pickBestDeviceModel([
      { source: 'Win32_ComputerSystemProduct', manufacturer: 'HP', model: 'Desktop', version: '' },
      { source: 'Win32_ComputerSystemProduct', manufacturer: 'Dell', model: 'System Product', version: '' },
    ]),
    'Unknown hardware',
  );
});

test('pickBestDeviceModel falls back to motherboard when device candidates are garbage', () => {
  const model = pickBestDeviceModel([
    { source: 'Win32_ComputerSystemProduct', manufacturer: 'System manufacturer', model: 'To Be Filled By O.E.M.', version: 'Default string' },
    { source: 'Win32_BaseBoard', manufacturer: 'ASUSTeK COMPUTER INC.', model: 'ROG STRIX B650E-F GAMING WIFI', version: 'Rev 1.xx' },
  ]);

  assert.equal(model, 'ASUS ROG STRIX B650E-F GAMING WIFI');
});

test('pickBestDeviceModel prefers a valid computer-system model over a motherboard-style fallback candidate', () => {
  const model = pickBestDeviceModel([
    { source: 'Win32_BaseBoard', manufacturer: 'ASUSTeK COMPUTER INC.', model: 'ROG STRIX B650E-F GAMING WIFI' },
    { source: 'Win32_ComputerSystem', manufacturer: 'Dell Inc.', model: 'Dell XPS 13 9340' },
  ]);

  assert.equal(model, 'Dell XPS 13 9340');
});

test('normalizeCompositeHardwareName strips duplicate brand prefixes from alias forms', () => {
  assert.equal(
    normalizeCompositeHardwareName('ASUS', 'ASUSTeK COMPUTER INC. ROG STRIX B650E-F GAMING WIFI'),
    'ASUS ROG STRIX B650E-F GAMING WIFI',
  );
  assert.equal(
    normalizeCompositeHardwareName('MSI', 'Micro-Star International MAG B650 TOMAHAWK'),
    'MSI MAG B650 TOMAHAWK',
  );
});

test('pickBestDeviceModel returns a stable unknown fallback for junk-only input', () => {
  const model = pickBestDeviceModel([
    { source: 'Win32_ComputerSystemProduct', manufacturer: 'System manufacturer', model: 'Default string', version: 'A01' },
    { source: 'Win32_BaseBoard', manufacturer: 'Base Board', model: 'To Be Filled By O.E.M.', version: 'Rev 1.xx' },
  ]);

  assert.equal(model, 'Unknown hardware');
});

test('pickBestDeviceModel honors caller-provided fallback labels', () => {
  const model = pickBestDeviceModel(
    [
      { source: 'Win32_ComputerSystemProduct', manufacturer: 'System manufacturer', model: 'Default string', version: 'A01' },
    ],
    'Custom fallback',
  );

  assert.equal(model, 'Custom fallback');
});

test('pickBestDeviceModel uses a caller fallback when every candidate is junk', () => {
  const model = pickBestDeviceModel(
    [
      { source: 'Win32_ComputerSystemProduct', manufacturer: 'System manufacturer', model: 'To Be Filled By O.E.M.', version: 'Default string' },
      { source: 'Win32_ComputerSystem', manufacturer: 'System manufacturer', model: 'System Product Name', version: 'A01' },
    ],
    'ASUS ROG STRIX B650E-F GAMING WIFI',
  );

  assert.equal(model, 'ASUS ROG STRIX B650E-F GAMING WIFI');
});

test('pickBestDeviceModel ignores descriptive version text when a concrete model already exists', () => {
  const model = pickBestDeviceModel([
    {
      source: 'Win32_ComputerSystemProduct',
      manufacturer: 'Microsoft Corporation',
      model: 'Surface Laptop',
      version: 'Surface Laptop Studio 2',
    },
  ]);

  assert.equal(model, 'Microsoft Surface Laptop');
});

test('normalizeCompositeHardwareName preserves standalone motherboard models when manufacturer is blank', () => {
  assert.equal(
    normalizeCompositeHardwareName('', 'ROG STRIX B650E-F GAMING WIFI'),
    'ROG STRIX B650E-F GAMING WIFI',
  );
  assert.equal(
    normalizeCompositeHardwareName('System manufacturer', 'MAG B650 TOMAHAWK WIFI'),
    'MAG B650 TOMAHAWK WIFI',
  );
});

test('normalizeMonitorEntry preserves resolution and dedupes duplicate manufacturer prefixes where appropriate', () => {
  assert.equal(
    normalizeMonitorEntry({
      manufacturer: 'Samsung',
      name: 'Samsung SyncMaster',
      resolution: '1920x1080',
    }),
    'Samsung|SyncMaster|1920x1080',
  );

  assert.equal(
    normalizeMonitorEntry({
      manufacturer: 'Dell',
      name: 'Dell U2720Q',
      resolution: '0x0',
    }),
    'Dell|U2720Q|',
  );
});

test('normalizeMonitorEntry filters placeholder monitor names', () => {
  assert.equal(
    normalizeMonitorEntry({
      manufacturer: 'AOC',
      name: 'Generic PnP Monitor',
      resolution: '1920x1080',
    }),
    'AOC||1920x1080',
  );
  assert.equal(
    normalizeMonitorEntry({
      manufacturer: 'AOC',
      name: 'PnP Monitor',
      resolution: '1920x1080',
    }),
    'AOC||1920x1080',
  );
  assert.equal(
    normalizeMonitorEntry({
      manufacturer: 'System Product Name',
      name: 'System Product Name',
      resolution: '2560x1440',
    }),
    '||2560x1440',
  );
});

test('translateHardwareLabel exposes localized display names for known brands', () => {
  assert.equal(translateHardwareLabel('Dell Precision 5680'), '戴尔 Precision 5680');
  assert.equal(translateHardwareLabel('ASUS ROG STRIX B650E-F GAMING WIFI'), '华硕 ROG STRIX B650E-F GAMING WIFI');
  assert.equal(translateHardwareLabel('Intel Core i7'), '英特尔 Core i7');
  assert.equal(translateHardwareLabel('Microsoft Surface Laptop'), '微软 Surface Laptop');
  assert.equal(translateHardwareLabel('HUAWEI MateBook X Pro'), '华为 MateBook X Pro');
  assert.equal(translateHardwareLabel('Xiaomi RedmiBook Pro'), '小米 RedmiBook Pro');
  assert.equal(translateHardwareLabel('AMD Ryzen 7'), '超威 Ryzen 7');
  assert.equal(translateHardwareLabel('NVIDIA GeForce RTX 4060'), '英伟达 GeForce RTX 4060');
  assert.equal(translateHardwareLabel('Western Digital SN850X'), '西部数据 SN850X');
  assert.equal(translateHardwareLabel('AOC 24G2'), 'AOC 24G2');
});
