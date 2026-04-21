const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildStreamOptionSummary,
  createDefaultBilibiliDownloaderState,
  normalizeBilibiliDownloaderSelection,
  normalizeBilibiliParsedLink,
  parseBilibiliLink
} = require('./bilibiliDownloader.ts')

const {
  BilibiliDownloaderStateSchema,
  BilibiliParsedLinkSchema
} = require('./ipc-schemas.ts')

test('parseBilibiliLink recognizes BV video and bangumi links with selectable items', () => {
  assert.deepEqual(
    parseBilibiliLink('https://www.bilibili.com/video/BV1xK4y1m7aA?p=3'),
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
    parseBilibiliLink('https://www.bilibili.com/bangumi/play/ep123456'),
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
    parseBilibiliLink('https://www.bilibili.com/bangumi/play/ss98765'),
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

test('normalizeBilibiliParsedLink preserves candidate items and explicit selection', () => {
  assert.deepEqual(
    normalizeBilibiliParsedLink({
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
    }),
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

test('normalizeBilibiliDownloaderSelection keeps explicit item selection and export mode', () => {
  assert.deepEqual(
    normalizeBilibiliDownloaderSelection({
      selectedItemId: 'page:3',
      exportMode: 'merge-mp4'
    }),
    {
      selectedItemId: 'page:3',
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
  const state = createDefaultBilibiliDownloaderState()

  assert.deepEqual(state, {
    loginSession: {
      isLoggedIn: false,
      nickname: null,
      avatarUrl: null,
      expiresAt: null
    },
    parsedLink: null,
    selection: {
      selectedItemId: null,
      exportMode: null
    },
    streamOptionSummary: null,
    taskStage: 'idle',
    error: null
  })

  assert.equal(BilibiliDownloaderStateSchema.parse(state).selection.selectedItemId, null)
})

test('parsed link schema accepts selectable items', () => {
  const parsedLink = parseBilibiliLink('https://www.bilibili.com/video/BV1xK4y1m7aA?p=1')
  assert.deepEqual(BilibiliParsedLinkSchema.parse(parsedLink), parsedLink)
})
