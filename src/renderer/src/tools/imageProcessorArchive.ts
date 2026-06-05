export interface ImageArchiveEntry {
  fileName: string
  blob: Blob
}

const ZIP_UINT16_LIMIT = 0xffff
const ZIP_UINT32_LIMIT = 0xffffffff
const ZIP_UTF8_FLAG = 0x0800
const ZIP_STORE_METHOD = 0
const DOS_TIME = 0
const DOS_DATE = 33

const CRC32_TABLE = createCrc32Table()

export function getArchiveFileNames(entries: Array<{ fileName: string }>): string[] {
  return entries.map((entry) => normalizeArchiveFileName(entry.fileName))
}

export async function createImageProcessorZip(entries: ImageArchiveEntry[]): Promise<Blob> {
  if (entries.length === 0) {
    throw new Error('没有可下载的图片')
  }

  if (entries.length > ZIP_UINT16_LIMIT) {
    throw new Error('图片数量过多，无法打包为 zip')
  }

  const fileNames = getArchiveFileNames(entries)
  const preparedEntries = await Promise.all(
    entries.map(async (entry, index) => {
      const data = new Uint8Array(await entry.blob.arrayBuffer())
      const nameBytes = new TextEncoder().encode(fileNames[index])

      assertZipUint16(nameBytes.length, '文件名过长，无法打包为 zip')
      assertZipUint32(data.byteLength, '单个文件过大，无法打包为 zip')

      return {
        fileName: fileNames[index],
        nameBytes,
        data,
        crc32: calculateCrc32(data)
      }
    })
  )

  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const entry of preparedEntries) {
    assertZipUint32(offset, '打包文件过大，无法生成 zip')
    const localHeaderOffset = offset
    const localHeader = createLocalFileHeader(entry)
    localParts.push(localHeader, entry.data)
    offset += localHeader.byteLength + entry.data.byteLength

    centralParts.push(createCentralDirectoryHeader(entry, localHeaderOffset))
  }

  const centralDirectoryOffset = offset
  let centralDirectorySize = 0

  for (const centralPart of centralParts) {
    centralDirectorySize += centralPart.byteLength
  }

  assertZipUint32(centralDirectoryOffset, '打包文件过大，无法生成 zip')
  assertZipUint32(centralDirectorySize, '打包文件过大，无法生成 zip')

  const endRecord = createEndOfCentralDirectoryRecord(
    preparedEntries.length,
    centralDirectorySize,
    centralDirectoryOffset
  )

  const blobParts: BlobPart[] = [
    ...localParts.map(copyToArrayBuffer),
    ...centralParts.map(copyToArrayBuffer),
    copyToArrayBuffer(endRecord)
  ]

  return new Blob(blobParts, { type: 'application/zip' })
}

function normalizeArchiveFileName(fileName: string): string {
  const lastPathSegment = fileName.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? 'image.png'
  const safeName = lastPathSegment.replace(/[<>:"|?*\x00-\x1f]/g, '_').trim()
  return safeName || 'image.png'
}

function createLocalFileHeader(entry: {
  nameBytes: Uint8Array
  data: Uint8Array
  crc32: number
}): Uint8Array {
  const header = new Uint8Array(30 + entry.nameBytes.byteLength)
  const view = new DataView(header.buffer)

  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, ZIP_UTF8_FLAG, true)
  view.setUint16(8, ZIP_STORE_METHOD, true)
  view.setUint16(10, DOS_TIME, true)
  view.setUint16(12, DOS_DATE, true)
  view.setUint32(14, entry.crc32, true)
  view.setUint32(18, entry.data.byteLength, true)
  view.setUint32(22, entry.data.byteLength, true)
  view.setUint16(26, entry.nameBytes.byteLength, true)
  view.setUint16(28, 0, true)
  header.set(entry.nameBytes, 30)

  return header
}

function createCentralDirectoryHeader(
  entry: {
    nameBytes: Uint8Array
    data: Uint8Array
    crc32: number
  },
  localHeaderOffset: number
): Uint8Array {
  const header = new Uint8Array(46 + entry.nameBytes.byteLength)
  const view = new DataView(header.buffer)

  view.setUint32(0, 0x02014b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 20, true)
  view.setUint16(8, ZIP_UTF8_FLAG, true)
  view.setUint16(10, ZIP_STORE_METHOD, true)
  view.setUint16(12, DOS_TIME, true)
  view.setUint16(14, DOS_DATE, true)
  view.setUint32(16, entry.crc32, true)
  view.setUint32(20, entry.data.byteLength, true)
  view.setUint32(24, entry.data.byteLength, true)
  view.setUint16(28, entry.nameBytes.byteLength, true)
  view.setUint16(30, 0, true)
  view.setUint16(32, 0, true)
  view.setUint16(34, 0, true)
  view.setUint16(36, 0, true)
  view.setUint32(38, 0, true)
  view.setUint32(42, localHeaderOffset, true)
  header.set(entry.nameBytes, 46)

  return header
}

function createEndOfCentralDirectoryRecord(
  entryCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number
): Uint8Array {
  const record = new Uint8Array(22)
  const view = new DataView(record.buffer)

  view.setUint32(0, 0x06054b50, true)
  view.setUint16(4, 0, true)
  view.setUint16(6, 0, true)
  view.setUint16(8, entryCount, true)
  view.setUint16(10, entryCount, true)
  view.setUint32(12, centralDirectorySize, true)
  view.setUint32(16, centralDirectoryOffset, true)
  view.setUint16(20, 0, true)

  return record
}

function calculateCrc32(data: Uint8Array): number {
  let crc = 0xffffffff

  for (const byte of data) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256)

  for (let index = 0; index < table.length; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }

  return table
}

function assertZipUint16(value: number, message: string): void {
  if (value > ZIP_UINT16_LIMIT) {
    throw new Error(message)
  }
}

function assertZipUint32(value: number, message: string): void {
  if (value > ZIP_UINT32_LIMIT) {
    throw new Error(message)
  }
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}
