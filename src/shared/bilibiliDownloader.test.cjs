const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildStreamOptionSummary,
  createDefaultBilibiliDownloaderState,
  normalizeBilibiliDownloadItem,
  parseBilibiliLink
} = require('./bilibiliDownloader.ts')

test('parseBilibiliLink recognizes BV video and bangumi links', () => {
  assert.deepEqual(
    parseBilibiliLink('https://www.bilibili.com/video/BV1xK4y1m7aA?p=3'),
    {
      kind: 'video',
      bvid: 'BV1xK4y1m7aA',
      page: 3
    }
  )

  assert.deepEqual(
    parseBilibiliLink('https://www.bilibili.com/bangumi/play/ep123456'),
    {
      kind: 'episode',
      epId: 'ep123456'
    }
  )

  assert.deepEqual(
    parseBilibiliLink('https://www.bilibili.com/bangumi/play/ss98765'),
    {
      kind: 'season',
      seasonId: 'ss98765'
    }
  )
})

test('normalizeBilibiliDownloadItem fills defaults and trims text fields', () => {
  assert.deepEqual(
    normalizeBilibiliDownloadItem({
      id: '  BV1xK4y1m7aA:p=3  ',
      title: '  Demo Video  ',
      kind: 'video',
      page: 3,
      exportMode: 'merge-mp4',
      stage: 'downloading-video'
    }),
    {
      id: 'BV1xK4y1m7aA:p=3',
      title: 'Demo Video',
      kind: 'video',
      page: 3,
      exportMode: 'merge-mp4',
      stage: 'downloading-video'
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

test('createDefaultBilibiliDownloaderState returns an idle empty state', () => {
  assert.deepEqual(createDefaultBilibiliDownloaderState(), {
    loginSession: {
      isLoggedIn: false,
      nickname: null,
      avatarUrl: null,
      expiresAt: null
    },
    parsedLink: null,
    streamOptionSummary: null,
    downloadItem: null,
    taskStage: 'idle',
    error: null
  })
})
