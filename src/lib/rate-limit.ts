import { getDb } from './db'
import { nowIso } from './ids'

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

/**
 * 固定視窗的次數限制，狀態存在 SQLite 裡（重啟後仍然有效）。
 *
 * 用來擋：同一支手機狂發驗證碼、對同一個帳號暴力試密碼。
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const db = getDb()
  const now = Date.now()

  const row = db
    .prepare('SELECT count, window_start FROM rate_limits WHERE key = ?')
    .get(key) as { count: number; window_start: string } | undefined

  const windowStart = row ? new Date(row.window_start).getTime() : 0
  const windowExpired = !row || now - windowStart >= windowMs

  if (windowExpired) {
    db.prepare(
      `INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)
       ON CONFLICT (key) DO UPDATE SET count = 1, window_start = excluded.window_start`,
    ).run(key, nowIso())
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 }
  }

  if (row.count >= limit) {
    const retryAfterMs = windowStart + windowMs - now
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    }
  }

  db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').run(key)
  return { allowed: true, remaining: limit - row.count - 1, retryAfterSeconds: 0 }
}

/** 登入成功後清掉該帳號的失敗計數。 */
export function resetRateLimit(key: string): void {
  getDb().prepare('DELETE FROM rate_limits WHERE key = ?').run(key)
}
