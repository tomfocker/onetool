import iconv from 'iconv-lite'

function looksMojibaked(text: string): boolean {
  const replacementCount = (text.match(/�/g) ?? []).length
  return replacementCount > 0 || text.includes('����')
}

export function decodeCommandText(value: string | Buffer | null | undefined): string {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (!value) {
    return ''
  }

  const utf8Text = value.toString('utf8').trim()
  if (!looksMojibaked(utf8Text)) {
    return utf8Text
  }

  return iconv.decode(value, 'cp936').trim()
}

export function selectCommandTextOutput(
  stdout: string | Buffer | null | undefined,
  stderr: string | Buffer | null | undefined
): string {
  const stdoutText = decodeCommandText(stdout)
  if (stdoutText) {
    return stdoutText
  }

  return decodeCommandText(stderr)
}
