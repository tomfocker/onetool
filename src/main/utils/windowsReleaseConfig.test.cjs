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

test('Windows packaging does not copy a second ffmpeg binary into extraResources', () => {
  const packageJsonPath = path.join(__dirname, '../../../package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

  const extraResourceSources = (packageJson.build?.extraResources ?? []).map((entry) => entry.from)

  assert.equal(extraResourceSources.includes('node_modules/ffmpeg-static/ffmpeg.exe'), false)
})
