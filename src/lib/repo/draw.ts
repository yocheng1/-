import { createHash } from 'node:crypto'
import { getDb, transaction } from '../db'
import { newId, nowIso, randomToken } from '../ids'

export type Prize = {
  id: string
  eventId: string
  name: string
  description: string
  imageUrl: string | null
  quantity: number
  isBonus: boolean
  sortOrder: number
  drawSeed: string | null
  drawnAt: string | null
  createdAt: string
  updatedAt: string
}

export type Winner = {
  id: string
  prizeId: string
  eventId: string
  registrationId: string
  name: string
  phone: string
  rank: number
  createdAt: string
}

type PrizeRow = {
  id: string
  event_id: string
  name: string
  description: string
  image_url: string | null
  quantity: number
  is_bonus: number
  sort_order: number
  draw_seed: string | null
  drawn_at: string | null
  created_at: string
  updated_at: string
}

type WinnerRow = {
  id: string
  prize_id: string
  event_id: string
  registration_id: string
  name: string
  phone: string
  rank: number
  created_at: string
}

const toPrize = (r: PrizeRow): Prize => ({
  id: r.id,
  eventId: r.event_id,
  name: r.name,
  description: r.description,
  imageUrl: r.image_url,
  quantity: r.quantity,
  isBonus: r.is_bonus === 1,
  sortOrder: r.sort_order,
  drawSeed: r.draw_seed,
  drawnAt: r.drawn_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

const toWinner = (r: WinnerRow): Winner => ({
  id: r.id,
  prizeId: r.prize_id,
  eventId: r.event_id,
  registrationId: r.registration_id,
  name: r.name,
  phone: r.phone,
  rank: r.rank,
  createdAt: r.created_at,
})

// ---------------------------------------------------------------- 獎項

export function listPrizes(eventId: string): Prize[] {
  return (
    getDb()
      .prepare('SELECT * FROM prizes WHERE event_id = ? ORDER BY sort_order ASC, created_at ASC')
      .all(eventId) as PrizeRow[]
  ).map(toPrize)
}

export function findPrize(id: string): Prize | null {
  const row = getDb().prepare('SELECT * FROM prizes WHERE id = ?').get(id) as
    | PrizeRow
    | undefined
  return row ? toPrize(row) : null
}

export type PrizeInput = {
  name: string
  description?: string
  imageUrl?: string | null
  quantity: number
  isBonus?: boolean
}

export function createPrize(eventId: string, input: PrizeInput): Prize {
  const id = newId()
  const now = nowIso()

  const next = getDb()
    .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM prizes WHERE event_id = ?')
    .get(eventId) as { n: number }

  getDb()
    .prepare(
      `INSERT INTO prizes
         (id, event_id, name, description, image_url, quantity, is_bonus, sort_order,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      eventId,
      input.name.trim(),
      (input.description ?? '').trim(),
      input.imageUrl || null,
      Math.max(1, Math.floor(input.quantity)),
      input.isBonus ? 1 : 0,
      next.n,
      now,
      now,
    )

  return findPrize(id)!
}

export function deletePrize(id: string): void {
  getDb().prepare('DELETE FROM prizes WHERE id = ?').run(id)
}

// ---------------------------------------------------------------- 中獎者

export function listWinners(eventId: string): Winner[] {
  return (
    getDb()
      .prepare('SELECT * FROM winners WHERE event_id = ? ORDER BY created_at ASC, rank ASC')
      .all(eventId) as WinnerRow[]
  ).map(toWinner)
}

export function listPrizeWinners(prizeId: string): Winner[] {
  return (
    getDb()
      .prepare('SELECT * FROM winners WHERE prize_id = ? ORDER BY rank ASC')
      .all(prizeId) as WinnerRow[]
  ).map(toWinner)
}

/** 還沒中過獎的報名者 —— 一場活動每個人最多中一次。 */
export function listEligible(eventId: string): { id: string; name: string; phone: string }[] {
  return getDb()
    .prepare(
      `SELECT r.id, r.name, r.phone
       FROM registrations r
       WHERE r.event_id = ?
         AND r.status = 'confirmed'
         AND r.id NOT IN (SELECT registration_id FROM winners WHERE event_id = ?)
       ORDER BY r.created_at ASC`,
    )
    .all(eventId, eventId) as { id: string; name: string; phone: string }[]
}

// ---------------------------------------------------------------- 抽獎

export type DrawResult =
  | { ok: true; winners: Winner[]; seed: string; poolSize: number }
  | { ok: false; error: string }

/**
 * 抽出某個獎項的中獎者。
 *
 * 公平性：不用 Math.random() 決定順序，而是用
 *     排序鍵 = SHA256(種子 + ':' + 報名編號)
 * 由小到大排序後取前 N 名。種子在開抽時產生並存進獎項資料，
 * 事後公開種子，任何人都能自己重算一次驗證名單沒有被動過手腳。
 *
 * 整段包在交易裡：抽獎當下沒有人能插進來改報名資料或中獎名單。
 */
export function drawPrize(prizeId: string): DrawResult {
  return transaction((db): DrawResult => {
    const prizeRow = db.prepare('SELECT * FROM prizes WHERE id = ?').get(prizeId) as
      | PrizeRow
      | undefined
    if (!prizeRow) return { ok: false, error: '找不到這個獎項。' }

    const prize = toPrize(prizeRow)
    if (prize.drawnAt) return { ok: false, error: '這個獎項已經抽過了。' }

    const pool = db
      .prepare(
        `SELECT r.id, r.name, r.phone
         FROM registrations r
         WHERE r.event_id = ?
           AND r.status = 'confirmed'
           AND r.id NOT IN (SELECT registration_id FROM winners WHERE event_id = ?)`,
      )
      .all(prize.eventId, prize.eventId) as { id: string; name: string; phone: string }[]

    if (pool.length === 0) {
      return { ok: false, error: '沒有可抽獎的參加者了（所有人都已中獎或沒有人報名）。' }
    }

    const seed = randomToken(16)

    const ordered = pool
      .map((entry) => ({
        entry,
        key: createHash('sha256').update(`${seed}:${entry.id}`).digest('hex'),
      }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

    // 參加者不足時就抽出剩下的全部，不會失敗
    const picked = ordered.slice(0, Math.min(prize.quantity, ordered.length))
    const now = nowIso()

    const insert = db.prepare(
      `INSERT INTO winners
         (id, prize_id, event_id, registration_id, name, phone, rank, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    const winners: Winner[] = picked.map((item, index) => {
      const id = newId()
      insert.run(
        id,
        prize.id,
        prize.eventId,
        item.entry.id,
        item.entry.name,
        item.entry.phone,
        index + 1,
        now,
      )
      return {
        id,
        prizeId: prize.id,
        eventId: prize.eventId,
        registrationId: item.entry.id,
        name: item.entry.name,
        phone: item.entry.phone,
        rank: index + 1,
        createdAt: now,
      }
    })

    db.prepare('UPDATE prizes SET draw_seed = ?, drawn_at = ?, updated_at = ? WHERE id = ?')
      .run(seed, now, now, prize.id)

    return { ok: true, winners, seed, poolSize: pool.length }
  })
}

/**
 * 用公開的種子重算一次，核對中獎名單沒有被竄改。
 *
 * 注意：驗算用的參加者名單是「當時可抽的人」，也就是
 * 目前報名成功、且不在這個獎項之前已中獎名單裡的人。
 */
export function verifyPrizeDraw(prizeId: string): {
  ok: boolean
  reason?: string
  seed?: string
  expected?: string[]
  actual?: string[]
} {
  const prize = findPrize(prizeId)
  if (!prize) return { ok: false, reason: '找不到這個獎項。' }
  if (!prize.drawnAt || !prize.drawSeed) return { ok: false, reason: '這個獎項尚未抽獎。' }

  const db = getDb()

  // 重建當時的候選池：這次的中獎者 + 目前仍可抽的人
  const thisPrizeWinners = listPrizeWinners(prizeId)
  const stillEligible = db
    .prepare(
      `SELECT r.id FROM registrations r
       WHERE r.event_id = ? AND r.status = 'confirmed'
         AND r.id NOT IN (SELECT registration_id FROM winners WHERE event_id = ?)`,
    )
    .all(prize.eventId, prize.eventId) as { id: string }[]

  const poolIds = thisPrizeWinners
    .map((w) => w.registrationId)
    .concat(stillEligible.map((r) => r.id))

  const recomputed = poolIds
    .map((id) => ({
      id,
      key: createHash('sha256').update(`${prize.drawSeed}:${id}`).digest('hex'),
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, Math.min(prize.quantity, poolIds.length))
    .map((x) => x.id)

  const actual = thisPrizeWinners.map((w) => w.registrationId)

  return {
    ok: recomputed.length === actual.length && recomputed.every((id, i) => id === actual[i]),
    seed: prize.drawSeed,
    expected: recomputed,
    actual,
  }
}

/** 重抽用：清掉某個獎項的中獎紀錄。 */
export function resetPrizeDraw(prizeId: string): void {
  transaction((db) => {
    db.prepare('DELETE FROM winners WHERE prize_id = ?').run(prizeId)
    db.prepare('UPDATE prizes SET draw_seed = NULL, drawn_at = NULL, updated_at = ? WHERE id = ?')
      .run(nowIso(), prizeId)
  })
}
