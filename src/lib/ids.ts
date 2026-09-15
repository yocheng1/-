import { randomBytes, randomUUID } from 'node:crypto'

/** 資料表主鍵。用 UUID v4，避免猜測與碰撞。 */
export function newId(): string {
  return randomUUID()
}

/** 高熵的隨機 token，用於 session / OAuth state。 */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function isoFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString()
}

export function isExpired(iso: string, at: Date = new Date()): boolean {
  return new Date(iso).getTime() <= at.getTime()
}
