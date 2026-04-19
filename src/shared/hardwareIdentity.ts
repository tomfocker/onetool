export interface DeviceModelCandidate {
  source?: string;
  manufacturer?: string | null;
  model?: string | null;
  version?: string | null;
}

type MonitorEntry = {
  manufacturer?: string | null;
  name?: string | null;
  resolution?: string | null;
};

const PLACEHOLDER_PATTERNS = [
  /^$/,
  /^default string$/i,
  /^system product name$/i,
  /^system manufacturer$/i,
  /^to be filled by o\.e\.m\.?$/i,
  /^to be filled by oem$/i,
  /^unknown$/i,
  /^n\/a$/i,
  /^none$/i,
  /^not specified$/i,
  /^generic/i,
  /^pnp monitor$/i,
  /^base board$/i,
  /^motherboard$/i,
];

const MANUFACTURER_ALIASES: Array<[RegExp, string]> = [
  [/^asustek computer inc\.?$/i, 'ASUS'],
  [/^asus$/i, 'ASUS'],
  [/^microsoft corporation$/i, 'Microsoft'],
  [/^microsoft$/i, 'Microsoft'],
  [/^dell inc\.?$/i, 'Dell'],
  [/^dell$/i, 'Dell'],
  [/^hewlett-packard$/i, 'HP'],
  [/^hp inc\.?$/i, 'HP'],
  [/^hp$/i, 'HP'],
  [/^lenovo$/i, 'Lenovo'],
  [/^huawei$/i, 'HUAWEI'],
  [/^xiaomi$/i, 'Xiaomi'],
  [/^amd$/i, 'AMD'],
  [/^nvidia$/i, 'NVIDIA'],
  [/^western digital$/i, 'Western Digital'],
  [/^aoc$/i, 'AOC'],
  [/^micro-star international$/i, 'MSI'],
  [/^msi$/i, 'MSI'],
  [/^acer inc\.?$/i, 'Acer'],
  [/^acer$/i, 'Acer'],
  [/^samsung electronics$/i, 'Samsung'],
  [/^samsung$/i, 'Samsung'],
  [/^lg electronics$/i, 'LG'],
  [/^lg$/i, 'LG'],
  [/^intel corporation$/i, 'Intel'],
  [/^intel$/i, 'Intel'],
  [/^gigabyte technology co\.?,? ltd\.?$/i, 'GIGABYTE'],
  [/^gigabyte$/i, 'GIGABYTE'],
  [/^msi computer corp\.?$/i, 'MSI'],
  [/^compaq$/i, 'HP'],
];

const BRAND_TRANSLATIONS: Array<[RegExp, string]> = [
  [/^Microsoft\b/i, '微软'],
  [/^ASUS\b/i, '华硕'],
  [/^Dell\b/i, '戴尔'],
  [/^HP\b/i, '惠普'],
  [/^Lenovo\b/i, '联想'],
  [/^Acer\b/i, '宏碁'],
  [/^MSI\b/i, '微星'],
  [/^HUAWEI\b/i, '华为'],
  [/^Xiaomi\b/i, '小米'],
  [/^AMD\b/i, '超威'],
  [/^NVIDIA\b/i, '英伟达'],
  [/^Western Digital\b/i, '西部数据'],
  [/^AOC\b/i, 'AOC'],
  [/^Samsung\b/i, '三星'],
  [/^LG\b/i, 'LG'],
  [/^Intel\b/i, '英特尔'],
  [/^GIGABYTE\b/i, '技嘉'],
];

const MANUFACTURER_PREFIX_ALIASES: Record<string, string[]> = {
  ASUS: ['ASUSTeK COMPUTER INC.', 'ASUSTeK Computer Inc.', 'ASUSTeK'],
  Microsoft: ['Microsoft Corporation', 'Microsoft Corp.'],
  MSI: ['Micro-Star International', 'MSI Computer Corp.', 'Micro Star International'],
  HUAWEI: ['Huawei', 'HUAWEI Technologies Co., Ltd.'],
  Xiaomi: ['Xiaomi Inc.', 'Xiaomi Communications Co., Ltd.'],
  AMD: ['Advanced Micro Devices', 'Advanced Micro Devices, Inc.'],
  NVIDIA: ['NVIDIA Corporation'],
  'Western Digital': ['Western Digital Corporation', 'WD'],
  AOC: ['AOC International'],
  Dell: ['Dell Inc.', 'Dell Computer Corporation'],
  HP: ['Hewlett-Packard', 'HP Inc.'],
  Lenovo: ['Lenovo Group Limited'],
  Acer: ['Acer Inc.'],
  Samsung: ['Samsung Electronics'],
  Intel: ['Intel Corporation'],
  GIGABYTE: ['GIGA-BYTE Technology Co., Ltd.', 'GIGABYTE Technology Co., Ltd.'],
  LG: ['LG Electronics'],
};

const UNKNOWN_HARDWARE_LABEL = 'Unknown hardware';

function compactSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function removePrefix(value: string, prefix: string): string {
  if (!prefix) {
    return value;
  }

  const lowerValue = value.toLowerCase();
  const lowerPrefix = prefix.toLowerCase();
  if (lowerValue === lowerPrefix) {
    return '';
  }

  const variants = [
    `${prefix} `,
    `${prefix}-`,
    `${prefix}:`,
    `${prefix},`,
  ];

  for (const variant of variants) {
    if (lowerValue.startsWith(variant.toLowerCase())) {
      return compactSpaces(value.slice(variant.length));
    }
  }

  return value;
}

function getManufacturerPrefixVariants(manufacturer: string): string[] {
  if (!manufacturer) {
    return [];
  }

  return [manufacturer, ...(MANUFACTURER_PREFIX_ALIASES[manufacturer] ?? [])];
}

function stripManufacturerPrefix(value: string, manufacturer: string): string {
  for (const prefix of getManufacturerPrefixVariants(manufacturer)) {
    const stripped = removePrefix(value, prefix);
    if (stripped !== value) {
      return stripped;
    }
  }

  return value;
}

function looksLikeSerialOrGarbage(value: string): boolean {
  const text = value.replace(/[^a-z0-9]/gi, '');
  if (!text) {
    return true;
  }

  if (/^[A-Z0-9]{4,8}$/i.test(value) && /[0-9]/.test(value) && /[A-Z]/i.test(value)) {
    return true;
  }

  return false;
}

function isGenericModelText(value: string): boolean {
  const text = sanitizeHardwareText(value);
  if (!text) {
    return true;
  }

  return /^(notebook pc|laptop pc|desktop|desktop pc|system product)$/i.test(text);
}

function isDescriptiveVersionText(value: string): boolean {
  const text = sanitizeHardwareText(value);
  if (!text || isPlaceholderHardwareValue(text) || looksLikeSerialOrGarbage(text)) {
    return false;
  }

  if (/^(notebook|laptop|desktop|aio|all in one|all-in-one|surface laptop|surface pro|surface book)$/i.test(text)) {
    return false;
  }

  if (/^(rev\.?\s*)?[0-9]+([.\-][0-9a-z]+)*$/i.test(text)) {
    return false;
  }

  if (/^[a-z]\d+$/i.test(text)) {
    return false;
  }

  const tokens = text.split(' ');
  if (tokens.length >= 3) {
    return true;
  }

  if (tokens.length === 2) {
    const [firstToken, secondToken] = tokens;
    if (/^(notebook|laptop|desktop|workstation|computer|system|product)$/i.test(firstToken)) {
      return false;
    }

    if (/^(pc|computer|system)$/i.test(secondToken)) {
      return false;
    }

    return /[0-9]/.test(firstToken) || /[0-9]/.test(secondToken);
  }

  return false;
}

export function sanitizeHardwareText(value: string | null | undefined): string {
  return compactSpaces(String(value ?? '').replace(/[\u0000-\u001f]+/g, ' '));
}

export function isPlaceholderHardwareValue(value: string | null | undefined): boolean {
  const text = sanitizeHardwareText(value);
  if (!text) {
    return true;
  }

  const normalized = text.toLowerCase();
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function normalizeManufacturerName(value: string | null | undefined): string {
  const text = sanitizeHardwareText(value);
  if (isPlaceholderHardwareValue(text)) {
    return '';
  }

  for (const [pattern, replacement] of MANUFACTURER_ALIASES) {
    if (pattern.test(text)) {
      return replacement;
    }
  }

  if (/^HUAWEI Technologies Co\., Ltd\.$/i.test(text)) {
    return 'HUAWEI';
  }

  if (/^Advanced Micro Devices, Inc\.$/i.test(text)) {
    return 'AMD';
  }

  if (/^NVIDIA Corporation$/i.test(text)) {
    return 'NVIDIA';
  }

  if (/^Western Digital Corporation$/i.test(text)) {
    return 'Western Digital';
  }

  if (/^AOC International$/i.test(text)) {
    return 'AOC';
  }

  return text;
}

export function normalizeCompositeHardwareName(manufacturer: string | null | undefined, model: string | null | undefined): string {
  const normalizedManufacturer = normalizeManufacturerName(manufacturer);
  const normalizedModel = sanitizeHardwareText(model);

  if (isPlaceholderHardwareValue(normalizedModel)) {
    return normalizedManufacturer;
  }

  const withoutDuplicatePrefix = stripManufacturerPrefix(normalizedModel, normalizedManufacturer);
  if (!normalizedManufacturer) {
    return withoutDuplicatePrefix;
  }

  if (!withoutDuplicatePrefix) {
    return normalizedManufacturer;
  }

  return `${normalizedManufacturer} ${withoutDuplicatePrefix}`;
}

function scoreCandidate(candidate: DeviceModelCandidate): number {
  const source = candidate.source ?? '';
  let score = 0;
  if (/Win32_ComputerSystemProduct/i.test(source)) {
    score += 40;
  } else if (/Win32_ComputerSystem/i.test(source)) {
    score += 20;
  } else if (/Win32_BIOS/i.test(source)) {
    score += 10;
  } else if (/Win32_BaseBoard/i.test(source)) {
    score += 0;
  } else {
    score += 5;
  }

  const manufacturer = normalizeManufacturerName(candidate.manufacturer);
  const model = sanitizeHardwareText(candidate.model);
  if (manufacturer) {
    score += 6;
  }

  if (model && !isPlaceholderHardwareValue(model) && !looksLikeSerialOrGarbage(model) && !isGenericModelText(model)) {
    score += 10;
  } else if ((!model || isPlaceholderHardwareValue(model)) && isDescriptiveVersionText(candidate.version ?? '')) {
    score += 8;
  } else {
    score -= 25;
  }

  if (model && manufacturer && stripManufacturerPrefix(model, manufacturer) !== model) {
    score += 1;
  }

  return score;
}

function buildCompositeCandidate(candidate: DeviceModelCandidate): string {
  const manufacturer = normalizeManufacturerName(candidate.manufacturer);
  const model = sanitizeHardwareText(candidate.model);
  const version = sanitizeHardwareText(candidate.version);

  const hasUsableModel = Boolean(
    model && !isPlaceholderHardwareValue(model) && !looksLikeSerialOrGarbage(model) && !isGenericModelText(model),
  );

  let name = hasUsableModel ? normalizeCompositeHardwareName(manufacturer, model) : '';
  if ((!model || isPlaceholderHardwareValue(model)) && isDescriptiveVersionText(version)) {
    const normalizedVersion = stripManufacturerPrefix(version, manufacturer);
    if (name) {
      name = `${name} ${normalizedVersion}`;
    } else {
      name = manufacturer ? `${manufacturer} ${normalizedVersion}` : normalizedVersion;
    }
  }

  return compactSpaces(name);
}

export function pickBestDeviceModel(
  candidates: DeviceModelCandidate[],
  fallbackLabel?: string,
  unknownLabel: string = UNKNOWN_HARDWARE_LABEL,
): string {
  let bestCandidate: DeviceModelCandidate | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const score = scoreCandidate(candidate);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  if (!bestCandidate || bestScore < 0) {
    return fallbackLabel || unknownLabel;
  }

  const name = buildCompositeCandidate(bestCandidate);
  return name || fallbackLabel || unknownLabel;
}

function normalizeMonitorResolution(resolution: string | null | undefined): string {
  const text = sanitizeHardwareText(resolution);
  return /^[1-9]\d*x[1-9]\d*$/i.test(text) ? text : '';
}

export function normalizeMonitorEntry(entry: MonitorEntry): string {
  const manufacturer = normalizeManufacturerName(entry.manufacturer);
  const rawName = sanitizeHardwareText(entry.name);
  const strippedName = manufacturer ? stripManufacturerPrefix(rawName, manufacturer) : rawName;
  const normalizedName = isPlaceholderHardwareValue(strippedName) ? '' : strippedName;
  const resolution = normalizeMonitorResolution(entry.resolution);

  const name = compactSpaces(normalizedName);
  return `${manufacturer}|${name}|${resolution}`;
}

export function translateHardwareLabel(label: string | null | undefined): string {
  const text = sanitizeHardwareText(label);
  if (!text) {
    return '';
  }

  for (const [pattern, replacement] of BRAND_TRANSLATIONS) {
    if (pattern.test(text)) {
      return text.replace(pattern, replacement);
    }
  }

  return text;
}
