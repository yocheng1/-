import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { getDb } from '../db'
import { isExpired, isoFromNow, newId, nowIso } from '../ids'
import { checkRateLimit } from '../rate-limit'
import { sendOtpSms } from './sms'

const OTP_TTL_MS = 5 * 60 * 1000 // 驗證碼 5 分鐘有效
const MAX_ATTEMPTS = 5 // 同一組驗證碼最多試 5 次
const SEND_LIMIT = 5 // 同一支手機 1 小時最多 5 則
const SEND_WINDOW_MS = 60 * 60 * 1000

function hashCode(phone: string, code: string): string {
  // 把手機號碼一起 hash，避免同一組驗證碼可以跨號碼重用
  return createHash('sha256').update(`${phone}:${code}`).digest('hex')
}

function generateCode(): string {
  // randomInt 用的是 CSPRNG，不是 Math.random
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export type RequestOtpResult =
  | { ok: true; devCode?: string }
  | { ok: false; error: string; retryAfterSeconds?: number }

export async function requestOtp(phone: string): Promise<RequestOtpResult> {
  const limit = checkRateLimit(`otp:send:${phone}`, SEND_LIMIT, SEND_WINDOW_MS)
  if (!limit.allowed) {
    return {
      ok: false,
      error: `驗證碼傳送太頻繁，請於 ${Math.ceil(limit.retryAfterSeconds / 60)} 分鐘後再試。`,
      retryAfterSeconds: limit.retryAfterSeconds,
    }
  }

  const db = getDb()

  // 重新索取時讓舊的驗證碼立刻失效，避免多組同時有效
  db.prepare(
    `UPDATE otp_codes SET consumed_at = ?
     WHERE destination = ? AND purpose = 'login' AND consumed_at IS NULL`,
  ).run(nowIso(), phone)

  const code = generateCode()
  db.prepare(
    `INSERT INTO otp_codes (id, destination, purpose, code_hash, expires_at, created_at)
     VALUES (?, ?, 'login', ?, ?, ?)`,
  ).run(newId(), phone, hashCode(phone, code), isoFromNow(OTP_TTL_MS), nowIso())

  await sendOtpSms(phone, code)

  return { ok: true, devCode: code }
}

export type VerifyOtpResult = { ok: true } | { ok: false; error: string }

export function verifyOtp(phone: string, code: string): VerifyOtpResult {
  const db = getDb()

  const row = db
    .prepare(
      `SELECT id, code_hash, expires_at, attempts FROM otp_codes
       WHERE destination = ? AND purpose = 'login' AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(phone) as
    | { id: string; code_hash: string; expires_at: string; attempts: number }
    | undefined

  if (!row) {
    return { ok: false, error: '請先索取驗證碼。' }
  }

  if (isExpired(row.expires_at)) {
    db.prepare('UPDATE otp_codes SET consumed_at = ? WHERE id = ?').run(nowIso(), row.id)
    return { ok: false, error: '驗證碼已過期，請重新索取。' }
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    db.prepare('UPDATE otp_codes SET consumed_at = ? WHERE id = ?').run(nowIso(), row.id)
    return { ok: false, error: '錯誤次數過多，請重新索取驗證碼。' }
  }

  // 先記下這次嘗試，就算後面比對失敗也已經扣掉一次機會
  db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id)

  const expected = Buffer.from(row.code_hash, 'hex')
  const actual = Buffer.from(hashCode(phone, code), 'hex')
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual)

  if (!matches) {
    const remaining = MAX_ATTEMPTS - row.attempts - 1
    return {
      ok: false,
      error:
        remaining > 0
          ? `驗證碼不正確，還可以試 ${remaining} 次。`
          : '驗證碼不正確，請重新索取驗證碼。',
    }
  }

  // 成功後立刻作廢，確保一組驗證碼只能用一次
  db.prepare('UPDATE otp_codes SET consumed_at = ? WHERE id = ?').run(nowIso(), row.id)
  return { ok: true }
}

/** 清掉過期或已使用的驗證碼。 */
export function pruneOtpCodes(): void {
  getDb()
    .prepare('DELETE FROM otp_codes WHERE expires_at <= ? OR consumed_at IS NOT NULL')
    .run(nowIso())
}
