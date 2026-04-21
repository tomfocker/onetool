const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('FileDropover uses a dedicated float-ball icon asset', () => {
  const filePath = path.join(__dirname, 'FileDropover.tsx')
  const source = fs.readFileSync(filePath, 'utf8')

  assert.match(source, /import floatBallIcon from '\.\.\/\.\.\/\.\.\/\.\.\/resources\/floatball-icon\.png'/)
  assert.doesNotMatch(source, /import appIcon from '\.\.\/\.\.\/\.\.\/\.\.\/resources\/icon\.png'/)
})
