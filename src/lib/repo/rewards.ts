import { getDb, transaction } from '../db'
import { newId, nowIso } from '../ids'

/** 集滿幾場換一次。 */
export const REWARD_THRESHOLD = Number(process.env.REWARD_THRESHOLD ?? 3)

/** 限定兌換門市。 */
export const REWARD_STORE = process.env.REWARD_STORE ?? '林口文化門市'

/**
 * 工作人員的兌換密碼。
 * 放在環境變數，門市人員輸入後才會真的核銷 —— 避免使用者自己按掉。
 */
function staffPin(): string {
  return process.env.STAFF_PIN ?? '0000'
}

export type RewardStatus = {
  /** 已結束活動的有效報名場次 */
  qualifying: number
  /** 依門檻換算共可獲得幾杯 */
  earned: number
  /** 已經兌換幾杯 */
  redeemed: number
  /** 現在可以兌換幾杯 */
  available: number
  /** 距離下一杯還差幾場 */
  toNext: number
  threshold: number
  store: string
  history: { id: string; store: string; redeemedAt: string }[]
}

/**
 * 計算集點狀態。
 *
 * 只算「活動已經結束」的有效報名 —— 若把未來的活動也算進去，
 * 使用者可以先報三場還沒發生的活動、換完咖啡再全部取消。
 */
export function getRewardStatus(userId: string): RewardStatus {
  const db = getDb()

  const qualifying = (
    db
      .prepare(
        `SELECT COUNT(*) AS n
         FROM registrations r
         JOIN events e ON e.id = r.event_id
         WHERE r.user_id = ?
           AND r.status <> 'cancelled'
           AND e.ends_at <= ?`,
      )
      .get(userId, nowIso()) as { n: number }
  ).n

  const history = db
    .prepare(
      `SELECT id, store, redeemed_at AS redeemedAt FROM rewards
       WHERE user_id = ? ORDER BY redeemed_at DESC`,
    )
    .all(userId) as { id: string; store: string; redeemedAt: string }[]

  const earned = Math.floor(qualifying / REWARD_THRESHOLD)
  const redeemed = history.length

  return {
    qualifying,
    earned,
    redeemed,
    available: Math.max(0, earned - redeemed),
    toNext: (REWARD_THRESHOLD - (qualifying % REWARD_THRESHOLD)) % REWARD_THRESHOLD,
    threshold: REWARD_THRESHOLD,
    store: REWARD_STORE,
    history,
  }
}

export type RedeemResult =
  | { ok: true; store: string; remaining: number }
  | { ok: false; error: string }

/**
 * 核銷一次獎勵。必須由工作人員輸入密碼才會成功。
 *
 * 包在交易裡重新計算一次可兌換數量，避免同一個人在兩台裝置上同時按下兌換。
 */
export function redeemReward(userId: string, pin: string): RedeemResult {
  if (String(pin || '').trim() !== staffPin()) {
    return { ok: false, error: '工作人員密碼不正確。' }
  }

  return transaction((db): RedeemResult => {
    const qualifying = (
      db
        .prepare(
          `SELECT COUNT(*) AS n
           FROM registrations r
           JOIN events e ON e.id = r.event_id
           WHERE r.user_id = ? AND r.status <> 'cancelled' AND e.ends_at <= ?`,
        )
        .get(userId, nowIso()) as { n: number }
    ).n

    const redeemed = (
      db.prepare('SELECT COUNT(*) AS n FROM rewards WHERE user_id = ?').get(userId) as {
        n: number
      }
    ).n

    const available = Math.floor(qualifying / REWARD_THRESHOLD) - redeemed
    if (available <= 0) {
      return { ok: false, error: '目前沒有可兌換的獎勵。' }
    }

    db.prepare(
      `INSERT INTO rewards (id, user_id, type, store, qualifying_count, redeemed_at)
       VALUES (?, ?, 'coffee', ?, ?, ?)`,
    ).run(newId(), userId, REWARD_STORE, qualifying, nowIso())

    return { ok: true, store: REWARD_STORE, remaining: available - 1 }
  })
}
