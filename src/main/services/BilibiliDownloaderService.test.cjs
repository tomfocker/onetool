const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function createFsMock(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles))

  return {
    existsSync(filePath) {
      return files.has(filePath)
    },
    mkdirSync() {
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
    promises: {
      async writeFile(filePath, content) {
        files.set(filePath, content)
      }
    },
    files
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
        const resolvedPath = path.resolve(path.dirname(filePath), specifier)
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
      }
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
