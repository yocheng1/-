import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { getDb } from '../db'
import { isoFromNow, nowIso, randomToken } from '../ids'
import type { User } from '../repo/users'
import { findUserById } from '../repo/users'

export const SESSION_COOKIE = 'kplus_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 天

/** cookie 裡放明文 token，資料庫只存 hash。 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createSession(userId: string): { token: string; expiresAt: string } {
  const token = randomToken(32)
  const expiresAt = isoFromNow(SESSION_TTL_MS)

  getDb()
    .prepare(
      'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    )
    .run(hashToken(token), userId, expiresAt, nowIso())

  return { token, expiresAt }
}

export function destroySession(token: string): void {
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
}

/** 順手清掉過期的 session，省得另外跑排程。 */
export function pruneExpiredSessions(): void {
  getDb().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso())
}

export function userForToken(token: string): User | null {
  const row = getDb()
    .prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
    .get(hashToken(token)) as { user_id: string; expires_at: string } | undefined

  if (!row) return null

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    destroySession(token)
    return null
  }

  return findUserById(row.user_id)
}

// ------------------------------------------------------- Next.js cookie 整合

export async function setSessionCookie(token: string, expiresAt: string): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt),
  })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

/** 目前登入的使用者，未登入回傳 null。 */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  return userForToken(token)
}

/** 登入後建立 session 並寫入 cookie。 */
export async function signIn(userId: string): Promise<void> {
  const { token, expiresAt } = createSession(userId)
  await setSessionCookie(token, expiresAt)
}

export async function signOut(): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) destroySession(token)
  await clearSessionCookie()
}
