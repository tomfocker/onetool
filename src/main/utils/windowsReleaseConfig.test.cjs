const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('Windows installer and portable artifacts use distinct names', () => {
  const packageJsonPath = path.join(__dirname, '../../../package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

  assert.equal(
    packageJson.build?.nsis?.artifactName,
    '${productName}-${version}-win-${arch}-setup.${ext}'
  )
  assert.equal(
    packageJson.build?.portable?.artifactName,
    '${productName}-${version}-win-${arch}-portable.${ext}'
  )
  assert.notEqual(packageJson.build?.nsis?.artifactName, packageJson.build?.portable?.artifactName)
})

test('Windows packaging copies the prepared ffmpeg runtime into extraResources', () => {
  const packageJsonPath = path.join(__dirname, '../../../package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

  const extraResourceSources = (packageJson.build?.extraResources ?? []).map((entry) => entry.from)

  assert.equal(extraResourceSources.includes('resources/ffmpeg/ffmpeg.exe'), true)
  assert.equal(extraResourceSources.includes('node_modules/ffmpeg-static/ffmpeg.exe'), false)
})

test('Windows packaging keeps only the release locales we ship', () => {
  const packageJsonPath = path.join(__dirname, '../../../package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

  assert.deepEqual(packageJson.build?.win?.electronLanguages, ['zh-CN', 'en-US'])
})

test('Windows packaging prunes non-Windows global key listener binaries after pack', () => {
  const packageJsonPath = path.join(__dirname, '../../../package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

  assert.equal(packageJson.build?.afterPack, 'scripts/afterPack.cjs')
})

test('Windows packaging scripts prepare ffmpeg before electron-builder runs', () => {
  const packageJsonPath = path.join(__dirname, '../../../package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

  assert.equal(packageJson.scripts?.['build:prepare-ffmpeg'], 'node scripts/ensure-ffmpeg-binary.cjs')
  assert.match(packageJson.scripts?.['build:unpack'] ?? '', /build:prepare-ffmpeg/)
  assert.match(packageJson.scripts?.['build:win'] ?? '', /build:prepare-ffmpeg/)
  assert.match(packageJson.scripts?.['release:win'] ?? '', /build:prepare-ffmpeg/)
})
