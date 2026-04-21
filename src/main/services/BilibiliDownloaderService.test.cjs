const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function createFsMock(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles))
  const directories = new Set()

  return {
    existsSync(filePath) {
      return files.has(filePath) || directories.has(filePath)
    },
    mkdirSync(filePath) {
      directories.add(filePath)
      return undefined
    },
    readFileSync(filePath) {
      if (!files.has(filePath)) {
        throw new Error(`ENOENT: ${filePath}`)
      }

      return files.get(filePath)
    },
    unlinkSync(filePath) {
      files.delete(filePath)
    },
    renameSync(fromPath, toPath) {
      if (!files.has(fromPath)) {
        throw new Error(`ENOENT: ${fromPath}`)
      }

      files.set(toPath, files.get(fromPath))
      files.delete(fromPath)
    },
    promises: {
      async writeFile(filePath, content) {
        files.set(filePath, content)
      },
      async mkdir(filePath) {
        directories.add(filePath)
      },
      async rm(targetPath, options = {}) {
        const recursive = Boolean(options.recursive)
        const force = Boolean(options.force)
        const normalizedPrefix = recursive ? `${targetPath}\\` : null

        if (recursive && normalizedPrefix) {
          files.delete(targetPath)
          directories.delete(targetPath)

          for (const filePath of [...files.keys()]) {
            if (filePath.startsWith(normalizedPrefix)) {
              files.delete(filePath)
            }
          }

          for (const directoryPath of [...directories]) {
            if (directoryPath === targetPath || directoryPath.startsWith(normalizedPrefix)) {
              directories.delete(directoryPath)
            }
          }

          return
        }

        if (files.delete(targetPath) || directories.delete(targetPath)) {
          return
        }

        if (!force) {
          throw new Error(`ENOENT: ${targetPath}`)
        }
      }
    },
    files,
    directories
  }
}

function createFetchResponse(body) {
  return {
    ok: true,
    status: 200,
    async json() {
      return body
    }
  }
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value))
}

function createDownloadFixtureFetch({ metadataPayload, playPayload }) {
  return async (url) => {
    const normalizedUrl = String(url)

    if (normalizedUrl.includes('/x/web-interface/view') || normalizedUrl.includes('/pgc/view/web/season')) {
      return createFetchResponse(metadataPayload)
    }

    if (normalizedUrl.includes('/x/player/playurl') || normalizedUrl.includes('/pgc/player/web/playurl')) {
      return createFetchResponse(playPayload)
    }

    throw new Error(`Unexpected fetch url: ${normalizedUrl}`)
  }
}

function loadBilibiliDownloaderServiceModule(overrides = {}) {
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
      if (specifier === 'electron') {
        return overrides.electronModule || {
          app: {
            getPath: () => 'C:\\Users\\Test\\AppData\\Roaming\\onetool'
          }
        }
      }

      if (specifier === 'fs') {
        return overrides.fsModule || createFsMock()
      }

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
        Buffer,
        URL,
        URLSearchParams,
        AbortController,
        AbortSignal,
        setTimeout,
        clearTimeout
      },
      { filename: filePath }
    )

    cache.set(filePath, module.exports)
    return module.exports
  }

  return executeModule(path.join(__dirname, 'BilibiliDownloaderService.ts'))
}

test('bootstrapQrLogin returns QR metadata and leaves login session logged out', async () => {
  const fetchCalls = []
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule()
  const service = new BilibiliDownloaderService({
    fetch: async (url) => {
      fetchCalls.push(url)
      return createFetchResponse({
        code: 0,
        data: {
          url: 'https://passport.bilibili.com/h5-app/passport/login/scan',
          qrcode_key: 'qr-auth-token'
        }
      })
    }
  })

  const stateChanges = []
  service.onStateChanged((state) => {
    stateChanges.push(state)
  })

  const result = await service.bootstrapQrLogin()

  assert.equal(result.success, true)
  assert.deepEqual(toPlain(result.data), {
    qrUrl: 'https://passport.bilibili.com/h5-app/passport/login/scan',
    authCode: 'qr-auth-token'
  })
  assert.equal(fetchCalls.length, 1)
  assert.deepEqual(toPlain(service.getState().loginSession), {
    isLoggedIn: false,
    nickname: null,
    avatarUrl: null,
    expiresAt: null
  })
  assert.equal(stateChanges.length, 0)
})

test('pollLogin persists a confirmed session and loadSession restores it', async () => {
  const sessionPath = 'C:\\Users\\Test\\AppData\\Roaming\\onetool\\bilibili-downloader-session.json'
  const fsMock = createFsMock()
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule({
    fsModule: fsMock
  })

  let callCount = 0
  const fetch = async () => {
    callCount += 1

    if (callCount === 1) {
      return createFetchResponse({
        code: 0,
        data: {
          url: 'https://passport.bilibili.com/h5-app/passport/login/scan',
          qrcode_key: 'qr-auth-token'
        }
      })
    }

    return createFetchResponse({
      code: 0,
      data: {
        code: 0,
        status: 'confirmed',
        refresh_token: 'refresh-token',
        cookie_info: {
          cookies: [
            {
              name: 'SESSDATA',
              value: 'sess-token'
            },
            {
              name: 'bili_jct',
              value: 'csrf-token'
            }
          ]
        },
        url: 'https://passport.bilibili.com/login/success',
        user_info: {
          uname: 'Test User',
          face: 'https://i0.hdslb.com/avatar.jpg'
        },
        expires_at: '2099-01-01T00:00:00.000Z'
      }
    })
  }

  const service = new BilibiliDownloaderService({ fetch, fs: fsMock })
  await service.bootstrapQrLogin()

  const pollResult = await service.pollLogin()

  assert.equal(pollResult.success, true)
  assert.deepEqual(toPlain(service.getState().loginSession), {
    isLoggedIn: true,
    nickname: 'Test User',
    avatarUrl: 'https://i0.hdslb.com/avatar.jpg',
    expiresAt: '2099-01-01T00:00:00.000Z'
  })
  assert.equal(fsMock.files.has(sessionPath), true)
  assert.deepEqual(
    JSON.parse(fsMock.files.get(sessionPath)),
    {
      loginSession: {
        isLoggedIn: true,
        nickname: 'Test User',
        avatarUrl: 'https://i0.hdslb.com/avatar.jpg',
        expiresAt: '2099-01-01T00:00:00.000Z'
      },
      auth: {
        sessData: 'sess-token',
        biliJct: 'csrf-token',
        refreshToken: 'refresh-token'
      },
      source: 'current'
    }
  )

  const restored = new BilibiliDownloaderService({ fs: fsMock })
  const loadResult = restored.loadSession()

  assert.equal(loadResult.success, true)
  assert.deepEqual(toPlain(restored.getState().loginSession), {
    isLoggedIn: true,
    nickname: 'Test User',
    avatarUrl: 'https://i0.hdslb.com/avatar.jpg',
    expiresAt: '2099-01-01T00:00:00.000Z'
  })
  assert.deepEqual(toPlain(restored.getAuthSession()), {
    sessData: 'sess-token',
    biliJct: 'csrf-token',
    refreshToken: 'refresh-token'
  })
})

test('logout clears persisted session and emits logged-out state once', async () => {
  const sessionPath = 'C:\\Users\\Test\\AppData\\Roaming\\onetool\\bilibili-downloader-session.json'
  const fsMock = createFsMock({
    [sessionPath]: JSON.stringify({
      loginSession: {
        isLoggedIn: true,
        nickname: 'Persisted User',
        avatarUrl: 'https://i0.hdslb.com/avatar.jpg',
        expiresAt: '2099-01-01T00:00:00.000Z'
      },
      auth: {
        sessData: 'sess-token',
        biliJct: 'csrf-token',
        refreshToken: 'refresh-token'
      }
    })
  })
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule({
    fsModule: fsMock
  })
  const service = new BilibiliDownloaderService({ fs: fsMock })
  service.loadSession()

  const stateChanges = []
  const unsubscribe = service.onStateChanged((state) => {
    stateChanges.push(state.loginSession)
  })

  const result = await service.logout()
  unsubscribe()

  assert.equal(result.success, true)
  assert.equal(fsMock.files.has(sessionPath), false)
  assert.deepEqual(toPlain(service.getState().loginSession), {
    isLoggedIn: false,
    nickname: null,
    avatarUrl: null,
    expiresAt: null
  })
  assert.deepEqual(toPlain(stateChanges), [
    {
      isLoggedIn: false,
      nickname: null,
      avatarUrl: null,
      expiresAt: null
    }
  ])
})

test('pollLogin clears state and persistence when QR login expires', async () => {
  const sessionPath = 'C:\\Users\\Test\\AppData\\Roaming\\onetool\\bilibili-downloader-session.json'
  const fsMock = createFsMock({
    [sessionPath]: JSON.stringify({
      loginSession: {
        isLoggedIn: true,
        nickname: 'Old User',
        avatarUrl: 'https://i0.hdslb.com/old-avatar.jpg',
        expiresAt: '2099-01-01T00:00:00.000Z'
      },
      auth: {
        sessData: 'sess-token',
        biliJct: 'csrf-token',
        refreshToken: 'refresh-token'
      }
    })
  })
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule({
    fsModule: fsMock
  })

  let callCount = 0
  const service = new BilibiliDownloaderService({
    fs: fsMock,
    fetch: async () => {
      callCount += 1

      if (callCount === 1) {
        return createFetchResponse({
          code: 0,
          data: {
            url: 'https://passport.bilibili.com/h5-app/passport/login/scan',
            qrcode_key: 'qr-auth-token'
          }
        })
      }

      return createFetchResponse({
        code: 0,
        data: {
          code: 86038,
          status: 'expired'
        }
      })
    }
  })

  service.loadSession()

  const stateChanges = []
  service.onStateChanged((state) => {
    stateChanges.push(state.loginSession)
  })

  await service.bootstrapQrLogin()
  const result = await service.pollLogin()

  assert.equal(result.success, false)
  assert.equal(result.error, 'QR login expired')
  assert.equal(fsMock.files.has(sessionPath), false)
  assert.deepEqual(toPlain(service.getState().loginSession), {
    isLoggedIn: false,
    nickname: null,
    avatarUrl: null,
    expiresAt: null
  })
  assert.deepEqual(toPlain(stateChanges), [
    {
      isLoggedIn: false,
      nickname: null,
      avatarUrl: null,
      expiresAt: null
    }
  ])
})

test('pollLogin clears state and persistence when QR login response is invalid', async () => {
  const sessionPath = 'C:\\Users\\Test\\AppData\\Roaming\\onetool\\bilibili-downloader-session.json'
  const fsMock = createFsMock({
    [sessionPath]: JSON.stringify({
      loginSession: {
        isLoggedIn: true,
        nickname: 'Old User',
        avatarUrl: 'https://i0.hdslb.com/old-avatar.jpg',
        expiresAt: '2099-01-01T00:00:00.000Z'
      },
      auth: {
        sessData: 'sess-token',
        biliJct: 'csrf-token',
        refreshToken: 'refresh-token'
      }
    })
  })
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule({
    fsModule: fsMock
  })

  let callCount = 0
  const service = new BilibiliDownloaderService({
    fs: fsMock,
    fetch: async () => {
      callCount += 1

      if (callCount === 1) {
        return createFetchResponse({
          code: 0,
          data: {
            url: 'https://passport.bilibili.com/h5-app/passport/login/scan',
            qrcode_key: 'qr-auth-token'
          }
        })
      }

      return createFetchResponse({
        code: 0,
        data: {
          code: 12345,
          status: 'unexpected-status'
        }
      })
    }
  })

  service.loadSession()
  await service.bootstrapQrLogin()

  const result = await service.pollLogin()

  assert.equal(result.success, false)
  assert.equal(result.error, 'Bilibili login status was invalid')
  assert.equal(fsMock.files.has(sessionPath), false)
  assert.deepEqual(toPlain(service.getState().loginSession), {
    isLoggedIn: false,
    nickname: null,
    avatarUrl: null,
    expiresAt: null
  })
})

test('loadSession clears expired persisted login sessions', () => {
  const sessionPath = 'C:\\Users\\Test\\AppData\\Roaming\\onetool\\bilibili-downloader-session.json'
  const fsMock = createFsMock({
    [sessionPath]: JSON.stringify({
      loginSession: {
        isLoggedIn: true,
        nickname: 'Expired User',
        avatarUrl: 'https://i0.hdslb.com/avatar.jpg',
        expiresAt: '2020-01-01T00:00:00.000Z'
      },
      auth: {
        sessData: 'sess-token',
        biliJct: 'csrf-token',
        refreshToken: 'refresh-token'
      }
    })
  })
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule({
    fsModule: fsMock
  })
  const service = new BilibiliDownloaderService({
    fs: fsMock,
    now: () => Date.parse('2026-04-21T00:00:00.000Z')
  })

  const result = service.loadSession()

  assert.equal(result.success, false)
  assert.equal(result.error, 'Stored Bilibili session expired')
  assert.equal(fsMock.files.has(sessionPath), false)
  assert.deepEqual(toPlain(service.getState().loginSession), {
    isLoggedIn: false,
    nickname: null,
    avatarUrl: null,
    expiresAt: null
  })
})

test('loadSession migrates legacy persisted login metadata into a reauthentication-required state', () => {
  const sessionPath = 'C:\\Users\\Test\\AppData\\Roaming\\onetool\\bilibili-downloader-session.json'
  const legacyPayload = {
    isLoggedIn: true,
    nickname: 'Legacy User',
    avatarUrl: 'https://i0.hdslb.com/legacy-avatar.jpg',
    expiresAt: '2099-01-01T00:00:00.000Z'
  }
  const fsMock = createFsMock({
    [sessionPath]: JSON.stringify(legacyPayload)
  })
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule({
    fsModule: fsMock
  })
  const service = new BilibiliDownloaderService({ fs: fsMock })

  const result = service.loadSession()

  assert.equal(result.success, false)
  assert.equal(result.error, 'Stored Bilibili session requires re-authentication')
  assert.equal(service.getAuthSession(), null)
  assert.equal(fsMock.files.has(sessionPath), true)
  assert.deepEqual(toPlain(service.getState().loginSession), {
    isLoggedIn: false,
    nickname: 'Legacy User',
    avatarUrl: 'https://i0.hdslb.com/legacy-avatar.jpg',
    expiresAt: '2099-01-01T00:00:00.000Z'
  })
})

test('loadSession treats malformed persisted payloads as invalid login state', () => {
  const sessionPath = 'C:\\Users\\Test\\AppData\\Roaming\\onetool\\bilibili-downloader-session.json'
  const fsMock = createFsMock({
    [sessionPath]: '{not-valid-json'
  })
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule({
    fsModule: fsMock
  })
  const service = new BilibiliDownloaderService({ fs: fsMock })

  const result = service.loadSession()

  assert.equal(result.success, false)
  assert.equal(result.error, 'Stored Bilibili session is invalid')
  assert.equal(fsMock.files.has(sessionPath), false)
  assert.deepEqual(toPlain(service.getState().loginSession), {
    isLoggedIn: false,
    nickname: null,
    avatarUrl: null,
    expiresAt: null
  })
})

test('loadSession rejects persisted sessions with malformed expiresAt strings', () => {
  const sessionPath = 'C:\\Users\\Test\\AppData\\Roaming\\onetool\\bilibili-downloader-session.json'
  const fsMock = createFsMock({
    [sessionPath]: JSON.stringify({
      loginSession: {
        isLoggedIn: true,
        nickname: 'Broken User',
        avatarUrl: 'https://i0.hdslb.com/avatar.jpg',
        expiresAt: 'not-a-date'
      },
      auth: {
        sessData: 'sess-token',
        biliJct: 'csrf-token',
        refreshToken: 'refresh-token'
      }
    })
  })
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule({
    fsModule: fsMock
  })
  const service = new BilibiliDownloaderService({ fs: fsMock })

  const result = service.loadSession()

  assert.equal(result.success, false)
  assert.equal(result.error, 'Stored Bilibili session is invalid')
  assert.equal(fsMock.files.has(sessionPath), false)
  assert.equal(service.getAuthSession(), null)
  assert.deepEqual(toPlain(service.getState().loginSession), {
    isLoggedIn: false,
    nickname: null,
    avatarUrl: null,
    expiresAt: null
  })
})

test('parseLink rejects unsupported links with a clear error', async () => {
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule()
  const service = new BilibiliDownloaderService()

  const result = await service.parseLink({
    url: 'https://example.com/watch?v=123'
  })

  assert.equal(result.success, false)
  assert.equal(result.error, 'Unsupported Bilibili link')
  assert.equal(service.getState().parsedLink, null)
  assert.equal(service.getState().streamOptionSummary, null)
  assert.equal(service.getState().selection.exportMode, null)
})

test('parseLink returns page items for multi-page videos', async () => {
  const fetchCalls = []
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule()
  const service = new BilibiliDownloaderService({
    fetch: async (url) => {
      fetchCalls.push(url)
      return createFetchResponse({
        code: 0,
        data: {
          bvid: 'BV1xK4y1m7aA',
          title: 'Multi Page Demo',
          pic: 'https://i0.hdslb.com/video-cover.jpg',
          pages: [
            {
              page: 1,
              part: 'Opening',
              cid: 111
            },
            {
              page: 2,
              part: 'Main Part',
              cid: 222
            },
            {
              page: 3,
              part: 'Ending',
              cid: 333
            }
          ]
        }
      })
    }
  })

  const result = await service.parseLink({
    url: 'https://www.bilibili.com/video/BV1xK4y1m7aA?p=2'
  })

  assert.equal(result.success, true)
  assert.deepEqual(toPlain(result.data), {
    kind: 'video',
    bvid: 'BV1xK4y1m7aA',
    page: 2,
    title: 'Multi Page Demo',
    coverUrl: 'https://i0.hdslb.com/video-cover.jpg',
    items: [
      {
        id: 'page:1',
        kind: 'page',
        title: 'Opening',
        page: 1
      },
      {
        id: 'page:2',
        kind: 'page',
        title: 'Main Part',
        page: 2
      },
      {
        id: 'page:3',
        kind: 'page',
        title: 'Ending',
        page: 3
      }
    ],
    selectedItemId: 'page:2'
  })
  assert.deepEqual(fetchCalls, [
    'https://api.bilibili.com/x/web-interface/view?bvid=BV1xK4y1m7aA'
  ])
  assert.deepEqual(toPlain(service.getState().parsedLink), toPlain(result.data))
  assert.equal(service.getState().streamOptionSummary, null)
  assert.equal(service.getState().selection.exportMode, null)
})

test('parseLink returns bangumi episode items and preserves selected episode', async () => {
  const fetchCalls = []
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule()
  const service = new BilibiliDownloaderService({
    fetch: async (url) => {
      fetchCalls.push(url)
      return createFetchResponse({
        code: 0,
        result: {
          season_title: 'Demo Bangumi',
          cover: 'https://i0.hdslb.com/bangumi-cover.jpg',
          episodes: [
            {
              id: 1001,
              cid: 9001,
              title: '1',
              long_title: 'Beginning'
            },
            {
              id: 1002,
              cid: 9002,
              title: '2',
              long_title: 'Climax'
            }
          ]
        }
      })
    }
  })

  const result = await service.parseLink({
    url: 'https://www.bilibili.com/bangumi/play/ep1002'
  })

  assert.equal(result.success, true)
  assert.deepEqual(toPlain(result.data), {
    kind: 'episode',
    epId: 'ep1002',
    title: 'Demo Bangumi',
    coverUrl: 'https://i0.hdslb.com/bangumi-cover.jpg',
    items: [
      {
        id: 'episode:ep1001',
        kind: 'episode',
        title: '1 Beginning',
        epId: 'ep1001'
      },
      {
        id: 'episode:ep1002',
        kind: 'episode',
        title: '2 Climax',
        epId: 'ep1002'
      }
    ],
    selectedItemId: 'episode:ep1002'
  })
  assert.deepEqual(fetchCalls, [
    'https://api.bilibili.com/pgc/view/web/season?ep_id=1002'
  ])
  assert.deepEqual(toPlain(service.getState().parsedLink), toPlain(result.data))
})

test('loadStreamOptions returns normalized qn options for a selected episode', async () => {
  const fetchCalls = []
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule()
  const service = new BilibiliDownloaderService({
    fetch: async (url) => {
      fetchCalls.push(url)

      if (String(url).includes('/pgc/view/web/season')) {
        return createFetchResponse({
          code: 0,
          result: {
            season_title: 'Demo Bangumi',
            cover: 'https://i0.hdslb.com/bangumi-cover.jpg',
            episodes: [
              {
                id: 1001,
                cid: 9001,
                title: '1',
                long_title: 'Beginning'
              },
              {
                id: 1002,
                cid: 9002,
                title: '2',
                long_title: 'Climax'
              }
            ]
          }
        })
      }

      return createFetchResponse({
        code: 0,
        result: {
          accept_quality: [120, 80],
          accept_description: ['4K', '1080P'],
          support_formats: [
            {
              quality: 120,
              new_description: '4K'
            },
            {
              quality: 80,
              new_description: '1080P'
            }
          ],
          dash: {
            video: [
              {
                id: 120,
                baseUrl: 'https://example.com/video-4k.m4s'
              },
              {
                id: 80,
                baseUrl: 'https://example.com/video-1080.m4s'
              }
            ],
            audio: []
          }
        }
      })
    }
  })

  await service.parseLink({
    url: 'https://www.bilibili.com/bangumi/play/ep1002'
  })

  const result = await service.loadStreamOptions({
    kind: 'episode',
    itemId: 'episode:ep1002'
  })

  assert.equal(result.success, true)
  assert.deepEqual(toPlain(result.data), {
    itemId: 'episode:ep1002',
    qnOptions: [
      {
        qn: 120,
        label: '4K',
        selected: true,
        available: true
      },
      {
        qn: 80,
        label: '1080P',
        selected: false,
        available: true
      }
    ],
    summary: {
      hasAudio: false,
      hasVideo: true,
      mergeMp4: {
        available: false,
        disabledReason: 'MP4 合并需要同时具备音频和视频流'
      },
      exportModes: {
        'video-only': {
          available: true,
          disabledReason: null
        },
        'audio-only': {
          available: false,
          disabledReason: '缺少音频流'
        },
        'split-streams': {
          available: false,
          disabledReason: '原始流分别下载需要同时具备音频和视频流'
        },
        'merge-mp4': {
          available: false,
          disabledReason: 'MP4 合并需要同时具备音频和视频流'
        }
      },
      availableExportModes: [
        'video-only'
      ]
    }
  })
  assert.deepEqual(fetchCalls, [
    'https://api.bilibili.com/pgc/view/web/season?ep_id=1002',
    'https://api.bilibili.com/pgc/player/web/playurl?ep_id=1002&cid=9002&fnval=4048&qn=120&fourk=1'
  ])
  assert.deepEqual(toPlain(service.getState().streamOptionSummary), toPlain(result.data.summary))
  assert.equal(service.getState().parsedLink.selectedItemId, 'episode:ep1002')
})

test('parseLink canonicalizes season links into selectable episode metadata', async () => {
  const fetchCalls = []
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule()
  const service = new BilibiliDownloaderService({
    fetch: async (url) => {
      fetchCalls.push(url)
      return createFetchResponse({
        code: 0,
        result: {
          season_title: 'Season Landing Page',
          cover: 'https://i0.hdslb.com/season-cover.jpg',
          episodes: [
            {
              id: 2001,
              cid: 9101,
              title: '1',
              long_title: 'Arrival'
            },
            {
              id: 2002,
              cid: 9102,
              title: '2',
              long_title: 'Decision'
            }
          ]
        }
      })
    }
  })

  const result = await service.parseLink({
    url: 'https://www.bilibili.com/bangumi/play/ss5555'
  })

  assert.equal(result.success, true)
  assert.deepEqual(toPlain(result.data), {
    kind: 'episode',
    epId: 'ep2001',
    title: 'Season Landing Page',
    coverUrl: 'https://i0.hdslb.com/season-cover.jpg',
    items: [
      {
        id: 'episode:ep2001',
        kind: 'episode',
        title: '1 Arrival',
        epId: 'ep2001'
      },
      {
        id: 'episode:ep2002',
        kind: 'episode',
        title: '2 Decision',
        epId: 'ep2002'
      }
    ],
    selectedItemId: 'episode:ep2001'
  })
  assert.deepEqual(fetchCalls, [
    'https://api.bilibili.com/pgc/view/web/season?season_id=5555'
  ])
  assert.deepEqual(toPlain(service.getState().parsedLink), toPlain(result.data))
})

test('loadStreamOptions loads a selected episode after parsing a season link', async () => {
  const fetchCalls = []
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule()
  const service = new BilibiliDownloaderService({
    fetch: async (url) => {
      fetchCalls.push(url)

      if (String(url).includes('/pgc/view/web/season')) {
        return createFetchResponse({
          code: 0,
          result: {
            season_title: 'Season Landing Page',
            cover: 'https://i0.hdslb.com/season-cover.jpg',
            episodes: [
              {
                id: 2001,
                cid: 9101,
                title: '1',
                long_title: 'Arrival'
              },
              {
                id: 2002,
                cid: 9102,
                title: '2',
                long_title: 'Decision'
              }
            ]
          }
        })
      }

      return createFetchResponse({
        code: 0,
        result: {
          accept_quality: [80, 64],
          accept_description: ['1080P', '720P'],
          support_formats: [
            {
              quality: 80,
              new_description: '1080P'
            },
            {
              quality: 64,
              new_description: '720P'
            }
          ],
          dash: {
            video: [
              {
                id: 80,
                baseUrl: 'https://example.com/ep2002-video-1080.m4s'
              }
            ],
            audio: [
              {
                id: 30280,
                baseUrl: 'https://example.com/ep2002-audio.m4s'
              }
            ]
          }
        }
      })
    }
  })

  await service.parseLink({
    url: 'https://www.bilibili.com/bangumi/play/ss5555'
  })

  const result = await service.loadStreamOptions({
    kind: 'episode',
    itemId: 'episode:ep2002'
  })

  assert.equal(result.success, true)
  assert.deepEqual(toPlain(result.data), {
    itemId: 'episode:ep2002',
    qnOptions: [
      {
        qn: 80,
        label: '1080P',
        selected: true,
        available: true
      },
      {
        qn: 64,
        label: '720P',
        selected: false,
        available: true
      }
    ],
    summary: {
      hasAudio: true,
      hasVideo: true,
      mergeMp4: {
        available: true,
        disabledReason: null
      },
      exportModes: {
        'video-only': {
          available: true,
          disabledReason: null
        },
        'audio-only': {
          available: true,
          disabledReason: null
        },
        'split-streams': {
          available: true,
          disabledReason: null
        },
        'merge-mp4': {
          available: true,
          disabledReason: null
        }
      },
      availableExportModes: [
        'video-only',
        'audio-only',
        'split-streams',
        'merge-mp4'
      ]
    }
  })
  assert.deepEqual(fetchCalls, [
    'https://api.bilibili.com/pgc/view/web/season?season_id=5555',
    'https://api.bilibili.com/pgc/player/web/playurl?ep_id=2002&cid=9102&fnval=4048&qn=120&fourk=1'
  ])
  assert.equal(service.getState().parsedLink.kind, 'episode')
  assert.equal(service.getState().parsedLink.selectedItemId, 'episode:ep2002')
  assert.deepEqual(toPlain(service.getState().streamOptionSummary), toPlain(result.data.summary))
})

test('startDownload downloads a raw video stream into the output directory', async () => {
  const fsMock = createFsMock()
  const downloaded = []
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule({
    fsModule: fsMock
  })
  const service = new BilibiliDownloaderService({
    fs: fsMock,
    app: {
      getPath(name) {
        if (name === 'userData') {
          return 'C:\\Users\\Test\\AppData\\Roaming\\onetool'
        }

        if (name === 'downloads') {
          return 'C:\\Users\\Test\\Downloads'
        }

        throw new Error(`Unexpected app path request: ${name}`)
      }
    },
    fetch: createDownloadFixtureFetch({
      metadataPayload: {
        code: 0,
        data: {
          bvid: 'BV1xK4y1m7aA',
          title: 'Multi Page Demo',
          pic: 'https://i0.hdslb.com/video-cover.jpg',
          pages: [
            {
              page: 1,
              part: 'P1',
              cid: 111
            }
          ]
        }
      },
      playPayload: {
        code: 0,
        data: {
          accept_quality: [80],
          accept_description: ['1080P'],
          support_formats: [
            {
              quality: 80,
              new_description: '1080P'
            }
          ],
          dash: {
            video: [
              {
                id: 80,
                baseUrl: 'https://cdn.example.com/video-only.m4s'
              }
            ],
            audio: []
          }
        }
      }
    }),
    now: () => 1713657600000,
    downloadBinary: async ({ url, destinationPath }) => {
      downloaded.push({ url, destinationPath })
      await fsMock.promises.writeFile(destinationPath, Buffer.from(`payload:${url}`))
    }
  })

  await service.parseLink({
    url: 'https://www.bilibili.com/video/BV1xK4y1m7aA'
  })

  await service.loadStreamOptions({
    kind: 'video',
    itemId: 'page:1'
  })

  const result = await service.startDownload({
    exportMode: 'video-only'
  })

  assert.equal(result.success, true)
  assert.equal(service.getState().taskStage, 'completed')
  assert.equal(service.getState().selection.exportMode, 'video-only')
  assert.deepEqual(downloaded, [
    {
      url: 'https://cdn.example.com/video-only.m4s',
      destinationPath: 'C:\\Users\\Test\\AppData\\Roaming\\onetool\\bilibili-downloader\\tasks\\1713657600000\\video-track.m4s'
    }
  ])
  assert.equal(
    fsMock.files.get('C:\\Users\\Test\\Downloads\\Multi Page Demo - P1.video.m4s').toString(),
    'payload:https://cdn.example.com/video-only.m4s'
  )
  assert.equal(fsMock.files.has('C:\\Users\\Test\\AppData\\Roaming\\onetool\\bilibili-downloader\\tasks\\1713657600000\\video-track.m4s'), false)
})

test('startDownload merges dash video and audio into an mp4 via ffmpeg', async () => {
  const fsMock = createFsMock()
  const ffmpegCalls = []
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule({
    fsModule: fsMock
  })
  const service = new BilibiliDownloaderService({
    fs: fsMock,
    app: {
      getPath(name) {
        if (name === 'userData') {
          return 'C:\\Users\\Test\\AppData\\Roaming\\onetool'
        }

        if (name === 'downloads') {
          return 'C:\\Users\\Test\\Downloads'
        }

        throw new Error(`Unexpected app path request: ${name}`)
      }
    },
    fetch: createDownloadFixtureFetch({
      metadataPayload: {
        code: 0,
        result: {
          season_title: 'Demo Bangumi',
          cover: 'https://i0.hdslb.com/bangumi-cover.jpg',
          episodes: [
            {
              id: 1002,
              cid: 9002,
              title: '2',
              long_title: 'Climax'
            }
          ]
        }
      },
      playPayload: {
        code: 0,
        result: {
          accept_quality: [80],
          accept_description: ['1080P'],
          support_formats: [
            {
              quality: 80,
              new_description: '1080P'
            }
          ],
          dash: {
            video: [
              {
                id: 80,
                baseUrl: 'https://cdn.example.com/video.m4s'
              }
            ],
            audio: [
              {
                id: 30280,
                baseUrl: 'https://cdn.example.com/audio.m4s'
              }
            ]
          }
        }
      }
    }),
    now: () => 1713657600001,
    downloadBinary: async ({ url, destinationPath }) => {
      await fsMock.promises.writeFile(destinationPath, Buffer.from(`payload:${url}`))
    },
    getFfmpegPath: () => 'C:\\ffmpeg\\bin\\ffmpeg.exe',
    runFfmpeg: async (input) => {
      ffmpegCalls.push(input)
      await fsMock.promises.writeFile(input.outputPath, Buffer.from('merged-mp4'))
    }
  })

  await service.parseLink({
    url: 'https://www.bilibili.com/bangumi/play/ep1002'
  })

  await service.loadStreamOptions({
    kind: 'episode',
    itemId: 'episode:ep1002'
  })

  const result = await service.startDownload({
    exportMode: 'merge-mp4'
  })

  assert.equal(result.success, true)
  assert.equal(service.getState().taskStage, 'completed')
  assert.deepEqual(toPlain(ffmpegCalls), [
    {
      ffmpegPath: 'C:\\ffmpeg\\bin\\ffmpeg.exe',
      videoPath: 'C:\\Users\\Test\\AppData\\Roaming\\onetool\\bilibili-downloader\\tasks\\1713657600001\\video-track.m4s',
      audioPath: 'C:\\Users\\Test\\AppData\\Roaming\\onetool\\bilibili-downloader\\tasks\\1713657600001\\audio-track.m4s',
      outputPath: 'C:\\Users\\Test\\Downloads\\Demo Bangumi - 2 Climax.mp4'
    }
  ])
  assert.equal(fsMock.files.get('C:\\Users\\Test\\Downloads\\Demo Bangumi - 2 Climax.mp4').toString(), 'merged-mp4')
  assert.equal(fsMock.files.has('C:\\Users\\Test\\AppData\\Roaming\\onetool\\bilibili-downloader\\tasks\\1713657600001\\video-track.m4s'), false)
  assert.equal(fsMock.files.has('C:\\Users\\Test\\AppData\\Roaming\\onetool\\bilibili-downloader\\tasks\\1713657600001\\audio-track.m4s'), false)
})

test('cancelDownload aborts an active download and marks the task as cancelled', async () => {
  const fsMock = createFsMock()
  const abortSignals = []
  const downloadStarted = []
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule({
    fsModule: fsMock
  })
  const service = new BilibiliDownloaderService({
    fs: fsMock,
    app: {
      getPath(name) {
        if (name === 'userData') {
          return 'C:\\Users\\Test\\AppData\\Roaming\\onetool'
        }

        if (name === 'downloads') {
          return 'C:\\Users\\Test\\Downloads'
        }

        throw new Error(`Unexpected app path request: ${name}`)
      }
    },
    fetch: createDownloadFixtureFetch({
      metadataPayload: {
        code: 0,
        result: {
          season_title: 'Demo Bangumi',
          cover: 'https://i0.hdslb.com/bangumi-cover.jpg',
          episodes: [
            {
              id: 1002,
              cid: 9002,
              title: '2',
              long_title: 'Climax'
            }
          ]
        }
      },
      playPayload: {
        code: 0,
        result: {
          accept_quality: [80],
          accept_description: ['1080P'],
          support_formats: [
            {
              quality: 80,
              new_description: '1080P'
            }
          ],
          dash: {
            video: [
              {
                id: 80,
                baseUrl: 'https://cdn.example.com/video.m4s'
              }
            ],
            audio: [
              {
                id: 30280,
                baseUrl: 'https://cdn.example.com/audio.m4s'
              }
            ]
          }
        }
      }
    }),
    now: () => 1713657600002,
    downloadBinary: ({ url, destinationPath, signal }) => {
      downloadStarted.push({ url, destinationPath })
      abortSignals.push(signal)

      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new Error('aborted'))
        })
      })
    }
  })

  await service.parseLink({
    url: 'https://www.bilibili.com/bangumi/play/ep1002'
  })

  await service.loadStreamOptions({
    kind: 'episode',
    itemId: 'episode:ep1002'
  })

  const downloadPromise = service.startDownload({
    exportMode: 'merge-mp4'
  })

  assert.equal(downloadStarted.length, 1)
  assert.equal(abortSignals[0].aborted, false)

  const cancelResult = service.cancelDownload()
  const result = await downloadPromise

  assert.equal(cancelResult.success, true)
  assert.equal(abortSignals[0].aborted, true)
  assert.equal(result.success, false)
  assert.equal(result.error, 'Download cancelled')
  assert.equal(service.getState().taskStage, 'cancelled')
  assert.equal(service.getState().error, null)
})

test('startDownload keeps raw streams when mp4 merge fails', async () => {
  const fsMock = createFsMock()
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule({
    fsModule: fsMock
  })
  const service = new BilibiliDownloaderService({
    fs: fsMock,
    app: {
      getPath(name) {
        if (name === 'userData') {
          return 'C:\\Users\\Test\\AppData\\Roaming\\onetool'
        }

        if (name === 'downloads') {
          return 'C:\\Users\\Test\\Downloads'
        }

        throw new Error(`Unexpected app path request: ${name}`)
      }
    },
    fetch: createDownloadFixtureFetch({
      metadataPayload: {
        code: 0,
        result: {
          season_title: 'Demo Bangumi',
          cover: 'https://i0.hdslb.com/bangumi-cover.jpg',
          episodes: [
            {
              id: 1002,
              cid: 9002,
              title: '2',
              long_title: 'Climax'
            }
          ]
        }
      },
      playPayload: {
        code: 0,
        result: {
          accept_quality: [80],
          accept_description: ['1080P'],
          support_formats: [
            {
              quality: 80,
              new_description: '1080P'
            }
          ],
          dash: {
            video: [
              {
                id: 80,
                baseUrl: 'https://cdn.example.com/video.m4s'
              }
            ],
            audio: [
              {
                id: 30280,
                baseUrl: 'https://cdn.example.com/audio.m4s'
              }
            ]
          }
        }
      }
    }),
    now: () => 1713657600003,
    downloadBinary: async ({ url, destinationPath }) => {
      await fsMock.promises.writeFile(destinationPath, Buffer.from(`payload:${url}`))
    },
    getFfmpegPath: () => 'C:\\ffmpeg\\bin\\ffmpeg.exe',
    runFfmpeg: async () => {
      throw new Error('ffmpeg merge failed')
    }
  })

  await service.parseLink({
    url: 'https://www.bilibili.com/bangumi/play/ep1002'
  })

  await service.loadStreamOptions({
    kind: 'episode',
    itemId: 'episode:ep1002'
  })

  const result = await service.startDownload({
    exportMode: 'merge-mp4'
  })

  assert.equal(result.success, false)
  assert.equal(result.error, 'ffmpeg merge failed')
  assert.equal(service.getState().taskStage, 'failed')
  assert.equal(
    fsMock.files.get('C:\\Users\\Test\\AppData\\Roaming\\onetool\\bilibili-downloader\\tasks\\1713657600003\\video-track.m4s').toString(),
    'payload:https://cdn.example.com/video.m4s'
  )
  assert.equal(
    fsMock.files.get('C:\\Users\\Test\\AppData\\Roaming\\onetool\\bilibili-downloader\\tasks\\1713657600003\\audio-track.m4s').toString(),
    'payload:https://cdn.example.com/audio.m4s'
  )
  assert.equal(fsMock.files.has('C:\\Users\\Test\\Downloads\\Demo Bangumi - 2 Climax.mp4'), false)
})

test('startDownload keeps raw streams when ffmpeg is unavailable before merge starts', async () => {
  const fsMock = createFsMock()
  const { BilibiliDownloaderService } = loadBilibiliDownloaderServiceModule({
    fsModule: fsMock
  })
  const service = new BilibiliDownloaderService({
    fs: fsMock,
    app: {
      getPath(name) {
        if (name === 'userData') {
          return 'C:\\Users\\Test\\AppData\\Roaming\\onetool'
        }

        if (name === 'downloads') {
          return 'C:\\Users\\Test\\Downloads'
        }

        throw new Error(`Unexpected app path request: ${name}`)
      }
    },
    fetch: createDownloadFixtureFetch({
      metadataPayload: {
        code: 0,
        result: {
          season_title: 'Demo Bangumi',
          cover: 'https://i0.hdslb.com/bangumi-cover.jpg',
          episodes: [
            {
              id: 1002,
              cid: 9002,
              title: '2',
              long_title: 'Climax'
            }
          ]
        }
      },
      playPayload: {
        code: 0,
        result: {
          accept_quality: [80],
          accept_description: ['1080P'],
          support_formats: [
            {
              quality: 80,
              new_description: '1080P'
            }
          ],
          dash: {
            video: [
              {
                id: 80,
                baseUrl: 'https://cdn.example.com/video.m4s'
              }
            ],
            audio: [
              {
                id: 30280,
                baseUrl: 'https://cdn.example.com/audio.m4s'
              }
            ]
          }
        }
      }
    }),
    now: () => 1713657600004,
    downloadBinary: async ({ url, destinationPath }) => {
      await fsMock.promises.writeFile(destinationPath, Buffer.from(`payload:${url}`))
    },
    getFfmpegPath: () => null
  })

  await service.parseLink({
    url: 'https://www.bilibili.com/bangumi/play/ep1002'
  })

  await service.loadStreamOptions({
    kind: 'episode',
    itemId: 'episode:ep1002'
  })

  const result = await service.startDownload({
    exportMode: 'merge-mp4'
  })

  assert.equal(result.success, false)
  assert.equal(result.error, 'FFmpeg is not available')
  assert.equal(service.getState().taskStage, 'failed')
  assert.equal(
    fsMock.files.get('C:\\Users\\Test\\AppData\\Roaming\\onetool\\bilibili-downloader\\tasks\\1713657600004\\video-track.m4s').toString(),
    'payload:https://cdn.example.com/video.m4s'
  )
  assert.equal(
    fsMock.files.get('C:\\Users\\Test\\AppData\\Roaming\\onetool\\bilibili-downloader\\tasks\\1713657600004\\audio-track.m4s').toString(),
    'payload:https://cdn.example.com/audio.m4s'
  )
})
