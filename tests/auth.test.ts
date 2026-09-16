import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { useTempDatabase, silenceConsole } from './helpers.ts'

const { cleanup } = useTempDatabase()
const restoreConsole = silenceConsole()

const { normalizePhone, formatPhone } = await import('../src/lib/validation.ts')
const { hashPassword, verifyPassword } = await import('../src/lib/auth/password.ts')
const { requestOtp, verifyOtp } = await import('../src/lib/auth/otp.ts')
const { findOrCreateUserByPhone, findOrCreateUserByIdentity, createUser } = await import(
  '../src/lib/repo/users.ts'
)

after(() => {
  restoreConsole()
  cleanup()
})

describe('手機號碼正規化', () => {
  it('接受各種台灣手機格式並轉成 E.164', () => {
    assert.equal(normalizePhone('0912345678'), '+886912345678')
    assert.equal(normalizePhone('0912-345-678'), '+886912345678')
    assert.equal(normalizePhone('0912 345 678'), '+886912345678')
    assert.equal(normalizePhone('+886912345678'), '+886912345678')
    assert.equal(normalizePhone('886912345678'), '+886912345678')
  })

  it('拒絕格式不正確的號碼', () => {
    assert.equal(normalizePhone('0212345678'), null, '市話應被拒絕')
    assert.equal(normalizePhone('091234567'), null, '位數不足')
    assert.equal(normalizePhone('09123456789'), null, '位數過多')
    assert.equal(normalizePhone('abcdefghij'), null)
    assert.equal(normalizePhone(''), null)
  })

  it('顯示時轉回 09 開頭', () => {
    assert.equal(formatPhone('+886912345678'), '0912345678')
  })
})

describe('密碼雜湊', () => {
  it('雜湊後可以驗證成功', async () => {
    const hash = await hashPassword('hunter2password')
    assert.ok(await verifyPassword('hunter2password', hash))
  })

  it('密碼錯誤時驗證失敗', async () => {
    const hash = await hashPassword('hunter2password')
    assert.equal(await verifyPassword('wrongpassword', hash), false)
  })

  it('相同密碼每次產生不同雜湊（salt 有效）', async () => {
    const a = await hashPassword('samepassword1')
    const b = await hashPassword('samepassword1')
    assert.notEqual(a, b)
    assert.ok(await verifyPassword('samepassword1', a))
    assert.ok(await verifyPassword('samepassword1', b))
  })

  it('雜湊字串損壞時不會丟例外，只回傳 false', async () => {
    assert.equal(await verifyPassword('x', 'not-a-valid-hash'), false)
    assert.equal(await verifyPassword('x', 'scrypt$abc'), false)
  })
})

describe('手機 OTP', () => {
  it('正確的驗證碼可以通過', async () => {
    const phone = '+886900000001'
    const result = await requestOtp(phone)
    assert.ok(result.ok && result.devCode)
    assert.equal(verifyOtp(phone, result.devCode!).ok, true)
  })

  it('同一組驗證碼只能用一次', async () => {
    const phone = '+886900000002'
    const result = await requestOtp(phone)
    assert.ok(result.ok && result.devCode)
    assert.equal(verifyOtp(phone, result.devCode!).ok, true)

    const second = verifyOtp(phone, result.devCode!)
    assert.equal(second.ok, false)
  })

  it('驗證碼不能跨手機號碼使用', async () => {
    const phoneA = '+886900000003'
    const phoneB = '+886900000004'
    const result = await requestOtp(phoneA)
    assert.ok(result.ok && result.devCode)

    const crossUse = verifyOtp(phoneB, result.devCode!)
    assert.equal(crossUse.ok, false)
  })

  it('重新索取驗證碼會讓舊的失效', async () => {
    const phone = '+886900000005'
    const first = await requestOtp(phone)
    assert.ok(first.ok && first.devCode)
    const second = await requestOtp(phone)
    assert.ok(second.ok && second.devCode)

    assert.equal(verifyOtp(phone, first.devCode!).ok, false, '舊驗證碼應失效')
    assert.equal(verifyOtp(phone, second.devCode!).ok, true, '新驗證碼應有效')
  })

  it('連續輸入錯誤 5 次後該組驗證碼作廢', async () => {
    const phone = '+886900000006'
    const result = await requestOtp(phone)
    assert.ok(result.ok && result.devCode)

    for (let i = 0; i < 5; i++) {
      assert.equal(verifyOtp(phone, '000000').ok, false)
    }
    // 即使輸入正確的驗證碼也不再接受
    assert.equal(verifyOtp(phone, result.devCode!).ok, false)
  })

  it('同一支手機發送次數超過上限會被擋下', async () => {
    const phone = '+886900000007'
    for (let i = 0; i < 5; i++) {
      assert.equal((await requestOtp(phone)).ok, true)
    }
    const blocked = await requestOtp(phone)
    assert.equal(blocked.ok, false)
  })
})

describe('使用者帳號', () => {
  it('手機登入時自動建立帳號，第二次登入沿用同一個帳號', () => {
    const phone = '+886911111111'
    const first = findOrCreateUserByPhone(phone)
    const second = findOrCreateUserByPhone(phone)
    assert.equal(first.id, second.id)
    assert.ok(first.phoneVerifiedAt)
  })

  it('ADMIN_EMAILS 中的 email 自動取得管理員權限', () => {
    const admin = createUser({ email: 'admin@kplushelmet.com', emailVerified: true })
    assert.equal(admin.role, 'admin')

    const normal = createUser({ email: 'rider@example.com', emailVerified: true })
    assert.equal(normal.role, 'user')
  })

  it('LINE 登入時若 email 已存在則綁到既有帳號，不會產生重複帳號', () => {
    const existing = createUser({ email: 'shared@example.com', emailVerified: true })

    const viaLine = findOrCreateUserByIdentity({
      provider: 'line',
      providerUserId: 'U-line-001',
      displayName: '小明',
      verifiedEmail: 'shared@example.com',
    })
    assert.equal(viaLine.id, existing.id, '應綁到既有帳號')

    // 同一個 LINE 帳號再次登入仍是同一個 user
    const again = findOrCreateUserByIdentity({
      provider: 'line',
      providerUserId: 'U-line-001',
      displayName: '小明',
    })
    assert.equal(again.id, existing.id)
  })

  it('LINE 登入沒有 email 時建立新帳號', () => {
    const user = findOrCreateUserByIdentity({
      provider: 'line',
      providerUserId: 'U-line-002',
      displayName: '小華',
    })
    assert.ok(user.id)
    assert.equal(user.name, '小華')
  })
})
