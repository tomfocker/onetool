export function createTrayIconBuffer(): Buffer {
  const size = 16
  const buffer = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size * 4; i += 4) {
    buffer[i] = 66     // R
    buffer[i + 1] = 133 // G
    buffer[i + 2] = 244 // B
    buffer[i + 3] = 255 // A
  }
  return buffer
}
