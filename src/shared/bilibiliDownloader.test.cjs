const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadTsModule(entryFileName) {
  const cache = new Map()

  function executeModule(filePath) {
    if (cache.has(filePath)) {
      return cache.get(filePath)
    }

    const source = fs.readFileSync(filePath, 'utf8')
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true
      },
      fileName: filePath
    }).outputText

    const module = { exports: {} }
    cache.set(filePath, module.exports)

    const localRequire = (specifier) => {
      if (specifier.startsWith('.')) {
        let resolvedPath = path.resolve(path.dirname(filePath), specifier)
        if (!path.extname(resolvedPath) && fs.existsSync(`${resolvedPath}.ts`)) {
          resolvedPath = `${resolvedPath}.ts`
        }

        if (resolvedPath.endsWith('.ts')) {
          return executeModule(resolvedPath)
        }
      }

      return require(specifier)
    }

    vm.runInNewContext(
      transpiled,
      {
        module,
        exports: module.exports,
        require: localRequire,
        __dirname: path.dirname(filePath),
        __filename: filePath,
        console,
        process,
        URL,
        URLSearchParams
      },
      { filename: filePath }
    )

    cache.set(filePath, module.exports)
    return module.exports
  }

  return executeModule(path.join(__dirname, entryFileName))
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value))
}

const {
  BILIBILI_DOWNLOAD_STAGE_VALUES,
  buildStreamOptionSummary,
  createDefaultBilibiliDownloaderState,
  normalizeBilibiliDownloaderSelection,
  normalizeBilibiliParsedLink,
  parseBilibiliLink
} = loadTsModule('bilibiliDownloader.ts')

const {
  BilibiliDownloaderStateSchema,
  BilibiliParsedLinkSchema
} = loadTsModule('ipc-schemas.ts')

test('parseBilibiliLink recognizes BV video and bangumi links with selectable items', () => {
  assert.deepEqual(
    toPlain(parseBilibiliLink('https://www.bilibili.com/video/BV1xK4y1m7aA?p=3')),
    {
      kind: 'video',
      bvid: 'BV1xK4y1m7aA',
      page: 3,
      title: null,
      coverUrl: null,
      items: [
        {
          id: 'page:3',
          kind: 'page',
          title: 'P3',
          page: 3
        }
      ],
      selectedItemId: 'page:3'
    }
  )

  assert.deepEqual(
    toPlain(parseBilibiliLink('https://www.bilibili.com/bangumi/play/ep123456')),
    {
      kind: 'episode',
      epId: 'ep123456',
      title: null,
      coverUrl: null,
      items: [
        {
          id: 'episode:ep123456',
          kind: 'episode',
          title: 'EP ep123456',
          epId: 'ep123456'
        }
      ],
      selectedItemId: 'episode:ep123456'
    }
  )

  assert.deepEqual(
    toPlain(parseBilibiliLink('https://www.bilibili.com/bangumi/play/ss98765')),
    {
      kind: 'season',
      seasonId: 'ss98765',
      title: null,
      coverUrl: null,
      items: [
        {
          id: 'season:ss98765',
          kind: 'season',
          title: 'SS ss98765',
          seasonId: 'ss98765'
        }
      ],
      selectedItemId: 'season:ss98765'
    }
  )
})

test('parseBilibiliLink rejects spoofed bilibili hosts', () => {
  assert.equal(
    parseBilibiliLink('https://notbilibili.com/video/BV1xK4y1m7aA'),
    null
  )

  assert.equal(
    parseBilibiliLink('https://bilibili.com.evil.example/video/BV1xK4y1m7aA'),
    null
  )
})

test('normalizeBilibiliParsedLink preserves candidate items and explicit selection', () => {
  assert.deepEqual(
    toPlain(normalizeBilibiliParsedLink({
      kind: 'video',
      bvid: 'BV1xK4y1m7aA',
      items: [
        {
          kind: 'page',
          page: 1
        },
        {
          kind: 'page',
          page: 3,
          title: '  Demo P3  '
        }
      ],
      selectedItemId: 'page:3',
      title: '  Demo Video  ',
      coverUrl: '  '
    })),
    {
      kind: 'video',
      bvid: 'BV1xK4y1m7aA',
      title: 'Demo Video',
      coverUrl: null,
      items: [
        {
          id: 'page:1',
          kind: 'page',
          title: 'P1',
          page: 1
        },
        {
          id: 'page:3',
          kind: 'page',
          title: 'Demo P3',
          page: 3
        }
      ],
      selectedItemId: 'page:3'
    }
  )
})

test('normalizeBilibiliParsedLink rejects incomplete selectable input', () => {
  assert.throws(
    () => normalizeBilibiliParsedLink({
      kind: 'episode',
      items: []
    }),
    /Episode links must include epId/
  )

  assert.throws(
    () => normalizeBilibiliParsedLink({
      kind: 'video',
      bvid: 'BV1xK4y1m7aA',
      items: [
        {
          kind: 'page'
        }
      ]
    }),
    /Page items must include a page number/
  )

  assert.throws(
    () => normalizeBilibiliParsedLink({
      kind: 'video',
      bvid: 'BV1xK4y1m7aA',
      items: [
        {
          kind: 'page',
          page: 1
        }
      ],
      selectedItemId: 'page:9'
    }),
    /Selected item must be one of the selectable items/
  )
})

test('normalizeBilibiliDownloaderSelection keeps export mode only', () => {
  assert.deepEqual(
    toPlain(normalizeBilibiliDownloaderSelection({
      exportMode: 'merge-mp4'
    })),
    {
      exportMode: 'merge-mp4'
    }
  )
})

test('buildStreamOptionSummary disables MP4 merge when audio or video is missing', () => {
  const missingAudio = buildStreamOptionSummary({
    hasAudio: false,
    hasVideo: true
  })

  assert.equal(missingAudio.mergeMp4.available, false)
  assert.equal(missingAudio.mergeMp4.disabledReason, 'MP4 合并需要同时具备音频和视频流')

  const missingVideo = buildStreamOptionSummary({
    hasAudio: true,
    hasVideo: false
  })

  assert.equal(missingVideo.mergeMp4.available, false)
  assert.equal(missingVideo.mergeMp4.disabledReason, 'MP4 合并需要同时具备音频和视频流')
})

test('createDefaultBilibiliDownloaderState returns a parse-and-selection oriented state', () => {
  const state = toPlain(createDefaultBilibiliDownloaderState())

  assert.deepEqual(state, {
    loginSession: {
      isLoggedIn: false,
      nickname: null,
      avatarUrl: null,
      expiresAt: null
    },
    parsedLink: null,
    selection: {
      exportMode: null
    },
    streamOptionSummary: null,
    taskStage: 'idle',
    error: null
  })

  assert.equal(BilibiliDownloaderStateSchema.parse(state).selection.exportMode, null)
})

test('cancelled is part of the shared downloader stage contract and schema', () => {
  assert.equal(BILIBILI_DOWNLOAD_STAGE_VALUES.includes('cancelled'), true)

  const state = {
    ...createDefaultBilibiliDownloaderState(),
    taskStage: 'cancelled'
  }

  assert.equal(BilibiliDownloaderStateSchema.parse(state).taskStage, 'cancelled')
})

test('parsed link schema accepts selectable items', () => {
  const parsedLink = parseBilibiliLink('https://www.bilibili.com/video/BV1xK4y1m7aA?p=1')
  assert.deepEqual(toPlain(BilibiliParsedLinkSchema.parse(parsedLink)), toPlain(parsedLink))
})

test('parsed link schema rejects impossible selectable states', () => {
  assert.equal(
    BilibiliParsedLinkSchema.safeParse({
      kind: 'episode',
      title: null,
      coverUrl: null,
      items: [
        {
          id: 'episode:ep123456',
          kind: 'episode',
          title: 'EP ep123456',
          epId: 'ep123456'
        }
      ],
      selectedItemId: 'episode:ep123456'
    }).success,
    false
  )

  assert.equal(
    BilibiliParsedLinkSchema.safeParse({
      kind: 'season',
      seasonId: 'ss98765',
      title: null,
      coverUrl: null,
      items: [
        {
          id: 'season:ss98765',
          kind: 'season',
          title: 'SS ss98765'
        }
      ],
      selectedItemId: 'season:ss98765'
    }).success,
    false
  )

  assert.equal(
    BilibiliParsedLinkSchema.safeParse({
      kind: 'video',
      bvid: 'BV1xK4y1m7aA',
      title: null,
      coverUrl: null,
      items: [],
      selectedItemId: 'page:1'
    }).success,
    false
  )

  assert.equal(
    BilibiliParsedLinkSchema.safeParse({
      kind: 'video',
      bvid: 'BV1xK4y1m7aA',
      page: 1,
      title: null,
      coverUrl: null,
      items: [
        {
          id: 'page:1',
          kind: 'page',
          title: 'P1'
        }
      ],
      selectedItemId: 'page:9'
    }).success,
    false
  )
})
