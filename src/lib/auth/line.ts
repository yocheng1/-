import { createHmac, timingSafeEqual } from 'node:crypto'
import { getDb } from '../db'
import { env } from '../env'
import { isExpired, isoFromNow, nowIso, randomToken } from '../ids'

const AUTHORIZE_URL = 'https://access.line.me/oauth2/v2.1/authorize'
const TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token'
const EXPECTED_ISSUER = 'https://access.line.me'
const STATE_TTL_MS = 10 * 60 * 1000

export function isLineConfigured(): boolean {
  return env.line !== null
}

/**
 * 產生 LINE 授權網址。
 * state 與 nonce 都存進資料庫，回呼時比對，用來擋 CSRF 與 replay。
 */
export function buildLineAuthorizationUrl(redirectTo?: string): string {
  const config = env.line
  if (!config) throw new Error('尚未設定 LINE Login，請填入 LINE_CHANNEL_ID / LINE_CHANNEL_SECRET。')

  const state = randomToken(24)
  const nonce = randomToken(24)

  getDb()
    .prepare(
      'INSERT INTO oauth_states (state, nonce, redirect_to, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(state, nonce, redirectTo ?? null, isoFromNow(STATE_TTL_MS), nowIso())

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.channelId,
    redirect_uri: config.redirectUri,
    state,
    scope: 'openid profile email',
    nonce,
  })

  return `${AUTHORIZE_URL}?${params.toString()}`
}

export type ConsumedState = { nonce: string; redirectTo: string | null }

/** state 一律用過即刪，確保不能重放。 */
export function consumeLineState(state: string): ConsumedState | null {
  const db = getDb()
  const row = db
    .prepare('SELECT nonce, redirect_to, expires_at FROM oauth_states WHERE state = ?')
    .get(state) as { nonce: string; redirect_to: string | null; expires_at: string } | undefined

  if (!row) return null
  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state)

  if (isExpired(row.expires_at)) return null
  return { nonce: row.nonce, redirectTo: row.redirect_to }
}

export type LineProfile = {
  providerUserId: string
  displayName: string | null
  pictureUrl: string | null
  email: string | null
}

export async function exchangeLineCode(code: string): Promise<{ idToken: string }> {
  const config = env.line
  if (!config) throw new Error('尚未設定 LINE Login。')

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.channelId,
      client_secret: config.channelSecret,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`LINE token 交換失敗 (${response.status}): ${detail}`)
  }

  const data = (await response.json()) as { id_token?: string }
  if (!data.id_token) throw new Error('LINE 未回傳 id_token，請確認 channel 已開啟 OpenID Connect。')
  return { idToken: data.id_token }
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url')
}

/**
 * 驗證 LINE 的 id_token。
 *
 * LINE Login v2.1 的 id_token 是用 channel secret 以 HS256 簽章，
 * 所以可以本地驗章，不必再打一次 API。
 * 除了簽章外，也檢查 iss / aud / exp / nonce —— 少一項都可能被冒用。
 */
export function verifyLineIdToken(idToken: string, expectedNonce: string): LineProfile {
  const config = env.line
  if (!config) throw new Error('尚未設定 LINE Login。')

  const parts = idToken.split('.')
  if (parts.length !== 3) throw new Error('id_token 格式不正確。')

  const [headerB64, payloadB64, signatureB64] = parts

  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as { alg?: string }
  if (header.alg !== 'HS256') {
    throw new Error(`不支援的 id_token 簽章演算法：${header.alg}`)
  }

  const expectedSignature = createHmac('sha256', config.channelSecret)
    .update(`${headerB64}.${payloadB64}`)
    .digest()
  const actualSignature = base64UrlDecode(signatureB64)

  if (
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(expectedSignature, actualSignature)
  ) {
    throw new Error('id_token 簽章驗證失敗。')
  }

  const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as {
    iss?: string
    aud?: string | string[]
    sub?: string
    exp?: number
    nonce?: string
    name?: string
    picture?: string
    email?: string
  }

  if (payload.iss !== EXPECTED_ISSUER) throw new Error('id_token 的發行者不正確。')

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!audiences.includes(config.channelId)) throw new Error('id_token 的對象不是本 channel。')

  if (!payload.exp || payload.exp * 1000 <= Date.now()) throw new Error('id_token 已過期。')

  if (payload.nonce !== expectedNonce) throw new Error('id_token 的 nonce 不相符。')

  if (!payload.sub) throw new Error('id_token 缺少使用者識別碼。')

  return {
    providerUserId: payload.sub,
    displayName: payload.name ?? null,
    pictureUrl: payload.picture ?? null,
    // LINE 只在使用者同意 email 權限時才會帶，且該 email 已由 LINE 驗證過
    email: payload.email ? payload.email.toLowerCase() : null,
  }
}

/** 清掉過期的 OAuth state。 */
export function pruneOauthStates(): void {
  getDb().prepare('DELETE FROM oauth_states WHERE expires_at <= ?').run(nowIso())
}
