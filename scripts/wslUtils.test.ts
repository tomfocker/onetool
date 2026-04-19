import assert from 'node:assert/strict'
import test from 'node:test'

import {
  decodeWslText,
  parseWslListVerbose,
  parseWslVersionInfo
} from '../src/main/services/wslUtils.ts'

test('decodeWslText decodes UTF-16LE output with null bytes', () => {
  const source = 'WSL version: 2.6.3.0\r\nKernel version: 6.6.87.2-1'
  const buffer = Buffer.from(source, 'utf16le')

  assert.equal(decodeWslText(buffer), 'WSL version: 2.6.3.0\nKernel version: 6.6.87.2-1')
})

test('parseWslListVerbose extracts default distro and running state', () => {
  const raw = `  NAME      STATE           VERSION\r
* Ubuntu    Running         2\r
  Debian    Stopped         2`

  const result = parseWslListVerbose(raw)

  assert.equal(result.defaultDistro, 'Ubuntu')
  assert.deepEqual(result.distros, [
    {
      name: 'Ubuntu',
      state: 'Running',
      version: 2,
      isDefault: true,
      isRunning: true
    },
    {
      name: 'Debian',
      state: 'Stopped',
      version: 2,
      isDefault: false,
      isRunning: false
    }
  ])
})

test('parseWslVersionInfo extracts structured versions from localized lines', () => {
  const raw = `WSL 版本: 2.6.3.0
内核版本: 6.6.87.2-1
WSLg 版本: 1.0.71
MSRDC 版本: 1.2.6353
Direct3D 版本: 1.611.1-81528511
DXCore 版本: 10.0.26100.1-240331-1435.ge-release
Windows 版本: 10.0.26200.7623`

  assert.deepEqual(parseWslVersionInfo(raw), {
    wslVersion: '2.6.3.0',
    kernelVersion: '6.6.87.2-1',
    wslgVersion: '1.0.71',
    msrdcVersion: '1.2.6353',
    direct3dVersion: '1.611.1-81528511',
    dxcoreVersion: '10.0.26100.1-240331-1435.ge-release',
    windowsVersion: '10.0.26200.7623'
  })
})
